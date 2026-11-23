//! Optional HTTPS adapter for the existing SQLite owner. This protocol exposes saved,
//! managed resources only. Neither workspace paths nor desktop commands enter the router.
mod access;
mod browser;
mod browser_organization;
pub(crate) use browser::initialize as initialize_browser;
mod companion;
mod companion_exports;
mod collected;
pub use collected::CollectedRestore;
mod pairing;
mod mobile;
mod owner_browser;
#[cfg(test)]
mod tests;
mod transport;
#[cfg(feature = "desktop")]
mod discovery;

use crate::{domain::Request, worker::Storage};
#[cfg(all(windows, feature = "desktop"))]
pub use access::automatic::Authority;
use access::Grant;
pub use access::Identity;
use axum::{
    body::Body,
    extract::{ConnectInfo, DefaultBodyLimit, Path as RoutePath, Query, State},
    http::{header, HeaderMap, StatusCode},
    response::{IntoResponse, Response},
    routing::{get, post, put},
    Json, Router,
};
use axum_server::{tls_rustls::RustlsConfig, Handle};
use serde::Deserialize;
use serde_json::{json, Value};
use std::{
    io,
    net::{IpAddr, SocketAddr},
    path::PathBuf,
    sync::{Arc, Mutex},
    time::Duration,
};
use tokio::{
    io::{AsyncReadExt, AsyncSeekExt},
    sync::Semaphore,
};
use tokio_util::sync::CancellationToken;
use uuid::Uuid;

type ApiResult<T> = Result<T, StatusCode>;

#[derive(Clone)]
pub struct Host {
    storage: Storage,
    root: Arc<PathBuf>,
    access: Arc<PathBuf>,
    identity: Arc<Identity>,
    workspace: Uuid,
    enrollment: Arc<Mutex<pairing::Pairing>>,
    mobile_checkpoints: Arc<Mutex<mobile::Checkpoints>>,
    companion_exports: companion_exports::Exports,
    requests: Arc<Semaphore>,
    updates: Arc<Semaphore>,
    streams: Arc<Semaphore>,
    access_changed: tokio::sync::watch::Sender<()>,
    management_changed: tokio::sync::watch::Sender<u64>,
    owner_browser: Arc<owner_browser::OwnerBrowser>,
    stop: CancellationToken,
}

pub struct Listener {
    address: SocketAddr,
    handle: Handle<SocketAddr>,
    stop: CancellationToken,
    task: Option<tokio::task::JoinHandle<io::Result<()>>>,
    #[cfg(feature = "desktop")]
    advertisement: Option<discovery::Advertisement>,
    #[cfg(all(windows, feature = "desktop"))]
    certificates: Option<tokio::sync::watch::Receiver<CertificateStatus>>,
    #[cfg(all(windows, feature = "desktop"))]
    maintenance: Option<tokio::task::JoinHandle<()>>,
}

#[cfg(all(windows, feature = "desktop"))]
#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CertificateStatus {
    expires_at: i64,
    renewal_failed: bool,
}

impl Listener {
    #[cfg(feature = "desktop")]
    pub fn discoverable(&self) -> bool {
        self.advertisement.is_some()
    }

    #[cfg(feature = "desktop")]
    pub fn set_discoverable(&mut self, enabled: bool, host: Uuid) -> Result<(), String> {
        if enabled && self.advertisement.is_none() {
            self.advertisement = Some(discovery::Advertisement::start(self.address, host)?);
        } else if !enabled {
            self.advertisement = None;
        }
        Ok(())
    }

    pub fn address(&self) -> SocketAddr {
        self.address
    }

    pub fn running(&self) -> bool {
        self.task.as_ref().is_some_and(|task| !task.is_finished())
    }

    #[cfg(all(windows, feature = "desktop"))]
    pub fn certificate_status(&self) -> Option<CertificateStatus> {
        self.certificates
            .as_ref()
            .map(|value| value.borrow().clone())
    }

