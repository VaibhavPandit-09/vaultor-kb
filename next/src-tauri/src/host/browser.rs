//! Browser-only HTTPS projection. The local desktop connector remains IPC-only.
use super::*;
use axum::{
    extract::{OriginalUri, Request as HttpRequest},
    http::{HeaderValue, Method},
    middleware::{from_fn, Next},
    response::Redirect,
};
use sha2::{Digest, Sha256};
use subtle::ConstantTimeEq;

pub(super) const MAX_AGE: i64 = 24 * 60 * 60;
pub(super) const INTERNAL_AUTH: &str = "Vaultor-Browser ";
const COOKIE: &str = "__Host-VaultorClient";
const CSP: &str = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; media-src 'self' blob:; frame-src blob:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'";

include!(concat!(env!("OUT_DIR"), "/browser_assets.rs"));
const ACCESS_HTML: &str = include_str!("../../../../backend/src/main/resources/static/access.html");
const ACCESS_JS: &str = include_str!("../../../../backend/src/main/resources/static/access.js");
const ACCESS_CSS: &str = include_str!("../../../../backend/src/main/resources/static/access.css");

pub(super) fn router() -> Router<Host> {
    let workspace = mobile::browser_reads()
        .route("/resources/{id}/preview", get(preview))
        .route(
            "/notes/{id}",
            put(save_note).layer(DefaultBodyLimit::max(1024 * 1024)),
        )
        .layer(from_fn(browser_only));
    Router::new()
        .route("/", get(home))
        .route(
            "/access",
            get(|| async {
                asset(
                    "text/html; charset=utf-8",
                    ACCESS_HTML.replace(
                        "Connections &amp; hosting → Hosting → Devices",
                        "Vaultor Next Settings → Hosting",
                    ),
                )
            }),
        )
        .route(
            "/access.js",
            get(|| async { asset("text/javascript; charset=utf-8", ACCESS_JS) }),
        )
        .route(
            "/access.css",
            get(|| async { asset("text/css; charset=utf-8", ACCESS_CSS) }),
        )
        .route("/browser/assets/{name}", get(browser_asset))
        .route("/api/access/session", get(session))
        .route("/api/access/logout", post(logout))
        .nest("/api/next/browser/v1", workspace)
}

pub(super) fn same_origin(request: &HttpRequest) -> bool {
    let path = request.uri().path();
    let asset = matches!(*request.method(), Method::GET | Method::HEAD)
        && path.starts_with("/browser/assets/");
    if !(path == "/api/pairings"
        || path.starts_with("/api/pairings/")
        || path.starts_with("/api/next/browser/v1/")
        || path == "/api/access/logout"
        || asset)
    {
        return false;
    }
    let authority = request.uri().authority().cloned().or_else(|| {
        request
            .headers()
            .get(header::HOST)
            .and_then(|value| value.to_str().ok())
            .and_then(|value| value.parse::<axum::http::uri::Authority>().ok())
    });
    let Some(authority) = authority else {
        return false;
    };
    let name = authority.host().trim_matches(['[', ']']);
    if !name.parse::<IpAddr>().is_ok_and(private) && name != "localhost" {
        return false;
    }
    let expected = if authority.port_u16() == Some(443) {
        format!("https://{}", authority.host())
    } else {
        format!("https://{authority}")
    };
    request
        .headers()
        .get(header::ORIGIN)
        .is_some_and(|origin| origin.as_bytes() == expected.as_bytes())
}

pub(super) fn cookie(value: &str, max_age: i64) -> ApiResult<HeaderValue> {
    HeaderValue::from_str(&format!(
        "{COOKIE}={value}; Path=/; Max-Age={max_age}; Secure; HttpOnly; SameSite=Strict"
    ))
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)
}

