use super::*;
use crate::worker::Worker;
use rcgen::{
    BasicConstraints, CertificateParams, CertifiedIssuer, ExtendedKeyUsagePurpose, IsCa, KeyPair,
    KeyUsagePurpose,
};
use rustls::{pki_types::CertificateDer, ClientConfig, RootCertStore};
use std::path::Path;
use tokio::io::AsyncWriteExt;
use tokio::net::TcpStream;
use tokio_rustls::TlsConnector;

#[cfg(all(windows, feature = "desktop"))]
#[tokio::test]
async fn managed_identity_survives_leaf_rotation_and_refuses_damaged_keys() {
    use rustls::pki_types::UnixTime;
    use time::OffsetDateTime;

    let fixture = tempfile::tempdir().unwrap();
    let access = fixture.path().join("access");
    let root = fixture.path().join("workspace");
    let (identity, authority) = Authority::open(&access).unwrap();
    let id = identity.id;
    let trusted = identity.certificate.clone();
    let fingerprint = identity.fingerprint.clone();
    let worker = Worker::start(root.clone(), None).unwrap();
    worker.call(Request::Snapshot).await.unwrap();
    let host = Host::new(worker.storage(), root, identity).await.unwrap();
    let ip = "127.0.0.1".parse().unwrap();
    let now = OffsetDateTime::now_utc();
    let (first, first_key, expires) = authority.as_ref().unwrap().issue(ip, now).unwrap();
    let time_at = |time: OffsetDateTime| {
        UnixTime::since_unix_epoch(Duration::from_secs(time.unix_timestamp() as u64))
    };
    assert!(!Authority::needs_renewal(expires, now));
    assert!(Authority::needs_renewal(
        expires,
        expires - time::Duration::days(7)
    ));
    assert!(host
        .tls_config(ip, first.clone(), first_key.clone_key(), time_at(now))
        .is_ok());
    assert!(host
        .tls_config(
            ip,
            first.clone(),
            first_key,
            time_at(expires + time::Duration::hours(1))
        )
        .is_err());
    let next_ip = "127.0.0.2".parse().unwrap();
    let next_time = expires - time::Duration::days(7);
    let (second, second_key, next_expiry) = authority
        .as_ref()
        .unwrap()
        .issue(next_ip, next_time)
        .unwrap();
    assert_eq!(first[1], second[1]);
    assert_ne!(first[0], second[0]);
    assert!(next_expiry > expires);
    assert!(host
        .tls_config(
            ip,
            second.clone(),
            second_key.clone_key(),
            time_at(next_time)
        )
        .is_err());
    assert!(host
        .tls_config(next_ip, second, second_key, time_at(next_time))
        .is_ok());

    let listener = host
        .clone()
        .listen_automatic("127.0.0.1:0".parse().unwrap(), authority.unwrap())
        .await
        .unwrap();
    let client = connector(Some(trusted));
    let response = request(
        &client,
        listener.address(),
        "GET",
        "/api/access/host",
        "",
        "",
    )
    .await;
    assert_eq!(response.0, 200);
    assert!(response.2.contains(&fingerprint));
    listener.stop().await.unwrap();
    drop(host);

    let (reopened, _) = Authority::open(&access).unwrap();
    assert_eq!(reopened.id, id);
    assert_eq!(reopened.fingerprint, fingerprint);
    drop(reopened);
    let key = access.join("authority.dpapi");
    std::fs::write(&key, b"damaged").unwrap();
    assert!(Authority::open(&access).is_err());
    assert_eq!(std::fs::read(key).unwrap(), b"damaged");
}

struct Fixture {
    _dir: tempfile::TempDir,
    access: PathBuf,
    root: PathBuf,
    ca: PathBuf,
    chain: PathBuf,
    key: PathBuf,
    authority: CertificateDer<'static>,
}

