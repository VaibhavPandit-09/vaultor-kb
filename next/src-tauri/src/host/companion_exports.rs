//! Short-lived Android export receipts over the existing Rust transfer jobs.
use super::*;
use crate::{activity::Activity, transfers::Job};
use serde::Serialize;
use std::{collections::HashMap, fs, path::Path, time::Instant};

const MAX_BYTES: u64 = 256 * 1024 * 1024;
const EXPORT_TTL: Duration = Duration::from_secs(15 * 60);
pub(super) type Exports = Arc<Mutex<HashMap<Uuid, Arc<Export>>>>;

#[derive(Clone, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
struct Intent {
    generation: Uuid,
    scope: String,
    format: String,
    depth: u8,
    ids: Vec<Uuid>,
}

struct Artifact {
    file: PathBuf,
    name: String,
    media_type: &'static str,
    bytes: u64,
    sha256: String,
}

enum Progress {
    Running,
    Ready(Artifact),
    Failed,
}

pub(super) struct Export {
    device: Uuid,
    intent: Intent,
    created: Instant,
    progress: Mutex<Progress>,
    directory: tempfile::TempDir,
}

pub(super) fn router() -> Router<Host> {
    Router::new()
        .route("/companions/export-capabilities", get(capabilities))
        .route("/companions/exports/{id}", get(status).put(start))
        .route("/companions/exports/{id}/download", get(download_export))
}

async fn capabilities(State(host): State<Host>, headers: HeaderMap) -> ApiResult<Json<Value>> {
    host.authorize(
        &headers,
        mobile::selected(&host, &headers).map_err(|error| error.0)?,
    )
    .await?;
    Ok(Json(
        json!({"version":1,"maxBytes":MAX_BYTES,"archive":"vaultor","linkedDepth":0}),
    ))
}

impl Intent {
    fn job(&self, destination: &Path) -> ApiResult<(Job, &'static str, &'static str)> {
        if self.depth != 0 || self.ids.len() > 100 {
            return Err(StatusCode::UNPROCESSABLE_ENTITY);
        }
        let path = destination
            .to_str()
            .ok_or(StatusCode::SERVICE_UNAVAILABLE)?
            .to_owned();
        let ids: Vec<_> = self.ids.iter().map(Uuid::to_string).collect();
        let archive = match (self.scope.as_str(), self.format.as_str(), ids.as_slice()) {
            ("workspace", "zip", []) => Some(None),
            ("resources", "partial", [_, ..]) => Some(Some((ids.clone(), None))),
            ("collection", "partial", [collection]) => {
                Some(Some((vec![], Some(collection.clone()))))
            }
            _ => None,
        };
        if let Some(selection) = archive {
            return Ok((
                Job::CompanionArchive {
                    destination: path,
                    selection,
                },
                ".vaultor",
                "application/octet-stream",
            ));
        }
        let ("note", [_]) = (self.scope.as_str(), ids.as_slice()) else {
            return Err(StatusCode::UNPROCESSABLE_ENTITY);
        };
        let (format, extension, mime) = match self.format.as_str() {
            "md" => ("markdown", ".md", "text/markdown"),
            "md-assets" => ("markdownZip", ".zip", "application/zip"),
            "pdf" => ("pdf", ".pdf", "application/pdf"),
            "docx" => (
                "docx",
                ".docx",
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            ),
            _ => return Err(StatusCode::UNPROCESSABLE_ENTITY),
        };
        Ok((
            Job::CompanionNote {
                destination: path,
                ids,
                format: format.into(),
            },
            extension,
            mime,
        ))
    }
}

fn receipt(id: Uuid, export: &Export) -> ApiResult<Json<Value>> {
    let mut response = json!({"version":1, "id":id, "generation":export.intent.generation, "request":export.intent});
    match &*export
        .progress
        .lock()
        .map_err(|_| StatusCode::SERVICE_UNAVAILABLE)?
    {
        Progress::Running => response["operation"] = json!({"status":"RUNNING"}),
        Progress::Failed => {
            response["operation"] = json!({"status":"FAILED","detail":"Export unavailable or interrupted. Verify the selection, then retry."})
        }
        Progress::Ready(a) => {
            response["operation"] =
                json!({"status":"SUCCEEDED","filename":a.name,"mediaType":a.media_type});
            response["bytes"] = json!(a.bytes);
            response["sha256"] = json!(a.sha256);
        }
    };
    Ok(Json(response))
}