    pub async fn stop(mut self) -> io::Result<()> {
        #[cfg(feature = "desktop")]
        drop(self.advertisement.take());
        self.stop.cancel();
        self.handle.shutdown();
        #[cfg(all(windows, feature = "desktop"))]
        if let Some(task) = self.maintenance.take() {
            task.await?;
        }
        self.task.take().unwrap().await?
    }
}

impl Drop for Listener {
    fn drop(&mut self) {
        self.stop.cancel();
        self.handle.shutdown();
        #[cfg(all(windows, feature = "desktop"))]
        if let Some(task) = self.maintenance.take() {
            task.abort();
        }
    }
}

impl Host {
    pub fn host_id(&self) -> Uuid {
        self.identity.id
    }

    pub fn management_events(&self) -> tokio::sync::watch::Receiver<u64> {
        self.management_changed.subscribe()
    }

    fn management_changed(&self) {
        self.management_changed.send_modify(|revision| *revision = revision.wrapping_add(1));
    }

    pub fn workspace_id(&self) -> Uuid {
        self.workspace
    }

    pub fn fingerprint(&self) -> &str {
        &self.identity.fingerprint
    }

    pub async fn new(storage: Storage, root: PathBuf, identity: Identity) -> Result<Self, String> {
        let root = root.canonicalize().map_err(crate::domain::error)?;
        let access = identity.directory().to_owned();
        if access.starts_with(&root) || root.starts_with(&access) {
            return Err(
                "Keep the private host access directory separate from workspace storage".into(),
            );
        }
        let workspace = storage
            .call_host(&root, |w| Ok(json!(w.review_generation()?)))
            .await?;
        let workspace = serde_json::from_value(workspace).map_err(crate::domain::error)?;
        Ok(Self {
            storage,
            root: root.into(),
            access: access.into(),
            workspace,
            enrollment: Arc::default(),
            mobile_checkpoints: Arc::default(),
            companion_exports: Arc::default(),
            identity: identity.into(),
            requests: Arc::new(Semaphore::new(24)),
            updates: Arc::new(Semaphore::new(2)),
            streams: Arc::new(Semaphore::new(16)),
            access_changed: tokio::sync::watch::Sender::new(()),
            management_changed: tokio::sync::watch::Sender::new(0),
            owner_browser: Arc::default(),
            stop: CancellationToken::new(),
        })
    }

    /// Owner-only operations. Call only from the local process, never from the network router.
    pub fn owner_command(&self, command: &str) -> Result<Value, String> {
        if let Some(command) = command.trim().strip_prefix("zip ") {
            let mut parts = command.splitn(3, ' ');
            let action = parts.next().unwrap_or_default();
            let id = parts.next().map(str::parse::<Uuid>).transpose().map_err(crate::domain::error)?;
            let destination = parts.next().map(PathBuf::from);
            return self.workspace_zip_owner(action, id, destination);
        }
        let mut pending = self.enrollment.lock().map_err(crate::domain::error)?;
        match command.split_whitespace().collect::<Vec<_>>().as_slice() {
            ["pending"] => Ok(pending.pending()),
            ["devices"] => Ok(json!(access::devices(&self.access, self.workspace).map_err(crate::domain::error)?)),
            ["approve" | "reject", id, code] => {
                pending.decide(&self.access, id.parse().map_err(crate::domain::error)?, code, command.trim_start().starts_with("approve"))?;
                self.management_changed();
                Ok(Value::Null)
            }
            ["grant" | "withdraw", id] => {
                let allow = command.trim_start().starts_with("grant");
                access::set_grant(&self.access, id.parse().map_err(crate::domain::error)?, self.workspace, allow).map_err(crate::domain::error)?;
                self.access_changed.send_replace(());
                self.management_changed();
                Ok(Value::Null)
            }
            ["revoke", id] => {
                let id = id.parse().map_err(crate::domain::error)?;
                access::revoke(&self.access, id).map_err(crate::domain::error)?;
                pending.forget(id);
                self.access_changed.send_replace(());
                self.management_changed();
                Ok(Value::Null)
            }
            _ => Err("Commands: pending, approve ID CODE, reject ID CODE, devices, grant ID, withdraw ID, revoke ID".into()),
        }
    }