fn tls_fixture(path: &Path) -> (PathBuf, PathBuf, PathBuf, CertificateDer<'static>) {
    let mut ca = CertificateParams::new(Vec::new()).unwrap();
    ca.is_ca = IsCa::Ca(BasicConstraints::Constrained(0));
    ca.key_usages = vec![KeyUsagePurpose::KeyCertSign, KeyUsagePurpose::CrlSign];
    let authority = CertifiedIssuer::self_signed(ca, KeyPair::generate().unwrap()).unwrap();
    let mut params = CertificateParams::new(vec!["127.0.0.1".into()]).unwrap();
    params.extended_key_usages = vec![ExtendedKeyUsagePurpose::ServerAuth];
    let key = KeyPair::generate().unwrap();
    let leaf = params.signed_by(&key, &authority).unwrap();
    let ca = path.join("ca.pem");
    let chain = path.join("chain.pem");
    let server_key = path.join("server-key.pem");
    std::fs::write(&ca, authority.pem()).unwrap();
    std::fs::write(&chain, format!("{}{}", leaf.pem(), authority.pem())).unwrap();
    std::fs::write(&server_key, key.serialize_pem()).unwrap();
    (ca, chain, server_key, authority.der().clone())
}

impl Fixture {
    fn new() -> Self {
        let dir = tempfile::tempdir().unwrap();
        let access = dir.path().join("access");
        let root = dir.path().join("workspace");
        std::fs::create_dir(&access).unwrap();
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            std::fs::set_permissions(&access, std::fs::Permissions::from_mode(0o700)).unwrap();
        }
        let (ca, chain, key, authority) = tls_fixture(dir.path());
        Identity::initialize(&access, &ca).unwrap();
        Self {
            _dir: dir,
            access,
            root,
            ca,
            chain,
            key,
            authority,
        }
    }
}

fn connector(cert: Option<CertificateDer<'static>>) -> TlsConnector {
    let mut roots = RootCertStore::empty();
    if let Some(cert) = cert {
        roots.add(cert).unwrap();
    }
    TlsConnector::from(Arc::new(
        ClientConfig::builder_with_provider(Arc::new(rustls::crypto::ring::default_provider()))
            .with_safe_default_protocol_versions()
            .unwrap()
            .with_root_certificates(roots)
            .with_no_client_auth(),
    ))
}

async fn request(
    client: &TlsConnector,
    address: SocketAddr,
    method: &str,
    path: &str,
    headers: &str,
    body: &str,
) -> (u16, String, String) {
    tokio::time::timeout(Duration::from_secs(8), async {
        let socket = TcpStream::connect(address).await.unwrap();
        let mut client = client.connect(address.ip().into(), socket).await.unwrap();
        client.write_all(format!(
            "{method} {path} HTTP/1.1\r\nHost: {address}\r\nConnection: close\r\nContent-Type: application/json\r\nContent-Length: {}\r\n{headers}\r\n{body}", body.len(),
        ).as_bytes()).await.unwrap();
        let mut bytes = Vec::new();
        client.read_to_end(&mut bytes).await.unwrap();
        let reply = String::from_utf8(bytes).unwrap();
        let (head, body) = reply.split_once("\r\n\r\n").unwrap();
        let status = head.split_whitespace().nth(1).unwrap().parse().unwrap();
        (status, head.to_owned(), body.to_owned())
    }).await.unwrap()
}

