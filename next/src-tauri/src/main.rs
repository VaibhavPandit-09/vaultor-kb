#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
use tauri::Manager;
use vaultor_next::{domain::Request, worker::Worker};

#[tauri::command]
async fn workspace(
    request: Request,
    state: tauri::State<'_, Worker>,
) -> Result<serde_json::Value, String> {
    state.call(request).await
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
                .unwrap_or(data.join("Workspace"));
            app.manage(Worker::start(
                root,
                if override_root.is_some() {
                    None
                } else {
                    Some(pointer)
                },
            )?);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![workspace])
        .build(tauri::generate_context!())
        .expect("Vaultor Next initialization failed")
        .run(|app, event| {
            if matches!(event, tauri::RunEvent::Exit) {
                app.state::<Worker>().stop();
            }
        });
}