fn credential(headers: &HeaderMap) -> ApiResult<&str> {
    let prefix = format!("{COOKIE}=");
    let mut matching = headers
        .get_all(header::COOKIE)
        .iter()
        .filter_map(|value| value.to_str().ok())
        .flat_map(|value| value.split(';'))
        .filter_map(|value| value.trim().strip_prefix(&prefix));
    let value = matching.next().ok_or(StatusCode::UNAUTHORIZED)?;
    if matching.next().is_some()
        || value.len() != 64
        || !value.bytes().all(|b| b.is_ascii_hexdigit())
    {
        return Err(StatusCode::UNAUTHORIZED);
    }
    Ok(value)
}

fn csrf(credential: &str) -> String {
    let mut digest = Sha256::new();
    digest.update(b"vaultor-next/browser-csrf\0");
    digest.update(credential.as_bytes());
    hex::encode(digest.finalize())
}

fn verify_mutation(headers: &HeaderMap, credential: &str) -> ApiResult<()> {
    if !headers.contains_key(header::ORIGIN)
        || !headers
            .get("x-vaultor-csrf")
            .is_some_and(|proof| bool::from(proof.as_bytes().ct_eq(csrf(credential).as_bytes())))
    {
        return Err(StatusCode::FORBIDDEN);
    }
    Ok(())
}

async fn browser_only(mut request: HttpRequest, next: Next) -> ApiResult<Response> {
    let credential = credential(request.headers())?;
    if !matches!(*request.method(), Method::GET | Method::HEAD) {
        verify_mutation(request.headers(), credential)?;
    }
    let authorization = HeaderValue::from_str(&format!("{INTERNAL_AUTH}{credential}"))
        .map_err(|_| StatusCode::UNAUTHORIZED)?;
    request
        .headers_mut()
        .insert(header::AUTHORIZATION, authorization);
    Ok(next.run(request).await)
}

async fn authenticate(host: &Host, headers: &HeaderMap) -> ApiResult<Grant> {
    if host.stop.is_cancelled() {
        return Err(StatusCode::SERVICE_UNAVAILABLE);
    }
    access::authenticate(&host.access, credential(headers)?, true).await
}

async fn session(State(host): State<Host>, headers: HeaderMap) -> ApiResult<Json<Value>> {
    let grant = authenticate(&host, &headers).await?;
    Ok(Json(
        json!({"role":"BROWSER","deviceId":grant.device,"csrf":csrf(credential(&headers)?)}),
    ))
}

async fn logout(State(host): State<Host>, headers: HeaderMap) -> ApiResult<Response> {
    let grant = authenticate(&host, &headers).await?;
    verify_mutation(&headers, credential(&headers)?)?;
    tokio::task::spawn_blocking(move || host.owner_command(&format!("revoke {}", grant.device)))
        .await
        .map_err(|_| StatusCode::SERVICE_UNAVAILABLE)?
        .map_err(|_| StatusCode::SERVICE_UNAVAILABLE)?;
    Ok((
        [(header::SET_COOKIE, cookie("", 0)?)],
        StatusCode::NO_CONTENT,
    )
        .into_response())
}

fn asset(kind: &'static str, content: impl Into<Body>) -> Response {
    (
        [
            (header::CONTENT_TYPE, kind),
            (header::CONTENT_SECURITY_POLICY, CSP),
            (header::REFERRER_POLICY, "no-referrer"),
        ],
        content.into(),
    )
        .into_response()
}

async fn home(State(host): State<Host>, headers: HeaderMap) -> Response {
    if authenticate(&host, &headers).await.is_err() {
        return Redirect::to("/access").into_response();
    }
    match embedded("browser.html") {
        Some(content) => asset("text/html; charset=utf-8", content),
        None => (
            StatusCode::SERVICE_UNAVAILABLE,
            "Browser assets are missing. Use the bundled host build.",
        )
            .into_response(),
    }
}