    pub async fn listen(
        self,
        address: SocketAddr,
        chain: PathBuf,
        key: PathBuf,
    ) -> io::Result<Listener> {
        let socket = Self::bind(address)?;
        let tls = self.tls(address.ip(), chain, key)?;
        self.serve(socket, tls).await
    }

    #[cfg(all(windows, feature = "desktop"))]
    pub async fn listen_automatic(
        self,
        address: SocketAddr,
        authority: Authority,
    ) -> io::Result<Listener> {
        use time::OffsetDateTime;
        let socket = Self::bind(address)?;
        let ip = address.ip();
        let now = OffsetDateTime::now_utc();
        let (chain, key, mut expires) = authority.issue(ip, now)?;
        let tls = RustlsConfig::from_config(self.tls_config(
            ip,
            chain,
            key,
            rustls::pki_types::UnixTime::now(),
        )?);
        let mut listener = self.clone().serve(socket, tls.clone()).await?;
        let stop = listener.stop.clone();
        let (status, receiver) = tokio::sync::watch::channel(CertificateStatus {
            expires_at: expires.unix_timestamp(),
            renewal_failed: false,
        });
        listener.certificates = Some(receiver);
        listener.maintenance = Some(tokio::spawn(async move {
            // There is no maintenance task while hosting is off.
            let interval = Duration::from_secs(60 * 60);
            loop {
                tokio::select! {
                    _ = stop.cancelled() => break,
                    _ = tokio::time::sleep(interval) => {}
                }
                let now = OffsetDateTime::now_utc();
                if !Authority::needs_renewal(expires, now) {
                    continue;
                }
                let candidate = authority
                    .issue(ip, now)
                    .and_then(|(chain, key, next_expiry)| {
                        self.tls_config(ip, chain, key, rustls::pki_types::UnixTime::now())
                            .map(|config| (config, next_expiry))
                    });
                match candidate {
                    Ok((configuration, next_expiry)) => {
                        tls.reload_from_config(configuration);
                        expires = next_expiry;
                        status.send_replace(CertificateStatus {
                            expires_at: expires.unix_timestamp(),
                            renewal_failed: false,
                        });
                    }
                    Err(_) => {
                        status.send_replace(CertificateStatus {
                            expires_at: expires.unix_timestamp(),
                            renewal_failed: true,
                        });
                    }
                }
            }
        }));
        Ok(listener)
    }

    fn bind(address: SocketAddr) -> io::Result<std::net::TcpListener> {
        if !private(address.ip()) || address.ip().is_unspecified() {
            return Err(io::Error::new(
                io::ErrorKind::InvalidInput,
                "Choose an explicit loopback or private IP address",
            ));
        }
        let socket = std::net::TcpListener::bind(address)?;
        socket.set_nonblocking(true)?;
        Ok(socket)
    }

