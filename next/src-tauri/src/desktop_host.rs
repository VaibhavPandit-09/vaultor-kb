use serde::Deserialize;
use serde_json::{json, Value};
use std::path::PathBuf;
use tokio::sync::Mutex;
use vaultor_next::{
    domain::Request,
    host::{Host, Identity, Listener},
    worker::Worker,
};

pub type Running = Option<(Host, Listener)>;

pub struct DesktopHost {
    pub running: Mutex<Running>,
    access: PathBuf,
}

impl DesktopHost {
    pub fn new(access: PathBuf) -> Self {
        Self {
            running: Mutex::new(None),
            access,
        }
    }

    pub async fn stop(slot: &mut Running) -> Result<(), String> {
        if let Some((_, listener)) = slot.take() {
            listener.stop().await.map_err(|error| error.to_string())?;
        }
        Ok(())
    }
}

#[derive(Deserialize)]
#[serde(tag = "op", rename_all = "camelCase", deny_unknown_fields)]
pub enum Command {
    Status,
    Start {
        address: String,
    },
    Stop,
    Pending,
    Devices,
    Decide {
        id: uuid::Uuid,
        code: String,
        approve: bool,
    },
    Grant {
        id: uuid::Uuid,
        allow: bool,
    },
    Revoke {
        id: uuid::Uuid,
    },
}

#[tauri::command]
pub async fn hosting(
    command: Command,
    desktop: tauri::State<'_, DesktopHost>,
    worker: tauri::State<'_, Worker>,
) -> Result<Value, String> {
    let mut slot = desktop.running.lock().await;
    match command {
        Command::Status => {}
        Command::Stop => DesktopHost::stop(&mut slot).await?,
        Command::Start { address } => {
            if slot
                .as_ref()
                .is_some_and(|(_, listener)| listener.running())
            {
                return Err("Stop hosting before changing the listening address".into());
            }
            DesktopHost::stop(&mut slot).await?;
            let address = address
                .parse()
                .map_err(|_| "Enter an IP address and port, such as 127.0.0.1:8443")?;
            let snapshot = worker.call(Request::Snapshot).await?;
            let root = PathBuf::from(
                snapshot["path"]
                    .as_str()
                    .ok_or("Open a workspace to start hosting")?,
            );
            let access = &desktop.access;
            let identity = Identity::open(access, &access.join("ca.pem")).map_err(|error| {
                format!(
                    "Check the host certificate setup in {}. {error}",
                    access.display()
                )
            })?;
            let host = Host::new(worker.storage(), root, identity).await?;
            let listener = host
                .clone()
                .listen(
                    address,
                    access.join("chain.pem"),
                    access.join("server-key.pem"),
                )
                .await
                .map_err(|error| error.to_string())?;
            *slot = Some((host, listener));
        }
        operation => {
            let (host, _) = slot.as_ref().ok_or("Start hosting to manage devices")?;
            let command = match operation {
                Command::Pending => "pending".into(),
                Command::Devices => "devices".into(),
                Command::Decide { id, code, approve } => {
                    if code.len() != 6 || !code.bytes().all(|byte| byte.is_ascii_digit()) {
                        return Err("Compare the six-digit pairing codes".into());
                    }
                    format!("{} {id} {code}", if approve { "approve" } else { "reject" })
                }
                Command::Grant { id, allow } => {
                    format!("{} {id}", if allow { "grant" } else { "withdraw" })
                }
                Command::Revoke { id } => format!("revoke {id}"),
                _ => unreachable!(),
            };
            let host = host.clone();
            return tauri::async_runtime::spawn_blocking(move || host.owner_command(&command))
                .await
                .map_err(|error| error.to_string())?;
        }
    }
    Ok(match slot.as_ref() {
        Some((host, listener)) if listener.running() => json!({
            "address":listener.address().to_string(),"fingerprint": host.fingerprint(),
            "accessPath":desktop.access,"running":true,
        }),
        _ => json!({"accessPath":desktop.access,"running":false}),
    })
}
