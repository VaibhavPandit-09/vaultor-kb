//! Local browser bootstrap. This router is never mounted on the HTTPS listener.
use super::*;
use axum::{
    extract::{OriginalUri, Request as HttpRequest},
    http::{HeaderValue, Method},
    middleware::{from_fn_with_state, Next},
    response::Redirect,
};
use sha2::{Digest, Sha256};
use std::time::Instant;
use subtle::ConstantTimeEq;

pub(super) const INTERNAL_AUTH: &str = "Vaultor-Local-Owner ";
const TICKET_TTL: Duration = Duration::from_secs(60);
const SESSION_TTL: Duration = Duration::from_secs(8 * 60 * 60);

#[derive(Clone)]
pub(super) struct Session {
    proof: [u8; 32],
    expires: Instant,
    revoked: CancellationToken,
}

impl Session {
    pub(super) fn active(&self) -> bool {
        !self.revoked.is_cancelled() && Instant::now() < self.expires
    }
}

#[derive(Default)]
struct Credentials {
    ticket: Option<([u8; 32], Instant)>,
    session: Option<Session>,
}

#[derive(Default)]
pub(super) struct OwnerBrowser {
    connector: tokio::sync::Mutex<Option<SocketAddr>>,
    credentials: Mutex<Credentials>,
}

#[derive(Clone)]
struct Connector {
    host: Host,
    address: SocketAddr,
    cookie_name: String,
}

fn digest(input: &str) -> [u8; 32] {
    Sha256::digest(input.as_bytes()).into()
}

fn valid(input: &str) -> bool {
    input.len() == 64 && input.bytes().all(|byte| byte.is_ascii_hexdigit())
}

impl OwnerBrowser {
    #[cfg(test)]
    pub(super) fn expire_pending(&self) {
        if let Some((_, deadline)) = self.credentials.lock().unwrap().ticket.as_mut() {
            *deadline = Instant::now();
        }
    }

    pub(super) fn session(&self, proof: &str) -> ApiResult<Session> {
        if !valid(proof) {
            return Err(StatusCode::UNAUTHORIZED);
        }
        let credentials = self
            .credentials
            .lock()
            .map_err(|_| StatusCode::SERVICE_UNAVAILABLE)?;
        credentials
            .session
            .as_ref()
            .filter(|session| session.active() && bool::from(session.proof.ct_eq(&digest(proof))))
            .cloned()
            .ok_or(StatusCode::UNAUTHORIZED)
    }
}

impl Host {
    /// Minted only through local owner IPC. The caller must pass the returned
    /// fragment directly to the system browser without logging or storing it.
    pub async fn owner_browser_url(&self) -> Result<String, String> {
        use crate::domain::error;
        if self.stop.is_cancelled() {
            return Err("Hosting has stopped".into());
        }
        let mut slot = self.owner_browser.connector.lock().await;
        let address = match slot.as_ref() {
            Some(address) => *address,
            None => {
                let socket = tokio::net::TcpListener::bind((std::net::Ipv4Addr::LOCALHOST, 0))
                    .await
                    .map_err(error)?;
                let address = socket.local_addr().map_err(error)?;
                let cookie_name = format!("VaultorOwner_{}", Uuid::new_v4().simple());
                let connector = Connector {
                    host: self.clone(),
                    address,
                    cookie_name,
                };
                let router = connector.clone().router();
                let stop = self.stop.clone();
                tokio::spawn(async move {
                    let _ = axum::serve(
                        socket,
                        router.into_make_service_with_connect_info::<SocketAddr>(),
                    )
                    .with_graceful_shutdown(stop.cancelled_owned())
                    .await;
                });
                *slot = Some(address);
                address
            }
        };
        let token = access::new_credential().map_err(error)?;
        self.owner_browser.credentials.lock().map_err(error)?.ticket =
            Some((digest(&token), Instant::now() + TICKET_TTL));
        Ok(format!("http://{address}/access#ticket={token}"))
    }

    pub fn cancel_owner_browser(&self, end_session: bool) -> Result<(), String> {
        let mut credentials = self
            .owner_browser
            .credentials
            .lock()
            .map_err(crate::domain::error)?;
        credentials.ticket = None;
        if end_session {
            if let Some(session) = credentials.session.take() {
                session.revoked.cancel();
            }
        }
        Ok(())
    }