    async fn serve(self, socket: std::net::TcpListener, tls: RustlsConfig) -> io::Result<Listener> {
        let address = socket.local_addr()?;
        let handle = Handle::new();
        let stop = self.stop.clone();
        let router = Router::new()
            .merge(browser::router())
            .route("/api/access/host", get(descriptor))
            .route("/api/pairings", post(pairing::enroll))
            .route("/api/pairings/{id}", get(pairing::poll))
            .route("/api/pairings/{id}/complete", post(pairing::complete))
            .nest("/api/next/mobile/v1", mobile::router())
            .route("/api/next/v1/workspaces", get(workspaces))
            .route(
                "/api/next/v1/workspaces/{workspace}/resources",
                get(resources),
            )
            .route("/api/next/v1/workspaces/{workspace}/changes", get(changes))
            .route("/api/next/v1/workspaces/{workspace}/notes/{id}", get(note))
            .route("/api/next/v1/workspaces/{workspace}/files/{id}", get(file))
            .route(
                "/api/next/v1/workspaces/{workspace}/resources/{id}/review/{operation}",
                put(submit_review).get(review_receipt),
            )
            .layer(DefaultBodyLimit::max(16 * 1024))
            .layer(axum::middleware::from_fn(enforce_transport))
            .with_state(self);
        let mut server = axum_server::from_tcp_rustls(socket, tls)?
            .map(|acceptor| {
                acceptor
                    .handshake_timeout(Duration::from_secs(5))
                    .acceptor(transport::Connections::new())
            })
            .handle(handle.clone());
        server
            .http_builder()
            .http1()
            .timer(hyper_util::rt::TokioTimer::new())
            .header_read_timeout(Duration::from_secs(8));
        server.http_builder().http2().max_concurrent_streams(24);
        let task = tokio::spawn(async move {
            server
                .serve(router.into_make_service_with_connect_info::<SocketAddr>())
                .await
        });
        let listener = Listener {
            address,
            handle,
            stop,
            task: Some(task),
            #[cfg(feature = "desktop")]
            advertisement: None,
            #[cfg(all(windows, feature = "desktop"))]
            certificates: None,
            #[cfg(all(windows, feature = "desktop"))]
            maintenance: None,
        };
        if tokio::time::timeout(Duration::from_secs(5), listener.handle.listening()).await?
            != Some(address)
        {
            return Err(io::Error::other("HTTPS listener failed to start"));
        }
        Ok(listener)
    }

    fn tls(&self, ip: IpAddr, chain: PathBuf, key: PathBuf) -> io::Result<RustlsConfig> {
        use rustls::pki_types::{pem::PemObject, CertificateDer, PrivateKeyDer, UnixTime};
        let invalid =
            |e: &dyn std::fmt::Display| io::Error::new(io::ErrorKind::InvalidData, e.to_string());
        let certificates = CertificateDer::pem_file_iter(chain)
            .map_err(|e| invalid(&e))?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| invalid(&e))?;
        let key = PrivateKeyDer::from_pem_file(key).map_err(|e| invalid(&e))?;
        Ok(RustlsConfig::from_config(self.tls_config(
            ip,
            certificates,
            key,
            UnixTime::now(),
        )?))
    }

    fn tls_config(
        &self,
        ip: IpAddr,
        certificates: Vec<rustls::pki_types::CertificateDer<'static>>,
        key: rustls::pki_types::PrivateKeyDer<'static>,
        now: rustls::pki_types::UnixTime,
    ) -> io::Result<Arc<rustls::ServerConfig>> {
        use rustls::{
            client::{danger::ServerCertVerifier, WebPkiServerVerifier},
            RootCertStore, ServerConfig,
        };
        let invalid =
            |e: &dyn std::fmt::Display| io::Error::new(io::ErrorKind::InvalidData, e.to_string());
        let Some((leaf, intermediates)) = certificates.split_first() else {
            return Err(io::Error::new(
                io::ErrorKind::InvalidData,
                "Missing server certificate",
            ));
        };
        if intermediates.last() != Some(&self.identity.certificate) {
            return Err(io::Error::new(
                io::ErrorKind::InvalidData,
                "TLS chain must end with the configured host CA",
            ));
        }
        let provider = Arc::new(rustls::crypto::ring::default_provider());
        let mut roots = RootCertStore::empty();
        roots
            .add(self.identity.certificate.clone())
            .map_err(|e| invalid(&e))?;
        let verifier =
            WebPkiServerVerifier::builder_with_provider(Arc::new(roots), provider.clone())
                .build()
                .map_err(|e| invalid(&e))?;
        verifier
            .verify_server_cert(
                leaf,
                &intermediates[..intermediates.len() - 1],
                &ip.into(),
                &[],
                now,
            )
            .map_err(|e| invalid(&e))?;
        let mut tls = ServerConfig::builder_with_provider(provider)
            .with_safe_default_protocol_versions()
            .map_err(|e| invalid(&e))?
            .with_no_client_auth()
            .with_single_cert(certificates, key)
            .map_err(|e| invalid(&e))?;
        tls.alpn_protocols = vec![b"h2".to_vec(), b"http/1.1".to_vec()];
        Ok(Arc::new(tls))
    }

    async fn grant(&self, headers: &HeaderMap) -> ApiResult<Grant> {
        if self.stop.is_cancelled() {
            return Err(StatusCode::SERVICE_UNAVAILABLE);
        }
        let authorization = headers
            .get(header::AUTHORIZATION)
            .and_then(|v| v.to_str().ok())
            .ok_or(StatusCode::UNAUTHORIZED)?;
        if let Some(credential) = authorization.strip_prefix(browser::INTERNAL_AUTH) {
            return access::authenticate(&self.access, credential, true).await;
        }
        if let Some(credential) = authorization.strip_prefix(owner_browser::INTERNAL_AUTH) {
            let session = self.owner_browser.session(credential)?;
            return Ok(Grant::local_owner(self.host_id(), self.workspace, session));
        }
        let credential = authorization.strip_prefix("Bearer ").ok_or(StatusCode::UNAUTHORIZED)?;
        access::authenticate(&self.access, credential, false).await
    }

    async fn authorize(&self, headers: &HeaderMap, workspace: Uuid) -> ApiResult<Grant> {
        let grant = self.grant(headers).await?;
        if self.workspace != workspace || !grant.workspaces.contains(&workspace) {
            return Err(StatusCode::FORBIDDEN);
        }
        Ok(grant)
    }
}

