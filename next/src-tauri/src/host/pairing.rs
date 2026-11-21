use super::{access, ApiResult, Host};
use axum::{
    extract::{ConnectInfo, Path, State},
    http::{HeaderMap, StatusCode},
    Json,
};
use serde::Deserialize;
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::{
    collections::HashMap,
    net::{IpAddr, SocketAddr},
    time::{Duration, Instant},
};
use subtle::ConstantTimeEq;
use time::{format_description::well_known::Rfc3339, OffsetDateTime};
use uuid::Uuid;

const TTL: Duration = Duration::from_secs(300);
const MINUTE: Duration = Duration::from_secs(60);

#[derive(Default)]
pub(super) struct Pairing {
    requests: HashMap<Uuid, Pending>,
    rate: HashMap<IpAddr, (Instant, u32)>,
}

struct Pending {
    label: String,
    kind: String,
    secret: String,
    code: String,
    deadline: Instant,
    expires_at: String,
    decision: Decision,
}

enum Decision {
    Pending,
    Approved { id: Uuid, credential: String },
    Rejected,
}

impl Decision {
    fn state(&self) -> &'static str {
        match self {
            Self::Pending => "PENDING",
            Self::Approved { .. } => "APPROVED",
            Self::Rejected => "REJECTED",
        }
    }
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub(super) struct Enrollment {
    name: String,
    kind: String,
    nonce: String,
    fingerprint: String,
}

impl Pairing {
    fn expire(&mut self) {
        let now = Instant::now();
        self.requests.retain(|_, request| request.deadline > now);
    }

    fn admit(&mut self, peer: IpAddr) -> ApiResult<()> {
        let now = Instant::now();
        self.rate
            .retain(|_, (start, _)| now.duration_since(*start) < MINUTE);
        if !self.rate.contains_key(&peer) && self.rate.len() >= 256 {
            return Err(StatusCode::TOO_MANY_REQUESTS);
        }
        let (_, count) = self.rate.entry(peer).or_insert((now, 0));
        if *count >= 60 {
            return Err(StatusCode::TOO_MANY_REQUESTS);
        }
        *count += 1;
        self.expire();
        Ok(())
    }

    pub(super) fn pending(&mut self) -> Value {
        self.expire();
        json!(self.requests.iter().filter(|(_, p)| matches!(p.decision, Decision::Pending))
            .map(|(id, p)| json!({"id":id,"name":p.label,"code":p.code,"kind":p.kind,"expiresAt":p.expires_at}))
            .collect::<Vec<_>>())
    }

    pub(super) fn decide(
        &mut self,
        access_dir: &std::path::Path,
        id: Uuid,
        code: &str,
        approve: bool,
    ) -> Result<(), String> {
        self.expire();
        let pending = self
            .requests
            .get_mut(&id)
            .ok_or("Pairing request expired or is unavailable")?;
        if !bool::from(pending.code.as_bytes().ct_eq(code.as_bytes())) {
            return Err("Pairing codes do not match".into());
        }
        match (&pending.decision, approve) {
            (Decision::Pending, true) => {
                let credential = access::new_credential().map_err(crate::domain::error)?;
                let id = Uuid::new_v4();
                access::add(
                    access_dir,
                    &credential,
                    &access::Record {
                        workspaces: Default::default(),
                        device: id,
                        label: pending.label.clone(),
                        browser_expires: (pending.kind == "browser").then(|| OffsetDateTime::now_utc().unix_timestamp() + super::browser::MAX_AGE),
                    },
                )
                .map_err(crate::domain::error)?;
                pending.decision = Decision::Approved { id, credential };
            }
            (Decision::Pending, false) => pending.decision = Decision::Rejected,
            (Decision::Approved { .. }, true) | (Decision::Rejected, false) => {}
            _ => return Err("Pairing request was already decided".into()),
        }
        Ok(())
    }

    pub(super) fn forget(&mut self, device: Uuid) {
        self.requests
            .retain(|_, p| !matches!(p.decision, Decision::Approved { id, .. } if id == device));
    }
}

