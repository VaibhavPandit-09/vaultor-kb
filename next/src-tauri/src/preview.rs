//! Read-only, bounded WebView media ranges. Tokens identify opened originals,
//! never a renderer-supplied filesystem path.
use sha2::{Digest, Sha256};
use std::{
    collections::HashMap,
    fs::File,
    io::{Read, Seek, SeekFrom},
    sync::{Arc, Mutex},
};
use tauri::{http, Manager};
use uuid::Uuid;
use vaultor_next::{domain::Request, worker::Worker};

const LIMIT: u64 = 512 * 1024 * 1024;
const CHUNK: u64 = 2 * 1024 * 1024;

struct Clip {
    root: String,
    id: String,
    file: Mutex<File>,
    mime: &'static str,
    size: u64,
    modified: std::time::SystemTime,
}

pub struct Previews {
    clips: Mutex<HashMap<String, Arc<Clip>>>,
    reads: Arc<tokio::sync::Semaphore>,
}
impl Default for Previews {
    fn default() -> Self {
        Self {
            clips: Mutex::new(HashMap::new()),
            reads: Arc::new(tokio::sync::Semaphore::new(4)),
        }
    }
}
impl Previews {
    pub fn clear(&self) {
        self.clips.lock().unwrap().clear();
    }
}

fn media_mime(name: &str) -> Option<&'static str> {
    let extension = std::path::Path::new(name)
        .extension()?
        .to_str()?
        .to_ascii_lowercase();
    Some(match extension.as_str() {
        "mp3" => "audio/mpeg",
        "wav" => "audio/wav",
        "ogg" | "opus" => "audio/ogg",
        "flac" => "audio/flac",
        "m4a" => "audio/mp4",
        "mp4" => "video/mp4",
        "webm" => "video/webm",
        _ => return None,
    })
}

#[tauri::command]
pub async fn open_media_preview(
    app: tauri::AppHandle,
    id: String,
    workspace: String,
) -> Result<String, String> {
    let storage = app.state::<Worker>().storage();
    let previews = app.state::<Previews>().reads.clone();
    let _permit = previews
        .try_acquire_owned()
        .map_err(|_| "Preview reader is busy")?;
    tauri::async_runtime::spawn_blocking(move || {
        let owned_id = id.clone();
        let receipt = storage.call(&workspace, move |db| {
            let info = db.media(serde_json::json!({"op":"info","id":owned_id}))?;
            Ok(serde_json::json!({
                "path":db.managed_path(&owned_id)?,"name":info["name"],"size":info["bytes"],"hash":info["hash"]
            }))
        })?;
        let name = receipt["name"].as_str().ok_or("Missing media name")?;
        let mime = media_mime(name).ok_or("No inline player for this format")?;
        let mut file = vaultor_next::transfers::plain_file(std::path::Path::new(
            receipt["path"].as_str().ok_or("Missing managed original")?,
        ))?;
        let metadata = file.metadata().map_err(|error| error.to_string())?;
        let size = metadata.len();
        let modified = metadata.modified().map_err(|error|error.to_string())?;
        if size == 0 || size > LIMIT || receipt["size"].as_u64() != Some(size) {
            return Err("Media is empty, changed, or exceeds the 512 MiB preview limit".into());
        }
        let mut hash = Sha256::new();
        let read = std::io::copy(&mut (&mut file).take(size+1), &mut hash).map_err(|error|error.to_string())?;
        if read != size || receipt["hash"].as_str() != Some(&format!("{:x}",hash.finalize())) {
            return Err("Managed original integrity mismatch".into());
        }
        let check = id.clone();
        storage.call(&workspace, move|db| {db.managed_path(&check)?; Ok(serde_json::Value::Null)})?;
        let token = Uuid::new_v4().to_string();
        let state=app.state::<Previews>();
        let mut clips=state.clips.lock().unwrap();
        if clips.len() >= 4 {
            return Err("Close an existing media preview and retry".into());
        }
        clips.insert(token.clone(), Arc::new(Clip{root:workspace,id,file:Mutex::new(file),mime,size,modified}));
        Ok(token)
    }).await.map_err(|error|error.to_string())?
}

#[tauri::command]
pub fn close_media_preview(token: String, previews: tauri::State<'_, Previews>) {
    previews.clips.lock().unwrap().remove(&token);
}