async fn changes(
    State(host): State<Host>,
    RoutePath(workspace): RoutePath<Uuid>,
    headers: HeaderMap,
) -> ApiResult<Response> {
    change_stream(host, workspace, headers, false).await
}

async fn change_stream(
    host: Host,
    workspace: Uuid,
    headers: HeaderMap,
    mobile: bool,
) -> ApiResult<Response> {
    use axum::response::sse::{Event, Sse};
    let permit = host
        .streams
        .clone()
        .try_acquire_owned()
        .map_err(|_| StatusCode::SERVICE_UNAVAILABLE)?;
    let access_changed = host.access_changed.subscribe();
    let updates = host.storage.subscribe();
    let grant = host.authorize(&headers, workspace).await?;
    let mut heartbeat = tokio::time::interval(Duration::from_secs(5));
    heartbeat.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);
    let end = tokio::time::Instant::now() + Duration::from_secs(120);
    let reset = move || {
        let data = if mobile {
            json!({"kind":"reset","cursor":Uuid::new_v4(),"generation":workspace}).to_string()
        } else {
            workspace.to_string()
        };
        Event::default().event("reset").data(data)
    };
    let stream = futures_util::stream::unfold(
        (
            host,
            grant,
            updates,
            access_changed,
            heartbeat,
            permit,
            true,
        ),
        move |(host, grant, mut updates, mut access_changed, mut heartbeat, permit, first)| async move {
            let event = if first {
                reset()
            } else {
                tokio::select! {
                    _ = host.stop.cancelled() => return None,
                    _ = tokio::time::sleep_until(end) => return None,
                    Ok(()) = updates.changed() => reset(),
                    _ = heartbeat.tick() => Event::default().comment("keepalive"),
                    Ok(()) = access_changed.changed() => Event::default().comment("access"),
                }
            };
            if host.stop.is_cancelled() || !grant.current(&host.access, workspace).await {
                return None;
            }
            Some((
                Ok::<_, std::convert::Infallible>(event),
                (
                    host,
                    grant,
                    updates,
                    access_changed,
                    heartbeat,
                    permit,
                    false,
                ),
            ))
        },
    );
    Ok(Sse::new(stream).into_response())
}

fn private(ip: IpAddr) -> bool {
    match ip {
        IpAddr::V4(v4) => v4.is_private() || v4.is_loopback() || v4.is_link_local(),
        IpAddr::V6(v6) => {
            v6.is_loopback()
                || v6.is_unique_local()
                || v6.is_unicast_link_local()
                || v6.to_ipv4_mapped().is_some_and(|v4| private(v4.into()))
        }
    }
}

