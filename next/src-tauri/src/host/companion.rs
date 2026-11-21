//! Authenticated Android transfer adapter for the existing managed-resource owner.
use super::*;
use crate::transfers::companion::{self, Intent};
use axum::extract::Multipart;
use mobile::{MobileResult, Problem};
use sha2::{Digest, Sha256};
use tokio::io::AsyncWriteExt;

const MAX_UPLOAD: u64 = 64 * 1024 * 1024;

pub(super) fn router() -> Router<Host> {
    Router::new()
        .route("/companions/import-capabilities", get(import_capabilities))
        .route(
            "/resources/collected-imports/{id}",
            get(receipt)
                .put(upload)
                .layer(DefaultBodyLimit::max(MAX_UPLOAD as usize + 16 * 1024)),
        )
}

async fn import_capabilities(
    State(host): State<Host>,
    headers: HeaderMap,
) -> MobileResult<Json<Value>> {
    host.authorize(&headers, mobile::selected(&host, &headers)?)
        .await?;
    Ok(Json(
        json!({"version":1,"maxBytes":MAX_UPLOAD,"modes":["original","text","markdown"],"workspaceZip":false}),
    ))
}

fn import_failure(message: &str) -> Problem {
    match message {
        "IMPORT_NOT_FOUND" => Problem(
            StatusCode::NOT_FOUND,
            "IMPORT_NOT_FOUND",
            "No receipt for this device.",
        ),
        "IMPORT_ID_REUSED" => Problem(
            StatusCode::CONFLICT,
            "IMPORT_ID_REUSED",
            "This operation already has another import intent.",
        ),
        "IMPORT_RECEIPT_LIMIT" => Problem(
            StatusCode::CONFLICT,
            "IMPORT_RECEIPT_LIMIT",
            "This workspace has reached its import receipt limit.",
        ),
        _ => Problem(
            StatusCode::SERVICE_UNAVAILABLE,
            "HOST_UNAVAILABLE",
            "The import could not be committed. Retry the same operation.",
        ),
    }
}

async fn receipt(
    State(host): State<Host>,
    RoutePath(id): RoutePath<Uuid>,
    headers: HeaderMap,
) -> MobileResult<Json<Value>> {
    let workspace = mobile::selected(&host, &headers)?;
    let device = host.authorize(&headers, workspace).await?.device;
    let value = host
        .storage
        .call_host(&host.root, move |ws| {
            if ws.review_generation()? != workspace.to_string() {
                return Err("IMPORT_NOT_FOUND".into());
            }
            companion::import_receipt(ws, id, device)
        })
        .await
        .map_err(|e| import_failure(&e))?;
    host.authorize(&headers, workspace).await?;
    import_result(value)
}

fn import_result(value: Value) -> MobileResult<Json<Value>> {
    match value["code"].as_str() {
        Some("IMPORT_COLLECTION_UNAVAILABLE") => Err(Problem(
            StatusCode::CONFLICT,
            "IMPORT_COLLECTION_UNAVAILABLE",
            "The confirmed collection is unavailable.",
        )),
        Some("IMPORT_CONVERSION_LIMIT") => Err(Problem(
            StatusCode::UNPROCESSABLE_ENTITY,
            "IMPORT_CONVERSION_LIMIT",
            "Text and Markdown conversion support up to 256 KiB.",
        )),
        Some("IMPORT_ENCODING_UNSUPPORTED") => Err(Problem(
            StatusCode::UNPROCESSABLE_ENTITY,
            "IMPORT_ENCODING_UNSUPPORTED",
            "The selected conversion cannot preserve this input.",
        )),
        _ if value.is_null() => Err(StatusCode::FORBIDDEN.into()),
        _ => Ok(Json(value)),
    }
}