fn range(value: Option<&str>, size: u64) -> Option<(u64, u64)> {
    if size == 0 {
        return None;
    }
    let Some(value) = value else {
        return Some((0, size.min(CHUNK) - 1));
    };
    let (left, right) = value.strip_prefix("bytes=")?.split_once('-')?;
    if left.is_empty() {
        let length = right.parse::<u64>().ok()?.min(size).min(CHUNK);
        return (length > 0).then(|| (size - length, size - 1));
    }
    let start = left.parse::<u64>().ok()?;
    let last = if right.is_empty() {
        size - 1
    } else {
        right.parse::<u64>().ok()?.min(size - 1)
    };
    (start <= last).then(|| (start, last.min(start.saturating_add(CHUNK - 1))))
}

pub fn respond(
    context: tauri::UriSchemeContext<'_, tauri::Wry>,
    request: http::Request<Vec<u8>>,
    responder: tauri::UriSchemeResponder,
) {
    let app = context.app_handle().clone();
    tauri::async_runtime::spawn(async move {
        let reply = if let Some(state) = app.try_state::<Previews>() {
            let token = request.uri().path().trim_start_matches('/').to_string();
            let clip = state.clips.lock().unwrap().get(&token).cloned();
            match (clip, state.reads.clone().try_acquire_owned()) {
                (Some(clip), Ok(permit))
                    if request.method() == http::Method::GET
                        || request.method() == http::Method::HEAD =>
                {
                    let root = app.state::<Worker>().call(Request::Snapshot).await.ok();
                    if root.as_ref().and_then(|value| value["path"].as_str()) != Some(&clip.root) {
                        empty(404)
                    } else {
                        let app = app.clone();
                        tauri::async_runtime::spawn_blocking(move || {
                            let _permit = permit;
                            let storage = app.state::<Worker>().storage();
                            let id = clip.id.clone();
                            if storage
                                .call(&clip.root, move |db| {
                                    db.managed_path(&id)?;
                                    Ok(serde_json::Value::Null)
                                })
                                .is_err()
                            {
                                return empty(404);
                            }
                            let reply = read_clip(&clip, &request);
                            if app
                                .state::<Previews>()
                                .clips
                                .lock()
                                .unwrap()
                                .contains_key(&token)
                            {
                                reply
                            } else {
                                empty(404)
                            }
                        })
                        .await
                        .unwrap_or_else(|_| empty(500))
                    }
                }
                (Some(_), Err(_)) => empty(503),
                _ => empty(404),
            }
        } else {
            empty(404)
        };
        responder.respond(reply);
    });
}

fn empty(status: u16) -> http::Response<Vec<u8>> {
    http::Response::builder()
        .status(status)
        .header("Cache-Control", "no-store")
        .body(Vec::new())
        .unwrap()
}

fn read_clip(clip: &Clip, request: &http::Request<Vec<u8>>) -> http::Response<Vec<u8>> {
    let header = request
        .headers()
        .get("range")
        .and_then(|value| value.to_str().ok());
    let Some((start, end)) = range(header, clip.size) else {
        return http::Response::builder()
            .status(416)
            .header("Content-Range", format!("bytes */{}", clip.size))
            .body(Vec::new())
            .unwrap();
    };
    let head = request.method() == http::Method::HEAD;
    let partial = !head && (header.is_some() || end + 1 < clip.size);
    let mut response = http::Response::builder()
        .status(if partial { 206 } else { 200 })
        .header("Accept-Ranges", "bytes")
        .header("Content-Type", clip.mime)
        .header("X-Content-Type-Options", "nosniff")
        .header("Cache-Control", "no-store");
    if partial {
        response = response.header(
            "Content-Range",
            format!("bytes {start}-{end}/{}", clip.size),
        );
    }
    let size = if head { clip.size } else { end - start + 1 };
    let mut data = Vec::new();
    if !head {
        let mut file = clip.file.lock().unwrap();
        let valid = || {
            file.metadata().ok().is_some_and(|meta| {
                meta.len() == clip.size && meta.modified().ok() == Some(clip.modified)
            })
        };
        if !valid() {
            return empty(404);
        }
        data.resize(size as usize, 0);
        if file
            .seek(SeekFrom::Start(start))
            .and_then(|_| file.read_exact(&mut data))
            .is_err()
        {
            return empty(404);
        }
    }
    response
        .header("Content-Length", size.to_string())
        .body(data)
        .unwrap()
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn media_ranges_bound_reads_and_refuse_invalid_requests() {
        assert_eq!(range(Some("bytes=7-"), CHUNK * 2), Some((7, 7 + CHUNK - 1)));
        assert_eq!(range(Some("bytes=-3"), 40), Some((37, 39)));
        assert_eq!(range(Some("bytes=0-1,4-5"), 40), None);
        assert_eq!(range(Some("bytes=40-"), 40), None);
        assert_eq!(range(Some("bytes=-0"), 40), None);
        assert_eq!(media_mime("report.docx"), None);
    }
}