pub(super) async fn enroll(
    State(host): State<Host>,
    ConnectInfo(peer): ConnectInfo<SocketAddr>,
    headers: HeaderMap,
    Json(input): Json<Enrollment>,
) -> ApiResult<Json<Value>> {
    let mut pairing = host
        .enrollment
        .lock()
        .map_err(|_| StatusCode::SERVICE_UNAVAILABLE)?;
    pairing.admit(peer.ip())?;
    let label = input.name.trim();
    if label.is_empty()
        || label.chars().count() > 80
        || label.chars().any(char::is_control)
        || !(matches!(input.kind.as_str(), "desktop" | "agent")
            || input.kind == "browser" && headers.contains_key(axum::http::header::ORIGIN))
        || input.nonce.len() != 64
        || !input
            .nonce
            .bytes()
            .all(|b| b.is_ascii_digit() || matches!(b, b'a'..=b'f'))
    {
        return Err(StatusCode::BAD_REQUEST);
    }
    if input.fingerprint != host.identity.fingerprint {
        return Err(StatusCode::CONFLICT);
    }
    if pairing.requests.len() >= 32 {
        return Err(StatusCode::TOO_MANY_REQUESTS);
    }
    let id = Uuid::new_v4();
    let secret = access::new_credential().map_err(|_| StatusCode::SERVICE_UNAVAILABLE)?;
    let digest = Sha256::digest(format!(
        "{}:{}:{id}:{secret}",
        input.fingerprint, input.nonce
    ));
    let code = format!(
        "{:06}",
        u32::from_be_bytes(digest[..4].try_into().unwrap()) % 1_000_000
    );
    let expires_at = (OffsetDateTime::now_utc() + TTL)
        .format(&Rfc3339)
        .map_err(|_| StatusCode::SERVICE_UNAVAILABLE)?;
    let result = json!({"id":id,"secret":secret,"code":code,"expiresAt":expires_at,
        "hostId":host.identity.id,"fingerprint":host.identity.fingerprint});
    pairing.requests.insert(
        id,
        Pending {
            label: label.into(),
            kind: input.kind,
            secret,
            code,
            expires_at,
            deadline: Instant::now() + TTL,
            decision: Decision::Pending,
        },
    );
    host.management_changed();
    Ok(Json(result))
}

fn lookup(
    host: &Host,
    peer: SocketAddr,
    id: Uuid,
    headers: &HeaderMap,
    project: impl FnOnce(&mut Pending) -> ApiResult<Value>,
) -> ApiResult<Json<Value>> {
    let mut pairing = host
        .enrollment
        .lock()
        .map_err(|_| StatusCode::SERVICE_UNAVAILABLE)?;
    pairing.admit(peer.ip())?;
    let secret = headers
        .get("x-vaultor-pairing").filter(|secret| secret.as_bytes().len() == 64)
        .ok_or(StatusCode::NOT_FOUND)?;
    let pending = pairing
        .requests
        .get_mut(&id)
        .filter(|p| bool::from(p.secret.as_bytes().ct_eq(secret.as_bytes())))
        .ok_or(StatusCode::NOT_FOUND)?;
    project(pending).map(Json)
}

pub(super) async fn poll(
    State(host): State<Host>,
    ConnectInfo(peer): ConnectInfo<SocketAddr>,
    Path(id): Path<Uuid>,
    headers: HeaderMap,
) -> ApiResult<Json<Value>> {
    lookup(&host, peer, id, &headers, |p| {
        Ok(json!({
            "id":id,"state":p.decision.state(),"expiresAt":p.expires_at,
        }))
    })
}

pub(super) async fn complete(
    State(host): State<Host>,
    ConnectInfo(peer): ConnectInfo<SocketAddr>,
    Path(id): Path<Uuid>,
    headers: HeaderMap,
) -> ApiResult<axum::response::Response> {
    use axum::response::IntoResponse;
    let mut cookie = None;
    let value = lookup(&host, peer, id, &headers, |p| match &p.decision {
        Decision::Approved { id, credential } if p.kind == "browser" => {
            if !headers.contains_key(axum::http::header::ORIGIN) { return Err(StatusCode::FORBIDDEN); }
            cookie = Some(super::browser::cookie(credential, super::browser::MAX_AGE)?);
            let value = json!({"deviceId":id,"kind":"browser"});
            p.secret.clear();
            Ok(value)
        }
        Decision::Approved { id, credential } => Ok(json!({"deviceId":id,"credential":credential,"kind":p.kind})),
        _ => Err(StatusCode::CONFLICT),
    })?;
    let mut response = value.into_response();
    if let Some(cookie) = cookie { response.headers_mut().insert(axum::http::header::SET_COOKIE, cookie); }
    Ok(response)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pending_requests_expire_and_source_attempts_are_bounded() {
        let mut state = Pairing::default();
        let id = Uuid::new_v4();
        state.requests.insert(
            id,
            Pending {
                label: "Fixture".into(),
                kind: "agent".into(),
                secret: "unused".into(),
                code: "123456".into(),
                deadline: Instant::now(),
                expires_at: String::new(),
                decision: Decision::Pending,
            },
        );
        let peer = IpAddr::from([127, 0, 0, 1]);
        for _ in 0..60 {
            assert!(state.admit(peer).is_ok());
        }
        assert!(!state.requests.contains_key(&id));
        assert_eq!(state.admit(peer), Err(StatusCode::TOO_MANY_REQUESTS));
        assert!(state.admit(IpAddr::from([127, 0, 0, 2])).is_ok());
    }
}