async fn start(
    State(host): State<Host>,
    RoutePath(id): RoutePath<Uuid>,
    headers: HeaderMap,
    Json(intent): Json<Intent>,
) -> ApiResult<Json<Value>> {
    let workspace = mobile::selected(&host, &headers).map_err(|error| error.0)?;
    let grant = host.authorize(&headers, workspace).await?;
    if intent.generation != workspace {
        return Err(StatusCode::CONFLICT);
    }
    let mut exports = host
        .companion_exports
        .lock()
        .map_err(|_| StatusCode::SERVICE_UNAVAILABLE)?;
    exports.retain(|_, value| value.created.elapsed() < EXPORT_TTL);
    if let Some(existing) = exports.get(&id) {
        if existing.device != grant.device {
            return Err(StatusCode::NOT_FOUND);
        }
        if existing.intent != intent {
            return Err(StatusCode::CONFLICT);
        }
        if !matches!(
            *existing
                .progress
                .lock()
                .map_err(|_| StatusCode::SERVICE_UNAVAILABLE)?,
            Progress::Failed
        ) {
            return receipt(id, existing);
        }
        exports.remove(&id);
    }
    if exports.len() >= 4 {
        return Err(StatusCode::TOO_MANY_REQUESTS);
    }
    let directory = tempfile::Builder::new()
        .prefix("vaultor-export-")
        .tempdir()
        .map_err(|_| StatusCode::SERVICE_UNAVAILABLE)?;
    let destination = directory.path().join("artifact");
    let (job, extension, media_type) = intent.job(&destination)?;
    let export = Arc::new(Export {
        device: grant.device,
        intent,
        created: Instant::now(),
        progress: Mutex::new(Progress::Running),
        directory,
    });
    exports.insert(id, export.clone());
    drop(exports);
    let worker = export.clone();
    let weak_host = Arc::downgrade(&host.companion_exports);
    let stop = host.stop.clone();
    let deadline = tokio::time::Instant::now() + EXPORT_TTL;
    tokio::spawn(async move {
        tokio::select! { _ = tokio::time::sleep_until(deadline) => {}, _ = stop.cancelled() => {} }
        if let Some(exports) = weak_host.upgrade() {
            if let Ok(mut entries) = exports.lock() {
                if entries.get(&id).is_some_and(|value| {
                    value.created.elapsed() >= EXPORT_TTL || stop.is_cancelled()
                }) {
                    entries.remove(&id);
                }
            }
        }
    });
    tokio::task::spawn_blocking(move || {
        let result = prepare(
            &host,
            &grant,
            &worker,
            job,
            destination,
            extension,
            media_type,
        );
        if let Ok(mut progress) = worker.progress.lock() {
            *progress = result.map_or(Progress::Failed, Progress::Ready);
        }
    });
    receipt(id, &export)
}