async fn upload(
    State(host): State<Host>,
    RoutePath(id): RoutePath<Uuid>,
    headers: HeaderMap,
    mut form: Multipart,
) -> MobileResult<Json<Value>> {
    let workspace = mobile::selected(&host, &headers)?;
    let grant = host.authorize(&headers, workspace).await?;
    let _permit = host
        .updates
        .try_acquire()
        .map_err(|_| StatusCode::TOO_MANY_REQUESTS)?;
    let malformed = || StatusCode::BAD_REQUEST;
    let mut field = form
        .next_field()
        .await
        .map_err(|_| malformed())?
        .ok_or_else(malformed)?;
    if field.name() != Some("intent") {
        return Err(malformed().into());
    }
    let mut data = Vec::with_capacity(2048);
    while let Some(chunk) = field.chunk().await.map_err(|_| malformed())? {
        if data.len() + chunk.len() > 4096 {
            return Err(malformed().into());
        }
        data.extend_from_slice(&chunk);
    }
    drop(field);
    let intent: Intent = serde_json::from_slice(&data).map_err(|_| malformed())?;
    intent.validate().map_err(|_| malformed())?;
    if intent.generation != workspace {
        return Err(Problem(
            StatusCode::CONFLICT,
            "IMPORT_GENERATION_CHANGED",
            "The workspace generation changed.",
        ));
    }
    if intent.bytes > MAX_UPLOAD {
        return Err(StatusCode::PAYLOAD_TOO_LARGE.into());
    }
    let stage = tempfile::Builder::new()
        .prefix(".vaultor-companion-")
        .tempfile_in(&*host.root)
        .map_err(|_| StatusCode::SERVICE_UNAVAILABLE)?;
    let (file, staged) = stage.into_parts();
    let mut out = tokio::fs::File::from_std(file);
    let mut field = form
        .next_field()
        .await
        .map_err(|_| malformed())?
        .ok_or_else(malformed)?;
    if field.name() != Some("file") {
        return Err(malformed().into());
    }
    let mut bytes = 0_u64;
    let mut digest = Sha256::new();
    let mut check = tokio::time::Instant::now();
    while let Some(chunk) = tokio::time::timeout(Duration::from_secs(20), field.chunk())
        .await
        .map_err(|_| StatusCode::REQUEST_TIMEOUT)?
        .map_err(|_| malformed())?
    {
        if check.elapsed() >= Duration::from_secs(1) {
            if host.stop.is_cancelled() || !grant.current(&host.access, workspace).await {
                return Err(StatusCode::FORBIDDEN.into());
            }
            check = tokio::time::Instant::now();
        }
        bytes += chunk.len() as u64;
        if bytes > intent.bytes {
            return Err(StatusCode::PAYLOAD_TOO_LARGE.into());
        }
        digest.update(&chunk);
        out.write_all(&chunk)
            .await
            .map_err(|_| StatusCode::SERVICE_UNAVAILABLE)?;
    }
    drop(field);
    if bytes != intent.bytes
        || format!("{:x}", digest.finalize()) != intent.sha256
        || form.next_field().await.map_err(|_| malformed())?.is_some()
    {
        return Err(malformed().into());
    }
    out.sync_all()
        .await
        .map_err(|_| StatusCode::SERVICE_UNAVAILABLE)?;
    drop(out);
    let (intent, staged, prepared, extracted) = tokio::task::spawn_blocking(move || {
        let prepared = intent.prepare(&staged);
        let extracted = prepared
            .as_ref()
            .ok()
            .filter(|(_, kind)| *kind == "file")
            .map(|_| {
                let (state, body) = crate::file_text::extract(
                    &staged,
                    &intent.filename,
                    &intent.sha256,
                    intent.bytes,
                );
                (state.to_owned(), body)
            });
        (intent, staged, prepared, extracted)
    })
    .await
    .map_err(|_| StatusCode::SERVICE_UNAVAILABLE)?;
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
            companion::import(ws, id, grant.device, intent, &staged, prepared, extracted)
        })
        .await
        .map_err(|e| import_failure(&e))?;
    host.authorize(&headers, workspace).await?;
    import_result(result)
}
