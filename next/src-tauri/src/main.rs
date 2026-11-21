#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
mod preview;
#[cfg(feature = "host")]
mod desktop_host;
#[cfg(windows)]
mod windows_drag;
#[cfg(windows)]
mod windows_shell;
use std::sync::Arc;
use tauri::{Emitter, Manager};
use tauri_plugin_dialog::DialogExt;
use vaultor_next::{
    activity::Activity,
    transfers::{Request as TransferRequest, Transfers},
};
use vaultor_next::{domain::Request, worker::Worker};

#[cfg(windows)]
struct TrayAvailable(bool);

#[cfg(windows)]
#[tauri::command]
fn close_next(window: tauri::WebviewWindow, quit: bool, tray: tauri::State<'_, TrayAvailable>) -> Result<(), String> {
    if quit || !tray.0 {
        window.app_handle().exit(0);
        return Ok(());
    }
    windows_shell::close_to_tray(&window)
}

#[tauri::command]
async fn workspace(
    request: Request,
    state: tauri::State<'_, Worker>,
    previews: tauri::State<'_, preview::Previews>,
    #[cfg(windows)] monitor: tauri::State<'_, vaultor_next::LinkedMonitor>,
    #[cfg(feature = "host")] hosting: tauri::State<'_, desktop_host::DesktopHost>,
) -> Result<serde_json::Value, String> {
    let switching = matches!(request, Request::Open { .. } | Request::New { .. });
    #[cfg(feature = "host")]
    let _host_gate = if switching {
        let mut slot = hosting.running.lock().await;
        if slot.as_ref().is_some_and(|(_, listener)| listener.running()) {
            return Err("Stop hosting before switching workspaces".into());
        }
        desktop_host::DesktopHost::stop(&mut slot).await?;
        Some(slot)
    } else {
        None
    };
    #[cfg(windows)]
    let reconfigure = matches!(&request, Request::Linked { request:
        vaultor_next::LinkedRequest::Register { .. } | vaultor_next::LinkedRequest::RebindDescriptor { .. } | vaultor_next::LinkedRequest::Remove { .. }
    });
    let result = state.call(request).await;
    #[cfg(windows)]
    if let Ok(value) = &result {
        if switching || reconfigure {
            monitor.reconfigure(if switching { value["path"].as_str() } else { None });
        }
    }
    if switching && result.is_ok() { previews.clear(); }
    result
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
    workspace: Option<String>,
    worker: tauri::State<'_, Worker>,
) -> Result<tauri::ipc::Response, String> {
    let root = worker.call(Request::Snapshot).await?["path"]
        .as_str()
        .unwrap()
        .to_string();
    if workspace.is_some_and(|expected|expected!=root) {
        return Err("Workspace changed. Open the preview again.".into());
    }
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
    let table_source = request.headers().get("x-editor-table").is_some_and(|v| v == "1");
    if table_source {
        if bytes.len() > 1024 * 1024 || std::str::from_utf8(&bytes).is_err() ||
            !std::path::Path::new(&name).extension().and_then(|e| e.to_str()).is_some_and(|e| e.eq_ignore_ascii_case("csv") || e.eq_ignore_ascii_case("tsv")) {
            return Err("Expected a UTF-8 CSV or TSV original, at most 1 MiB".into());
        }
    } else {
        let Some((_, w, h)) = vaultor_next::media::image_type(&bytes) else {
            return Err("Paste/select PNG, JPEG, GIF or WebP images;other files use Import".into());
        };
        if w == 0 || h == 0 || w as u64 * h as u64 > 40_000_000 {
            return Err("Image exceeds40million pixels".into());
        }
    }
    let root = worker.call(Request::Snapshot).await?["path"]
        .as_str()
        .unwrap()
        .to_string();
    if (table_source || request.headers().contains_key("x-workspace")) && request.headers().get("x-workspace").and_then(|v| v.to_str().ok())
        .and_then(|v| percent_encoding::percent_decode_str(v).decode_utf8().ok()).as_deref() != Some(&root) {
        return Err("Workspace changed. Choose the table source again.".into());
    }
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
    receipt: Option<String>,
    worker: tauri::State<'_, Worker>,
) -> Result<String, String> {
    let hwnd = window.hwnd().map_err(|e| e.to_string())?.0 as isize;
    if matches!(action.as_str(),"clipboardWrite" | "clipboardWriteResource") {
        return tauri::async_runtime::spawn_blocking(move || {
            let text=text.unwrap_or_default();
            if action=="clipboardWriteResource" {
                vaultor_next::media::clipboard::write_resources(&text,&receipt.ok_or("Missing resource clipboard receipt")?,hwnd)?;
            } else {
                vaultor_next::media::clipboard::write(&text,hwnd)?;
            }
            Ok(String::new())
        })
        .await
        .map_err(|e| e.to_string())?;
    }
    if action == "clipboardReadResource" {
        return tauri::async_runtime::spawn_blocking(vaultor_next::media::clipboard::read_resource)
            .await.map_err(|e|e.to_string())?;
    }
    if action == "clipboardRead" {
        return tauri::async_runtime::spawn_blocking(vaultor_next::media::clipboard::read)
            .await
            .map_err(|e| e.to_string())?;
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
        if !matches!(action.as_str(), "open" | "reveal" | "copyPath") {
            return Err("Unknown native action".into());
        }
        if action == "open"
            && !matches!(
                ext.as_str(),
                "png" | "jpg" | "jpeg" | "gif" | "webp" | "pdf" | "txt" | "md" | "csv" | "tsv" | "json" |
                "mp3" | "wav" | "ogg" | "opus" | "flac" | "m4a" | "mp4" | "webm"
            )
        {
            return Err("Use Export original for this type;active content is not launched".into());
        }
        let out = vaultor_next::media::prepare_copy(
            std::path::Path::new(info["path"].as_str().unwrap()),
            name,info["hash"].as_str().unwrap(),
        )?;
        if action=="copyPath" {
            vaultor_next::media::clipboard::write(out.to_str().ok_or("Prepared path is not Unicode")?,hwnd)?;
            return Ok("Copied the prepared file path".into());
        }
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
async fn pick_editor_text(window: tauri::WebviewWindow, format: String) -> Result<Option<serde_json::Value>, String> {
    let (label, extensions): (&str, &[&str]) = match format.as_str() {
        "table" => ("Tabular data", &["csv", "tsv"]),
        "markdown" => ("Markdown", &["md", "markdown"]),
        _ => return Err("Unsupported editor import format".into()),
    };
    tauri::async_runtime::spawn_blocking(move || {
        use std::io::Read;
        let Some(selection) = window.dialog().file().set_parent(&window).add_filter(label, extensions).blocking_pick_file() else {
            return Ok(None);
        };
        let path = selection.into_path().map_err(|e| e.to_string())?;
        let extension = path.extension().and_then(|v| v.to_str()).unwrap_or_default();
        if !extensions.iter().any(|value| extension.eq_ignore_ascii_case(value)) {
            return Err(format!("Choose a {label} file"));
        }
        let file = vaultor_next::transfers::plain_file(&path)?;
        const LIMIT: usize = 1024 * 1024;
        let mut bytes = Vec::new();
        file.take((LIMIT + 1) as u64).read_to_end(&mut bytes).map_err(|e| e.to_string())?;
        if bytes.len() > LIMIT {
            return Err("Editor file insertion is limited to 1 MiB".into());
        }
        let text = String::from_utf8(bytes).map_err(|_| "Choose a UTF-8 text file")?;
        let name = path.file_name().and_then(|v| v.to_str()).ok_or("Unsupported filename")?;
        Ok(Some(serde_json::json!({"text":text,"name":name})))
    }).await.map_err(|e| e.to_string())?
}

#[tauri::command]
async fn save_table_csv(window: tauri::WebviewWindow, text: String, visible: bool) -> Result<bool, String> {
    if text.len() > 8 * 1024 * 1024 {
        return Err("CSV export is limited to 8 MiB".into());
    }
    tauri::async_runtime::spawn_blocking(move || {
        let name = if visible { "table-visible.csv" } else { "table-all.csv" };
        let Some(selection) = window.dialog().file().set_parent(&window).add_filter("CSV", &["csv"]).set_file_name(name).blocking_save_file() else {
            return Ok(false);
        };
        let path = selection.into_path().map_err(|e| e.to_string())?;
        if !path.extension().and_then(|v| v.to_str()).is_some_and(|ext| ext.eq_ignore_ascii_case("csv")) {
            return Err("Choose a .csv filename".into());
        }
        vaultor_next::transfers::save_csv_copy(&path, &text)?;
        Ok(true)
    }).await.map_err(|e| e.to_string())?
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
            return Err("Choose PNG, JPEG, GIF or WebP".into());
        };
        if w == 0 || h == 0 || w as u64 * h as u64 > 40_000_000 {
            return Err("Image dimensions exceed limit".into());
        }
        Ok(tauri::ipc::Response::new(bytes))
    })
    .await
    .map_err(|e| e.to_string())?
}
fn startup_failure(error: &impl std::fmt::Display) {
    let message = format!(
        "Vaultor Next could not start.\n\n{error}\n\n\
        If another Vaultor Next version is running (including M14), save any linked-file edits, \
        close it normally, then open M15 again. Only one version can own this profile at a time. \
        Do not delete workspace or profile lock files."
    );
    // Setup can fail before the hidden webview is ready. Use a native dialog that
    // does not depend on renderer bootstrap or successfully managed Tauri state.
    #[cfg(windows)]
    {
        use windows_sys::Win32::UI::WindowsAndMessaging::{MessageBoxW, MB_ICONERROR, MB_OK};
        let text: Vec<u16> = message.encode_utf16().chain(Some(0)).collect();
        let title: Vec<u16> = "Vaultor Next — Startup failed"
            .encode_utf16()
            .chain(Some(0))
            .collect();
        unsafe {
            MessageBoxW(std::ptr::null_mut(), text.as_ptr(), title.as_ptr(), MB_OK | MB_ICONERROR);
        }
    }
    #[cfg(not(windows))]
    eprintln!("{message}");
}