    #[cfg(windows)]
    pub async fn open_owner_browser(&self) -> Result<(), String> {
        let address = self.owner_browser_url().await?;
        if let Err(error) = crate::linked::native::open_web(&address) {
            self.cancel_owner_browser(false)?;
            return Err(error);
        }
        Ok(())
    }
}

impl Connector {
    fn router(self) -> Router {
        let workspace = browser::workspace_routes()
            .layer(from_fn_with_state(self.clone(), workspace_authority))
            .with_state(self.host.clone());
        Router::new()
            .route("/access", get(|| async {
                browser::asset("text/html; charset=utf-8",
                    include_str!("../../../../backend/src/main/resources/static/access.html")
                        .replace("Connect to Vaultor", "Vaultor local owner")
                        .replace("<a href=\"/\">Open workspace</a>", "<a href=\"/\">Open workspace</a><button id=\"owner-logout\">Sign out</button>"))
            }))
            .route("/access.js", get(|| async {
                browser::asset("text/javascript; charset=utf-8", concat!(
                    include_str!("../../../../backend/src/main/resources/static/access.js"),
                    "\n$('owner-logout').onclick=async()=>{try{await api('/access/logout','POST');location.replace('/access');}catch(error){status.textContent=error.message;}};"
                ))
            }))
            .route("/access.css", get(|| async {
                browser::asset("text/css; charset=utf-8", include_str!("../../../../backend/src/main/resources/static/access.css"))
            }))
            .route("/api/access/host", get(identity))
            .route("/api/access/bootstrap", post(bootstrap).layer(DefaultBodyLimit::max(1024)))
            .route("/api/access/session", get(session))
            .route("/api/access/logout", post(logout))
            .route("/api/owner/pairings", get(pending))
            .route("/api/owner/pairings/{id}/{decision}", post(decide).layer(DefaultBodyLimit::max(1024)))
            .route("/", get(home))
            .route("/browser/assets/{name}", get(asset))
            .with_state(self.clone())
            .nest("/api/next/browser/v1", workspace)
            .layer(from_fn_with_state(self, transport))
    }

    fn read_cookie<'a>(&self, headers: &'a HeaderMap) -> ApiResult<&'a str> {
        let mut matches = headers
            .get_all(header::COOKIE)
            .iter()
            .filter_map(|h| h.to_str().ok())
            .flat_map(|h| h.split(';'))
            .filter_map(|p| p.trim().split_once('='))
            .filter(|(key, _)| *key == self.cookie_name);
        let (_, token) = matches.next().ok_or(StatusCode::UNAUTHORIZED)?;
        if matches.next().is_some() {
            return Err(StatusCode::UNAUTHORIZED);
        }
        self.host.owner_browser.session(token)?;
        Ok(token)
    }

    fn cookie(&self, token: &str, max_age: u64) -> ApiResult<HeaderValue> {
        HeaderValue::from_str(&format!(
            "{}={token}; Path=/; Max-Age={max_age}; HttpOnly; SameSite=Strict",
            self.cookie_name
        ))
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)
    }
}

async fn transport(
    State(connector): State<Connector>,
    ConnectInfo(peer): ConnectInfo<SocketAddr>,
    request: HttpRequest,
    next: Next,
) -> Response {
    let authority = connector.address.to_string();
    let origin = format!("http://{authority}");
    let headers = request.headers();
    let read = matches!(*request.method(), Method::GET | Method::HEAD);
    if !peer.ip().is_loopback()
        || connector.host.stop.is_cancelled()
        || !headers
            .get(header::HOST)
            .is_some_and(|v| v.as_bytes() == authority.as_bytes())
        || request
            .uri()
            .authority()
            .is_some_and(|v| v.as_str() != authority)
        || request.method() == Method::OPTIONS
        || ((!read || headers.contains_key(header::ORIGIN))
            && !headers
                .get(header::ORIGIN)
                .is_some_and(|v| v.as_bytes() == origin.as_bytes()))
        || headers
            .get("sec-fetch-site")
            .is_some_and(|v| v.as_bytes() == b"cross-site")
    {
        return StatusCode::FORBIDDEN.into_response();
    }
    let mut response = next.run(request).await;
    response
        .headers_mut()
        .insert(header::CACHE_CONTROL, HeaderValue::from_static("no-store"));
    response.headers_mut().insert(
        header::X_CONTENT_TYPE_OPTIONS,
        HeaderValue::from_static("nosniff"),
    );
    response
}