#[tokio::test]
async fn tls_pairing_scope_saved_reads_review_and_restart() {
    let fixture = Fixture::new();
    let identity = Identity::open(&fixture.access, &fixture.ca).unwrap();
    let host_id = identity.id;
    assert!(Identity::open(&fixture.access, &fixture.ca).is_err());
    let worker = Worker::start(fixture.root.clone(), None).unwrap();
    let note = worker
        .call(Request::CreateNote {
            title: "Saved title".into(),
            collection: None,
        })
        .await
        .unwrap();
    let id = note["id"].as_str().unwrap().to_owned();
    worker
        .call(Request::Draft {
            id: id.clone(),
            base_revision: 1,
            token: Uuid::new_v4().to_string(),
            sequence: 1,
            title: "Protected draft".into(),
            content: json!({"type":"doc","content":[]}),
        })
        .await
        .unwrap();
    assert!(crate::domain::Workspace::open(&fixture.root).is_err());
    let file_id = Uuid::new_v4().to_string();
    let asset = file_id.clone();
    worker
        .storage()
        .call_host(&fixture.root, move |ws| {
            std::fs::create_dir_all(ws.root.join("managed")).unwrap();
            std::fs::write(ws.new_media_path(&asset)?, b"0123456789").unwrap();
            use sha2::{Digest, Sha256};
            ws.attach_metadata(
                asset,
                "sample.bin".into(),
                10,
                hex::encode(Sha256::digest(b"0123456789")),
            )
        })
        .await
        .unwrap();
    let host = Host::new(worker.storage(), fixture.root.clone(), identity)
        .await
        .unwrap();
    let bind = "127.0.0.1:0".parse().unwrap();
    let listener = host
        .clone()
        .listen(bind, fixture.chain.clone(), fixture.key.clone())
        .await
        .unwrap();
    let address = listener.address();
    let client = connector(Some(fixture.authority.clone()));
    let untrusted = connector(None);
    let socket = TcpStream::connect(address).await.unwrap();
    assert!(untrusted
        .connect(address.ip().into(), socket)
        .await
        .is_err());

    let workspace = host.workspace;
    let base = format!("/api/next/v1/workspaces/{workspace}");
    let saved = format!("{base}/notes/{id}");
    assert_eq!(
        request(&client, address, "GET", &saved, "", "").await.0,
        401
    );
    assert_eq!(
        request(&client, address, "GET", "/api/owner/devices", "", "")
            .await
            .0,
        404
    );
    assert_eq!(
        request(
            &client,
            address,
            "GET",
            "/api/access/host",
            "Origin: https://unexpected.test\r\n",
            ""
        )
        .await
        .0,
        403
    );
    let descriptor = request(&client, address, "GET", "/api/access/host", "", "").await;
    let descriptor: Value = serde_json::from_str(&descriptor.2).unwrap();
    assert_eq!(descriptor["hostId"], host_id.to_string());
    let enrollment = json!({
        "name":"Android fixture", "kind":"desktop", "nonce":"a".repeat(64),
        "fingerprint":descriptor["fingerprint"]
    })
    .to_string();
    let (_, _, response) =
        request(&client, address, "POST", "/api/pairings", "", &enrollment).await;
    let pending: Value = serde_json::from_str(&response).unwrap();
    let pairing_id = pending["id"].as_str().unwrap();
    let code = pending["code"].as_str().unwrap();
    let secret_header = format!(
        "X-Vaultor-Pairing: {}\r\n",
        pending["secret"].as_str().unwrap()
    );
    let pairing_url = format!("/api/pairings/{pairing_id}");
    let complete = format!("{pairing_url}/complete");
    assert_eq!(
        request(&client, address, "GET", &pairing_url, "", "")
            .await
            .0,
        404
    );
    assert_eq!(
        request(&client, address, "POST", &complete, &secret_header, "{}")
            .await
            .0,
        409
    );
    assert!(host
        .owner_command(&format!("approve {pairing_id} wrong"))
        .is_err());
    host.owner_command(&format!("approve {pairing_id} {code}"))
        .unwrap();
    let completed = request(&client, address, "POST", &complete, &secret_header, "{}").await;
    assert_eq!(completed.0, 200);
    assert_eq!(
        completed.2,
        request(&client, address, "POST", &complete, &secret_header, "{}")
            .await
            .2
    );
    let receipt: Value = serde_json::from_str(&completed.2).unwrap();
    let device = receipt["deviceId"].as_str().unwrap();
    let auth = format!(
        "Authorization: Bearer {}\r\n",
        receipt["credential"].as_str().unwrap()
    );
    assert_eq!(
        request(&client, address, "GET", &saved, &auth, "").await.0,
        403
    );
    host.owner_command(&format!("grant {device}")).unwrap();
    let wrong = format!("/api/next/v1/workspaces/{}/notes/{id}", Uuid::new_v4());
    assert_eq!(
        request(&client, address, "GET", &wrong, &auth, "").await.0,
        403
    );
    let response = request(&client, address, "GET", &saved, &auth, "").await;
    assert_eq!(response.0, 200);
    assert!(response.2.contains("Saved title"));
    assert!(!response.2.contains("Protected draft"));
    let search = request(
        &client,
        address,
        "GET",
        &format!("{base}/resources?query=Saved"),
        &auth,
        "",
    )
    .await;
    assert_eq!(search.0, 200);
    assert!(search.2.contains(&id));
    let ranged = request(
        &client,
        address,
        "GET",
        &format!("{base}/files/{file_id}"),
        &format!("{auth}Range: bytes=3-6\r\n"),
        "",
    )
    .await;
    assert_eq!((ranged.0, ranged.2.as_str()), (206, "3456"));
    std::fs::write(
        fixture.root.join("managed").join(format!("{file_id}.bin")),
        b"9876543210",
    )
    .unwrap();
    assert_eq!(
        request(
            &client,
            address,
            "GET",
            &format!("{base}/files/{file_id}"),
            &auth,
            ""
        )
        .await
        .0,
        404
    );
    let operation = Uuid::new_v4();
    let review = format!("{base}/resources/{id}/review/{operation}");
    let payload = json!({"id":operation,"resourceId":id,"baseRevision":1,"comment":"Feedback",
        "quote":"","context":"","locator":{"kind":"resource"}})
    .to_string();
    let response = request(&client, address, "PUT", &review, &auth, &payload).await;
    assert_eq!(response.0, 200);
    assert!(response.2.contains("Android fixture"));
    assert_eq!(
        response.2,
        request(&client, address, "PUT", &review, &auth, &payload)
            .await
            .2
    );
    assert_eq!(
        response.2,
        request(&client, address, "GET", &review, &auth, "").await.2
    );

    let socket = TcpStream::connect(address).await.unwrap();
    let mut events = client.connect(address.ip().into(), socket).await.unwrap();
    let mut event_buffer = vec![0; 4096];
    events
        .write_all(
            format!("GET {base}/changes HTTP/1.1\r\nHost: {address}\r\n{auth}\r\n").as_bytes(),
        )
        .await
        .unwrap();
    async fn wait_reset(
        stream: &mut tokio_rustls::client::TlsStream<TcpStream>,
        buffer: &mut [u8],
    ) {
        tokio::time::timeout(Duration::from_secs(4), async {
            let mut received = Vec::new();
            loop {
                let count = stream.read(buffer).await.unwrap();
                assert!(count > 0);
                received.extend_from_slice(&buffer[..count]);
                if String::from_utf8_lossy(&received).contains("event: reset") {
                    return;
                }
            }
        })
        .await
        .unwrap();
    }
    wait_reset(&mut events, &mut event_buffer).await;
    worker
        .call(Request::CreateNote {
            title: "Committed after subscription".into(),
            collection: None,
        })
        .await
        .unwrap();
    wait_reset(&mut events, &mut event_buffer).await;
    host.owner_command(&format!("withdraw {device}")).unwrap();
    tokio::time::timeout(Duration::from_secs(4), async {
        let mut received = Vec::new();
        while !String::from_utf8_lossy(&received).contains("0\r\n\r\n") {
            let count = events.read(&mut event_buffer).await.unwrap();
            if count == 0 {
                break;
            }
            received.extend_from_slice(&event_buffer[..count]);
        }
    })
    .await
    .unwrap();
    assert_eq!(
        request(&client, address, "GET", &saved, &auth, "").await.0,
        403
    );
    host.owner_command(&format!("grant {device}")).unwrap();
    listener.stop().await.unwrap();
    assert!(TcpStream::connect(address).await.is_err());
    drop(host);
    let different_ca = tempfile::tempdir().unwrap();
    let (changed, _, _, _) = tls_fixture(different_ca.path());
    assert!(matches!(
        Identity::open(&fixture.access, &changed),
        Err(error) if error.to_string().contains("Host authority changed")
    ));
    let identity = Identity::open(&fixture.access, &fixture.ca).unwrap();
    assert_eq!(host_id, identity.id);
    let host = Host::new(worker.storage(), fixture.root.clone(), identity)
        .await
        .unwrap();
    let listener = host
        .clone()
        .listen(bind, fixture.chain.clone(), fixture.key.clone())
        .await
        .unwrap();
    assert_eq!(
        request(&client, listener.address(), "GET", &saved, &auth, "")
            .await
            .0,
        200
    );
    host.owner_command(&format!("revoke {device}")).unwrap();
    assert_eq!(
        request(&client, listener.address(), "GET", &saved, &auth, "")
            .await
            .0,
        401
    );
    listener.stop().await.unwrap();
}