async fn enforce_transport(
    ConnectInfo(peer): ConnectInfo<SocketAddr>,
    request: axum::extract::Request,
    next: axum::middleware::Next,
) -> Response {
    if !private(peer.ip()) || request.method() == axum::http::Method::OPTIONS ||
        request.headers().get(header::AUTHORIZATION).is_some_and(|v|
            v.as_bytes().starts_with(browser::INTERNAL_AUTH.as_bytes()) ||
            v.as_bytes().starts_with(owner_browser::INTERNAL_AUTH.as_bytes())) ||
        (request.headers().contains_key(header::ORIGIN) && !browser::same_origin(&request)) {
        return StatusCode::FORBIDDEN.into_response();
    }
    let mut response = next.run(request).await;
    response.headers_mut().insert(
        header::CACHE_CONTROL,
        header::HeaderValue::from_static("no-store"),
    );
    response.headers_mut().insert(
        header::X_CONTENT_TYPE_OPTIONS,
        header::HeaderValue::from_static("nosniff"),
    );
    response
}

async fn descriptor(State(host): State<Host>) -> Json<Value> {
    Json(
        json!({"hostId": host.identity.id, "fingerprint": host.identity.fingerprint,
        "protocol": "vaultor-next/1", "mobileProtocol": 1, "pairing": "host-approval", "pairingTtlSeconds":300}),
    )
}