async fn workspace_authority(
    State(connector): State<Connector>,
    mut request: HttpRequest,
    next: Next,
) -> ApiResult<Response> {
    let credential = connector.read_cookie(request.headers())?;
    if !matches!(*request.method(), Method::GET | Method::HEAD) {
        browser::verify_mutation(request.headers(), credential)?;
    }
    let internal = HeaderValue::from_str(&format!("{INTERNAL_AUTH}{credential}"))
        .map_err(|_| StatusCode::UNAUTHORIZED)?;
    request
        .headers_mut()
        .insert(header::AUTHORIZATION, internal);
    Ok(next.run(request).await)
}

async fn identity(State(connector): State<Connector>) -> Json<Value> {
    Json(json!({"hostId":connector.host.host_id(),"fingerprint":connector.host.fingerprint()}))
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Ticket {
    ticket: String,
}

async fn bootstrap(
    State(connector): State<Connector>,
    Json(input): Json<Ticket>,
) -> ApiResult<Response> {
    if !valid(&input.ticket) {
        return Err(StatusCode::UNAUTHORIZED);
    }
    let mut state = connector
        .host
        .owner_browser
        .credentials
        .lock()
        .map_err(|_| StatusCode::SERVICE_UNAVAILABLE)?;
    let usable = state.ticket.as_ref().is_some_and(|(proof, deadline)| {
        Instant::now() < *deadline && bool::from(proof.ct_eq(&digest(&input.ticket)))
    });
    if !usable {
        return Err(StatusCode::UNAUTHORIZED);
    }
    let token = access::new_credential().map_err(|_| StatusCode::SERVICE_UNAVAILABLE)?;
    let cookie = connector.cookie(&token, SESSION_TTL.as_secs())?;
    state.ticket = None;
    if let Some(session) = state.session.take() {
        session.revoked.cancel();
    }
    state.session = Some(Session {
        proof: digest(&token),
        expires: Instant::now() + SESSION_TTL,
        revoked: CancellationToken::new(),
    });
    Ok((
        [(header::SET_COOKIE, cookie)],
        Json(json!({"state":"OWNER"})),
    )
        .into_response())
}

async fn session(State(connector): State<Connector>, headers: HeaderMap) -> ApiResult<Json<Value>> {
    let credential = connector.read_cookie(&headers)?;
    Ok(Json(
        json!({"role":"OWNER", "csrf":browser::csrf(credential)}),
    ))
}

async fn logout(State(connector): State<Connector>, headers: HeaderMap) -> ApiResult<Response> {
    browser::verify_mutation(&headers, connector.read_cookie(&headers)?)?;
    connector
        .host
        .cancel_owner_browser(true)
        .map_err(|_| StatusCode::SERVICE_UNAVAILABLE)?;
    Ok((
        [(header::SET_COOKIE, connector.cookie("", 0)?)],
        StatusCode::NO_CONTENT,
    )
        .into_response())
}

async fn home(State(connector): State<Connector>, headers: HeaderMap) -> Response {
    if connector.read_cookie(&headers).is_err() {
        return Redirect::to("/access").into_response();
    }
    browser::workspace_home()
}

async fn asset(
    State(connector): State<Connector>,
    headers: HeaderMap,
    OriginalUri(uri): OriginalUri,
) -> ApiResult<Response> {
    connector.read_cookie(&headers)?;
    browser::workspace_asset(uri.path())
}

async fn pending(State(connector): State<Connector>, headers: HeaderMap) -> ApiResult<Json<Value>> {
    connector.read_cookie(&headers)?;
    connector
        .host
        .owner_command("pending")
        .map(Json)
        .map_err(|_| StatusCode::SERVICE_UNAVAILABLE)
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Code {
    code: String,
}

async fn decide(
    State(connector): State<Connector>,
    RoutePath((id, decision)): RoutePath<(Uuid, String)>,
    headers: HeaderMap,
    Json(value): Json<Code>,
) -> ApiResult<Json<Value>> {
    let credential = connector.read_cookie(&headers)?;
    browser::verify_mutation(&headers, credential)?;
    if !matches!(decision.as_str(), "approve" | "reject")
        || value.code.len() != 6
        || !value.code.bytes().all(|b| b.is_ascii_digit())
    {
        return Err(StatusCode::BAD_REQUEST);
    }
    connector
        .host
        .owner_command(&format!("{decision} {id} {}", value.code))
        .map(Json)
        .map_err(|_| StatusCode::CONFLICT)
}
