#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
use std::sync::Arc;
use tauri::{Emitter, Manager};
use vaultor_next::{
    activity::Activity,
    transfers::{Request as TransferRequest, Transfers},
};
use vaultor_next::{domain::Request, worker::Worker};

#[tauri::command]
async fn workspace(
    request: Request,
    state: tauri::State<'_, Worker>,
) -> Result<serde_json::Value, String> {
    state.call(request).await
}
#[tauri::command]
async fn transfer(
    request: TransferRequest,
    state: tauri::State<'_, Arc<Transfers>>,
    worker: tauri::State<'_, Worker>,
) -> Result<serde_json::Value, String> {
    let root = if matches!(
        &request,
        TransferRequest::Tasks | TransferRequest::Cancel { .. }
    ) {
        String::new()
    } else {
        worker.call(Request::Snapshot).await?["path"]
            .as_str()
            .ok_or("Workspace unavailable")?
            .to_string()
    };
    let service = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || service.execute(root, request))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn resource_bytes(
    id: String,
    worker: tauri::State<'_, Worker>,
) -> Result<tauri::ipc::Response, String> {
    let root = worker.call(Request::Snapshot).await?["path"]
        .as_str()
        .unwrap()
        .to_string();
    let storage = worker.storage();
    tauri::async_runtime::spawn_blocking(move || {
        let info = storage.call(&root, move |w| {
            let info = w.media(serde_json::json!({"op":"info","id":id}))?;
            Ok(serde_json::json!({"path":w.managed_path(&id)?,"hash":info["hash"]}))
        })?;
        vaultor_next::media::read_original(
            info["path"].as_str().unwrap().into(),
            info["hash"].as_str().unwrap(),
        )
        .map(tauri::ipc::Response::new)
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
async fn attachment(
    request: tauri::ipc::Request<'_>,
    worker: tauri::State<'_, Worker>,
) -> Result<serde_json::Value, String> {
    let bytes = match request.body() {
        tauri::ipc::InvokeBody::Raw(b) => b.clone(),
        _ => return Err("Expected binary attachment".into()),
    };
    if bytes.len() > 20 * 1024 * 1024 {
        return Err("Attachment exceeds20MiB".into());
    }
    let name = request
        .headers()
        .get("x-file-name")
        .and_then(|h| h.to_str().ok())
        .unwrap_or("image.png");
    let name = percent_encoding::percent_decode_str(name)
        .decode_utf8()
        .map_err(|e| e.to_string())?
        .to_string();
    if name.is_empty()
        || name.len() > 960
        || name
            .chars()
            .any(|c| "<>:\"/\\|?*".contains(c) || c.is_control())
    {
        return Err("Invalid attachment name".into());
    }
    let Some((_, w, h)) = vaultor_next::media::image_type(&bytes) else {
        return Err("Paste/select PNG,JPEG or GIF images;other files use Import".into());
    };
    if w == 0 || h == 0 || w as u64 * h as u64 > 40_000_000 {
        return Err("Image exceeds40million pixels".into());
    }
    let root = worker.call(Request::Snapshot).await?["path"]
        .as_str()
        .unwrap()
        .to_string();
    let storage = worker.storage();
    tauri::async_runtime::spawn_blocking(move || {
        use sha2::{Digest, Sha256};
        let id = uuid::Uuid::new_v4().to_string();
        let key = id.clone();
        let path = storage.call(&root, move |w| {
            let target = w.new_media_path(&key)?;
            std::fs::create_dir_all(target.parent().unwrap()).map_err(|e| e.to_string())?;
            Ok(serde_json::json!(target))
        })?;
        let path = std::path::PathBuf::from(path.as_str().unwrap());
        use std::io::Write;
        let mut file = std::fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&path)
            .map_err(|e| e.to_string())?;
        if let Err(e) = file.write_all(&bytes).and_then(|_| file.sync_all()) {
            drop(file);
            let _ = std::fs::remove_file(&path);
            return Err(e.to_string());
        }
        drop(file);
        let hash = format!("{:x}", Sha256::digest(&bytes));
        let count = bytes.len() as i64;
        let result = storage.call(&root, move |w| w.attach_metadata(id, name, count, hash));
        if result.is_err() {
            let _ = std::fs::remove_file(path);
        }
        result
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
async fn native_resource(
    window: tauri::WebviewWindow,
    id: Option<String>,
    action: String,
    text: Option<String>,
    worker: tauri::State<'_, Worker>,
) -> Result<String, String> {
    if action == "clipboardWrite" {
        vaultor_next::media::clipboard::write(
            &text.unwrap_or_default(),
            window.hwnd().map_err(|e| e.to_string())?.0 as isize,
        )?;
        return Ok(String::new());
    }
    if action == "clipboardRead" {
        return vaultor_next::media::clipboard::read();
    }
    let root = worker.call(Request::Snapshot).await?["path"]
        .as_str()
        .unwrap()
        .to_string();
    let storage = worker.storage();
    tauri::async_runtime::spawn_blocking(move || {
        let id = id.ok_or("Missing resource")?;
        let info = storage.call(&root, move |w| {
            let info = w.media(serde_json::json!({"op":"info","id":id}))?;
            Ok(serde_json::json!({"path":w.managed_path(&id)?,"name":info["name"],"hash":info["hash"]}))
        })?;
        let name = info["name"].as_str().unwrap();
        if name.is_empty()
            || name == "."
            || name == ".."
            || name
                .chars()
                .any(|c| "<>:\"/\\|?*".contains(c) || c.is_control())
        {
            return Err("Invalid original filename".into());
        }
        let ext = std::path::Path::new(name)
            .extension()
            .and_then(|x| x.to_str())
            .unwrap_or("")
            .to_lowercase();
        if !matches!(action.as_str(), "open" | "reveal") {
            return Err("Unknown native action".into());
        }
        if action == "open"
            && !matches!(
                ext.as_str(),
                "png" | "jpg" | "jpeg" | "gif" | "webp" | "pdf" | "txt" | "md" | "csv" | "json"
            )
        {
            return Err("Use Export original for this type;active content is not launched".into());
        }
        let out = vaultor_next::media::prepare_copy(
            std::path::Path::new(info["path"].as_str().unwrap()),
            name,info["hash"].as_str().unwrap(),
        )?;
        if action == "reveal" {
            std::process::Command::new("explorer.exe")
                .arg(format!("/select,{}", out.display()))
                .spawn()
                .map_err(|e| e.to_string())?;
        } else {
            std::process::Command::new("rundll32.exe")
                .arg("url.dll,FileProtocolHandler")
                .arg(&out)
                .spawn()
                .map_err(|e| e.to_string())?;
        }
        Ok("Prepared independent copy in temporary export storage".into())
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
async fn selected_image(path: String) -> Result<tauri::ipc::Response, String> {
    tauri::async_runtime::spawn_blocking(move || {
        use std::io::Read;
        let file = vaultor_next::transfers::plain_file(std::path::Path::new(&path))?;
        if file.metadata().map_err(|e| e.to_string())?.len() > 20 * 1024 * 1024 {
            return Err("Image exceeds20MiB".into());
        }
        let mut bytes = vec![];
        file.take(20 * 1024 * 1024 + 1)
            .read_to_end(&mut bytes)
            .map_err(|e| e.to_string())?;
        let Some((_, w, h)) = vaultor_next::media::image_type(&bytes) else {
            return Err("Choose PNG,JPEG or GIF".into());
        };
        if w == 0 || h == 0 || w as u64 * h as u64 > 40_000_000 {
            return Err("Image dimensions exceed limit".into());
        }
        Ok(tauri::ipc::Response::new(bytes))
    })
    .await
    .map_err(|e| e.to_string())?
}
fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            // This identifier has its own profile; never open the Electron workspace.
            let data = app.path().app_data_dir()?;
            std::fs::create_dir_all(&data)?;
            let pointer = data.join("last-workspace.json");
            let override_root = std::env::var_os("VAULTOR_NEXT_WORKSPACE");
            let root = override_root
                .clone()
                .map(std::path::PathBuf::from)
                .or_else(|| {
                    std::fs::read(&pointer)
                        .ok()
                        .and_then(|bytes| serde_json::from_slice::<std::path::PathBuf>(&bytes).ok())
                })
                .unwrap_or(data.join("Workspace-M2"));
            let worker = Worker::start(
                root.clone(),
                if override_root.is_some() {
                    None
                } else {
                    Some(pointer)
                },
            )?;
            let storage = worker.storage();
            let handle = app.handle().clone();
            let activity = Activity::new(
                override_root
                    .as_ref()
                    .map(|p| {
                        std::path::PathBuf::from(p)
                            .parent()
                            .unwrap()
                            .join("next-activity.json")
                    })
                    .unwrap_or(data.join("next-activity.json")),
                storage.clone(),
                move |tasks| {
                    let _ = handle.emit("next-activity", tasks);
                },
            )?;
            if storage
                .call(&root.to_string_lossy(), |w| {
                    let pending: bool = w.pending_cleanup()?;
                    Ok(serde_json::json!(pending))
                })
                .ok()
                .and_then(|v| v.as_bool())
                == Some(true)
            {
                activity.submit(
                    root.to_string_lossy().into_owned(),
                    vaultor_next::transfers::Job::Purge { ids: Some(vec![]) },
                )?;
            }
            app.manage(Arc::new(Transfers::new(storage, activity)));
            app.manage(worker);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            workspace,
            transfer,
            resource_bytes,
            attachment,
            native_resource,
            selected_image
        ])
        .build(tauri::generate_context!())
        .expect("Vaultor Next initialization failed")
        .run(|app, event| {
            if matches!(event, tauri::RunEvent::Exit) {
                app.state::<Arc<Transfers>>().activity.shutdown();
                app.state::<Worker>().stop();
            }
        });
}