fn prepare(
    host: &Host,
    grant: &Grant,
    export: &Export,
    job: Job,
    destination: PathBuf,
    extension: &str,
    media_type: &'static str,
) -> Result<Artifact, String> {
    let root = host
        .root
        .to_str()
        .ok_or("Invalid workspace path")?
        .to_owned();
    let active = || {
        !host.stop.is_cancelled()
            && export.created.elapsed() < EXPORT_TTL
            && grant.current_sync(&host.access, export.intent.generation)
    };
    if !active() {
        return Err("Export authorization ended".into());
    }
    let activity = Activity::new(
        export.directory.path().join("activity.json"),
        host.storage.clone(),
        |_| {},
    )?;
    let ticket = activity.submit(root, job)?;
    let id = ticket["id"].as_str().ok_or("No job receipt")?;
    loop {
        let task = activity
            .list()
            .into_iter()
            .find(|task| task.id == id)
            .ok_or("Export task disappeared")?;
        if task.finished.is_some() {
            if task.state != "completed" || !active() {
                return Err("Export incomplete".into());
            }
            break;
        }
        if !active() {
            let _ = activity.cancel(id);
        }
        std::thread::sleep(Duration::from_millis(200));
    }
    let (file, name) = if destination.is_dir() {
        let mut items = fs::read_dir(&destination).map_err(crate::domain::error)?;
        let entry = items
            .next()
            .ok_or("No exported file")?
            .map_err(crate::domain::error)?;
        let name = entry
            .file_name()
            .into_string()
            .map_err(|_| "Invalid export name")?;
        if items.next().is_some() || !name.ends_with(extension) {
            return Err("Unexpected export output".into());
        }
        (entry.path(), name)
    } else {
        (destination, format!("Vaultor workspace{extension}"))
    };
    let (bytes, sha256) = crate::transfers::copy_hash(
        fs::File::open(&file).map_err(crate::domain::error)?,
        io::sink(),
        MAX_BYTES,
        |_| {
            if active() {
                Ok(())
            } else {
                Err("Export authorization ended".into())
            }
        },
    )?;
    if bytes == 0 {
        return Err("Export is empty".into());
    }
    Ok(Artifact {
        file,
        name,
        media_type,
        bytes,
        sha256,
    })
}

#[derive(Deserialize)]
struct Generation {
    generation: Uuid,
}

async fn authorize_export(
    host: &Host,
    headers: &HeaderMap,
    id: Uuid,
    generation: Uuid,
) -> ApiResult<(Grant, Arc<Export>)> {
    let workspace = mobile::selected(host, headers).map_err(|error| error.0)?;
    let grant = host.authorize(headers, workspace).await?;
    if generation != workspace {
        return Err(StatusCode::CONFLICT);
    }
    let entries = host
        .companion_exports
        .lock()
        .map_err(|_| StatusCode::SERVICE_UNAVAILABLE)?;
    let export = entries
        .get(&id)
        .filter(|value| value.device == grant.device && value.created.elapsed() < EXPORT_TTL)
        .cloned()
        .ok_or(StatusCode::NOT_FOUND)?;
    Ok((grant, export))
}

async fn status(
    State(host): State<Host>,
    RoutePath(id): RoutePath<Uuid>,
    Query(query): Query<Generation>,
    headers: HeaderMap,
) -> ApiResult<Json<Value>> {
    let (_, export) = authorize_export(&host, &headers, id, query.generation).await?;
    receipt(id, &export)
}

async fn download_export(
    State(host): State<Host>,
    RoutePath(id): RoutePath<Uuid>,
    Query(query): Query<Generation>,
    headers: HeaderMap,
) -> ApiResult<Response> {
    let (grant, export) = authorize_export(&host, &headers, id, query.generation).await?;
    let (path, bytes, sha256, media_type) = {
        let progress = export
            .progress
            .lock()
            .map_err(|_| StatusCode::SERVICE_UNAVAILABLE)?;
        let Progress::Ready(artifact) = &*progress else {
            return Err(StatusCode::CONFLICT);
        };
        (
            artifact.file.clone(),
            artifact.bytes,
            artifact.sha256.clone(),
            artifact.media_type,
        )
    };
    let permit = host
        .streams
        .clone()
        .try_acquire_owned()
        .map_err(|_| StatusCode::TOO_MANY_REQUESTS)?;
    let file = tokio::fs::File::open(path)
        .await
        .map_err(|_| StatusCode::NOT_FOUND)?;
    Ok((
        [
            (header::CONTENT_TYPE.as_str(), media_type.to_owned()),
            (header::CONTENT_LENGTH.as_str(), bytes.to_string()),
            ("x-vaultor-sha256", sha256),
        ],
        Body::from_stream(download::stream(file, bytes, host, grant, permit)),
    )
        .into_response())
}