async fn workspaces(State(host): State<Host>, headers: HeaderMap) -> ApiResult<Json<Value>> {
    let _permit = host
        .requests
        .try_acquire()
        .map_err(|_| StatusCode::SERVICE_UNAVAILABLE)?;
    let grant = host.grant(&headers).await?;
    Ok(Json(if grant.workspaces.contains(&host.workspace) {
        json!([{"id": host.workspace}])
    } else {
        json!([])
    }))
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct ResourceQuery {
    query: Option<String>,
    cursor: Option<String>,
    limit: Option<u32>,
    collection: Option<String>,
}

async fn resources(
    State(host): State<Host>,
    RoutePath(workspace): RoutePath<Uuid>,
    headers: HeaderMap,
    Query(query): Query<ResourceQuery>,
) -> ApiResult<Json<Value>> {
    let _permit = host
        .requests
        .try_acquire()
        .map_err(|_| StatusCode::SERVICE_UNAVAILABLE)?;
    host.authorize(&headers, workspace).await?;
    let options = crate::search::SearchOptions {
        query: query.query.unwrap_or_default(),
        content: true,
        collection: query.collection,
        order: "title".into(),
        view: "library".into(),
        tag: None,
        kind: Some("managed".into()),
        tags: Vec::new(),
        any_tag: false,
    };
    let cursor = query
        .cursor
        .as_deref()
        .map(serde_json::from_str)
        .transpose()
        .map_err(|_| StatusCode::BAD_REQUEST)?;
    let generation = workspace.to_string();
    let result = host
        .storage
        .call_host(&host.root, move |ws| {
            if ws.review_generation()? != generation {
                return Err("Workspace changed".into());
            }
            ws.search(options, cursor, query.limit)
        })
        .await
        .map_err(|_| StatusCode::BAD_REQUEST)?;
    host.authorize(&headers, workspace).await?;
    Ok(Json(result))
}

async fn note(
    State(host): State<Host>,
    RoutePath((workspace, id)): RoutePath<(Uuid, String)>,
    headers: HeaderMap,
) -> ApiResult<Json<Value>> {
    let _permit = host
        .requests
        .try_acquire()
        .map_err(|_| StatusCode::SERVICE_UNAVAILABLE)?;
    host.authorize(&headers, workspace).await?;
    resource_id(&id)?;
    let generation = workspace.to_string();
    let result = host
        .storage
        .call_host(&host.root, move |ws| {
            if ws.review_generation()? != generation {
                return Err("Workspace changed".into());
            }
            let saved = ws.execute(Request::Read { id })?;
            if saved["kind"] != "note" {
                return Err("Note unavailable".into());
            }
            Ok(saved)
        })
        .await
        .map_err(|_| StatusCode::NOT_FOUND)?;
    host.authorize(&headers, workspace).await?;
    Ok(Json(result))
}

fn resource_id(id: &str) -> ApiResult<()> {
    if uuid::Uuid::parse_str(id).is_ok_and(|value| value.to_string() == id) {
        Ok(())
    } else {
        Err(StatusCode::NOT_FOUND)
    }
}

async fn submit_review(
    State(host): State<Host>,
    RoutePath((workspace, resource, operation)): RoutePath<(Uuid, Uuid, Uuid)>,
    headers: HeaderMap,
    Json(input): Json<crate::reviews::Submission>,
) -> ApiResult<Json<Value>> {
    if input.id != operation.to_string() || input.resource_id != resource.to_string() {
        return Err(StatusCode::BAD_REQUEST);
    }
    review(host, workspace, resource, operation, headers, Some(input)).await
}

async fn review_receipt(
    State(host): State<Host>,
    RoutePath((workspace, resource, operation)): RoutePath<(Uuid, Uuid, Uuid)>,
    headers: HeaderMap,
) -> ApiResult<Json<Value>> {
    review(host, workspace, resource, operation, headers, None).await
}

async fn review(
    host: Host,
    workspace: Uuid,
    resource: Uuid,
    operation: Uuid,
    headers: HeaderMap,
    input: Option<crate::reviews::Submission>,
) -> ApiResult<Json<Value>> {
    let _permit = host
        .requests
        .try_acquire()
        .map_err(|_| StatusCode::SERVICE_UNAVAILABLE)?;
    let grant = host.authorize(&headers, workspace).await?;
    let access = host.access.clone();
    let gate = host.enrollment.clone();
    let stop = host.stop.clone();
    let result = host
        .storage
        .call_host(&host.root, move |ws| {
            // Serialize owner decisions with review admission, including time spent in the owner queue.
            let _guard = gate.lock().map_err(crate::domain::error)?;
            if stop.is_cancelled() || !grant.current_sync(&access, workspace) {
                return Ok(Value::Null);
            }
            let principal = grant.device.to_string();
            let resource = resource.to_string();
            let generation = workspace.to_string();
            let submitter = crate::reviews::AuthorizedSubmitter {
                generation: &generation,
                resource_id: &resource,
                principal: &principal,
                label: &grant.label,
            };
            match input {
                Some(input) => ws.submit_review(&submitter, input),
                None => ws.review_receipt(&submitter, &operation.to_string()),
            }
        })
        .await
        .map_err(|_| StatusCode::CONFLICT)?;
    host.authorize(&headers, workspace).await?;
    if result.is_null() {
        return Err(StatusCode::FORBIDDEN);
    }
    Ok(Json(result))
}

#[derive(Deserialize)]
struct FileReceipt {
    path: PathBuf,
    length: u64,
    hash: String,
}

async fn file(
    State(host): State<Host>,
    RoutePath((workspace, id)): RoutePath<(Uuid, String)>,
    headers: HeaderMap,
) -> ApiResult<Response> {
    let permit = host
        .requests
        .clone()
        .try_acquire_owned()
        .map_err(|_| StatusCode::SERVICE_UNAVAILABLE)?;
    let grant = host.authorize(&headers, workspace).await?;
    resource_id(&id)?;
    let generation = workspace.to_string();
    let result = host
        .storage
        .call_host(&host.root, move |ws| {
            if ws.review_generation()? != generation {
                return Err("Workspace changed".into());
            }
            let path = ws.managed_path(&id)?;
            let (length, hash): (i64, String) = ws
                .db
                .query_row(
                    "SELECT bytes,hash FROM managed_originals WHERE resource_id=?1",
                    [&id],
                    |row| Ok((row.get(0)?, row.get(1)?)),
                )
                .map_err(crate::domain::error)?;
            Ok(json!({"path": path, "length": length, "hash": hash}))
        })
        .await
        .map_err(|_| StatusCode::NOT_FOUND)?;
    let receipt: FileReceipt = serde_json::from_value(result).map_err(|_| StatusCode::NOT_FOUND)?;
    let (start, length, partial) = match file_range(&headers, receipt.length) {
        Some(range) => range,
        None => {
            return Ok((
                StatusCode::RANGE_NOT_SATISFIABLE,
                [(header::CONTENT_RANGE, format!("bytes */{}", receipt.length))],
            )
                .into_response())
        }
    };
    let size = receipt.length;
    let expected = receipt.hash.clone();
    if let Some(pin) = headers.get("x-vaultor-payload-sha256") {
        if pin.as_bytes() != expected.as_bytes() {
            return Err(StatusCode::PRECONDITION_FAILED);
        }
    }
    let stop = host.stop.clone();
    let opened = tokio::task::spawn_blocking(move || {
        let mut file = crate::transfers::plain_file(&receipt.path)?;
        let (read, hash) = crate::transfers::copy_hash(&mut file, io::sink(), size, |_| {
            if stop.is_cancelled() {
                Err("Hosting stopped".into())
            } else {
                Ok(())
            }
        })?;
        if read != size || hash != receipt.hash {
            return Err("Managed original integrity mismatch".into());
        }
        Ok::<_, String>(file)
    })
    .await
    .map_err(|_| StatusCode::SERVICE_UNAVAILABLE)?
    .map_err(|_| StatusCode::NOT_FOUND)?;
    let mut file = tokio::fs::File::from_std(opened);
    file.seek(io::SeekFrom::Start(start))
        .await
        .map_err(|_| StatusCode::NOT_FOUND)?;
    host.authorize(&headers, workspace).await?;
    let body = Body::from_stream(download::stream(file, length, host.clone(), grant, permit));
    let mut response = Response::builder()
        .status(if partial {
            StatusCode::PARTIAL_CONTENT
        } else {
            StatusCode::OK
        })
        .header(header::ACCEPT_RANGES, "bytes")
        .header(header::CONTENT_TYPE, "application/octet-stream")
        .header(header::CONTENT_DISPOSITION, "attachment")
        .header("x-vaultor-sha256", expected)
        .header(header::CONTENT_LENGTH, length);
    if partial {
        response = response.header(
            header::CONTENT_RANGE,
            format!("bytes {start}-{}/{}", start + length - 1, receipt.length),
        );
    }
    response
        .body(body)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)
}