fn main() {
    let application = tauri::Builder::default()
        .manage(preview::Previews::default())
        .register_asynchronous_uri_scheme_protocol("vaultor-preview", preview::respond)
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            // Tauri panics on a setup-hook error before build can return it.
            // Finish unwinding our services, then report before returning to Tauri.
            let initialization = (|| -> Result<(), Box<dyn std::error::Error>> {
            // This identifier has its own profile; never open the Electron workspace.
            let data = app.path().app_data_dir()?;
            std::fs::create_dir_all(&data)?;
            let pointer = data.join("last-workspace.json");
            let override_root = std::env::var_os("VAULTOR_NEXT_WORKSPACE");
            #[cfg(feature = "host")]
            app.manage(desktop_host::DesktopHost::new(override_root.as_ref()
                .and_then(|path| std::path::Path::new(path).parent()).unwrap_or(&data)
                .join("host-access")));
            #[cfg(windows)]
            app.manage(windows_drag::NativeDrag::new(override_root.as_ref()
                .and_then(|path| std::path::Path::new(path).parent()).unwrap_or(&data)
                .join("native-export-copies")));
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
            #[cfg(windows)]
            let projection = {
                let available=app.get_webview_window("main").as_ref().is_some_and(windows_shell::install);
                app.manage(TrayAvailable(available));
                Arc::new(std::sync::Mutex::new(windows_shell::ActivityProjection::default()))
            };
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
                    let _ = handle.emit("next-activity", &tasks);
                    #[cfg(windows)]
                    {
                        let app=handle.clone();
                        let projection=projection.clone();
                        let _=handle.run_on_main_thread(move || {
                            if let Some(window)=app.get_webview_window("main") {
                                if let Ok(mut projection)=projection.lock() { projection.update(&window,&tasks); }
                            }
                        });
                    }
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
            #[cfg(windows)]
            {
                let handle=app.handle().clone();
                app.manage(vaultor_next::LinkedMonitor::start(root.canonicalize().unwrap_or(root).to_string_lossy().into_owned(),
                    storage.clone(),activity.clone(),move |workspace| { let _=handle.emit("next-linked-change",workspace); })?);
            }
            app.manage(Arc::new(Transfers::new(storage, activity)));
            app.manage(worker);
            #[cfg(feature = "host")]
            {
                let handle = app.handle().clone();
                tauri::async_runtime::spawn(async move {
                    let hosting = handle.state::<desktop_host::DesktopHost>();
                    let worker = handle.state::<Worker>();
                    hosting.resume(&worker).await;
                    let _ = handle.emit("next-host-status", ());
                    hosting.monitor(&worker, &handle).await;
                });
            }
            Ok(())
            })();
            if let Err(error) = initialization {
                startup_failure(&error);
                std::process::exit(1);
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            workspace,
            #[cfg(feature = "host")]
            desktop_host::hosting,
            transfer,
            resource_bytes,
            attachment,
            native_resource,
            #[cfg(windows)]
            close_next,
            #[cfg(windows)]
            windows_drag::prepare_drag,
            #[cfg(windows)]
            windows_drag::start_drag,
            #[cfg(windows)]
            windows_drag::release_drag,
            selected_image,
            pick_editor_text,
            save_table_csv,
            preview::open_media_preview,
            preview::close_media_preview
        ])
        .build(tauri::generate_context!());
    let application = match application {
        Ok(application) => application,
        Err(error) => {
            startup_failure(&error);
            std::process::exit(1);
        }
    };
    application.run(|app, event| {
        if matches!(event, tauri::RunEvent::Exit) {
            #[cfg(feature = "host")]
            tauri::async_runtime::block_on(async {
                let hosting = app.state::<desktop_host::DesktopHost>();
                let mut slot = hosting.running.lock().await;
                let _ = desktop_host::DesktopHost::stop(&mut slot).await;
            });
            app.state::<Arc<Transfers>>().activity.shutdown();
            #[cfg(windows)]
            app.state::<vaultor_next::LinkedMonitor>().shutdown();
            app.state::<Worker>().stop();
        }
    });
}
