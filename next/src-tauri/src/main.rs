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
        .invoke_handler(tauri::generate_handler![workspace, transfer])
        .build(tauri::generate_context!())
        .expect("Vaultor Next initialization failed")
        .run(|app, event| {
            if matches!(event, tauri::RunEvent::Exit) {
                app.state::<Arc<Transfers>>().activity.shutdown();
                app.state::<Worker>().stop();
            }
        });
}