async fn browser_asset(
    State(host): State<Host>,
    OriginalUri(uri): OriginalUri,
    headers: HeaderMap,
) -> ApiResult<Response> {
    authenticate(&host, &headers).await?;
    let path = uri
        .path()
        .strip_prefix("/browser/")
        .ok_or(StatusCode::NOT_FOUND)?;
    let content = embedded(path).ok_or(StatusCode::NOT_FOUND)?;
    let kind = match path.rsplit('.').next() {
        Some("js" | "mjs") => "text/javascript; charset=utf-8",
        Some("css") => "text/css; charset=utf-8",
        Some("woff2") => "font/woff2",
        _ => "application/octet-stream",
    };
    Ok(asset(kind, content))
}

async fn preview(
    State(host): State<Host>,
    RoutePath(id): RoutePath<Uuid>,
    headers: HeaderMap,
) -> ApiResult<Response> {
    let workspace = mobile::selected(&host, &headers).map_err(|e| e.0)?;
    host.authorize(&headers, workspace).await?;
    let id = id.to_string();
    let target = id.clone();
    let item = host
        .storage
        .call_host(&host.root, move |ws| mobile::summary(ws, &target, false))
        .await
        .map_err(|_| StatusCode::NOT_FOUND)?;
    let mime = match item["mimeType"].as_str() {
        Some(
            mime @ ("image/png" | "image/jpeg" | "image/gif" | "image/webp" | "application/pdf"
            | "audio/mpeg" | "audio/wav" | "audio/ogg" | "audio/mp4" | "audio/flac"
            | "video/mp4" | "video/webm"),
        ) => mime,
        _ => return Err(StatusCode::UNSUPPORTED_MEDIA_TYPE),
    };
    let mut response = file(State(host), RoutePath((workspace, id)), headers).await?;
    if response.status().is_success() {
        response.headers_mut().insert(
            header::CONTENT_TYPE,
            HeaderValue::from_str(mime).map_err(|_| StatusCode::UNSUPPORTED_MEDIA_TYPE)?,
        );
        response.headers_mut().insert(
            header::CONTENT_DISPOSITION,
            HeaderValue::from_static("inline"),
        );
    }
    Ok(response)
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct SaveNote {
    revision: i64,
    title: String,
    content: Value,
}

async fn save_note(
    State(host): State<Host>,
    RoutePath(id): RoutePath<Uuid>,
    headers: HeaderMap,
    Json(input): Json<SaveNote>,
) -> ApiResult<Json<Value>> {
    let workspace = headers
        .get("x-vaultor-workspace")
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.parse::<Uuid>().ok())
        .ok_or(StatusCode::BAD_REQUEST)?;
    let permit = host
        .requests
        .try_acquire()
        .map_err(|_| StatusCode::SERVICE_UNAVAILABLE)?;
    let grant = host.authorize(&headers, workspace).await?;
    let access = host.access.clone();
    let stop = host.stop.clone();
    let gate = host.enrollment.clone();
    let result = host
        .storage
        .call_host(&host.root, move |ws| {
            let _guard = gate.lock().map_err(crate::domain::error)?;
            if stop.is_cancelled()
                || !grant.current_sync(&access, workspace)
                || ws.review_generation()? != workspace.to_string()
            {
                return Ok(Value::Null);
            }
            let id = id.to_string();
            let protected = ws
                .db
                .query_row(
                    "SELECT EXISTS(SELECT 1 FROM drafts WHERE resource_id=?1)",
                    [&id],
                    |r| r.get::<_, bool>(0),
                )
                .map_err(crate::domain::error)?;
            if protected {
                return Err("Local draft retained".into());
            }
            ws.execute(Request::Save {
                id,
                revision: input.revision,
                title: input.title,
                content: input.content,
                proof: None,
            })
        })
        .await
        .map_err(|_| StatusCode::CONFLICT)?;
    drop(permit);
    if result.is_null() {
        return Err(StatusCode::FORBIDDEN);
    }
    Ok(Json(result))
}