fn file_range(headers: &HeaderMap, total: u64) -> Option<(u64, u64, bool)> {
    let Some(value) = headers.get(header::RANGE) else {
        return Some((0, total, false));
    };
    let (first, last) = value
        .to_str()
        .ok()?
        .strip_prefix("bytes=")?
        .split_once('-')?;
    if total == 0 {
        return None;
    }
    if first.is_empty() {
        let count = last.parse::<u64>().ok()?.min(total);
        return (count > 0).then_some((total - count, count, true));
    }
    let start: u64 = first.parse().ok()?;
    let end = if last.is_empty() {
        total - 1
    } else {
        last.parse::<u64>().ok()?.min(total - 1)
    };
    (start <= end).then(|| (start, end - start + 1, true))
}

mod download {
    use super::*;
    use axum::body::Bytes;

    pub(super) fn stream(
        file: tokio::fs::File,
        left: u64,
        host: Host,
        grant: Grant,
        permit: tokio::sync::OwnedSemaphorePermit,
    ) -> impl futures_util::Stream<Item = io::Result<Bytes>> {
        futures_util::stream::try_unfold(
            (file, left, host, grant, permit),
            |(mut file, left, host, grant, permit)| async move {
                if left == 0 {
                    return Ok(None);
                }
                if host.stop.is_cancelled() || !grant.current(&host.access, host.workspace).await {
                    return Err(io::Error::new(
                        io::ErrorKind::PermissionDenied,
                        "Download authorization ended",
                    ));
                }
                let mut chunk = vec![0; left.min(64 * 1024) as usize];
                let read = file.read(&mut chunk).await?;
                if read == 0 {
                    return Err(io::Error::new(
                        io::ErrorKind::UnexpectedEof,
                        "Original changed during download",
                    ));
                }
                chunk.truncate(read);
                Ok(Some((
                    Bytes::from(chunk),
                    (file, left - read as u64, host, grant, permit),
                )))
            },
        )
    }
}
