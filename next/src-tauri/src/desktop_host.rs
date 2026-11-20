use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{
    fs::{self, File},
    io::{self, Read, Write},
    net::{IpAddr, SocketAddr},
    path::PathBuf,
};
use tokio::sync::Mutex;
use vaultor_next::{
    domain::Request,
    host::{Host, Listener},
    worker::Worker,
};

pub type Running = Option<(Host, Listener)>;

pub struct DesktopHost {
    pub running: Mutex<Running>,
    access: PathBuf,
    startup_error: Mutex<Option<String>>,
}

#[derive(Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
struct Startup {
    address: SocketAddr,
    workspace: uuid::Uuid,
}

impl DesktopHost {
    pub fn new(access: PathBuf) -> Self {
        Self {
            running: Mutex::new(None),
            access,
            startup_error: Mutex::new(None),
        }
    }

    pub async fn stop(slot: &mut Running) -> Result<(), String> {
        if let Some((_, listener)) = slot.take() {
            listener.stop().await.map_err(|error| error.to_string())?;
        }
        Ok(())
    }

    fn preference_path(&self) -> PathBuf {
        self.access.with_file_name("host-startup.json")
    }

    fn preference(&self) -> io::Result<Option<Startup>> {
        let file = match File::open(self.preference_path()) {
            Ok(file) => file,
            Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(None),
            Err(error) => return Err(error),
        };
        let mut bytes = Vec::new();
        file.take(1025).read_to_end(&mut bytes)?;
        if bytes.len() > 1024 {
            return Err(io::Error::other("Hosting startup preference is damaged"));
        }
        serde_json::from_slice(&bytes)
            .map(Some)
            .map_err(io::Error::other)
    }

    fn save_preference(&self, preference: Option<Startup>) -> io::Result<()> {
        let path = self.preference_path();
        let Some(preference) = preference else {
            return match fs::remove_file(&path) {
                Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(()),
                result => result,
            };
        };
        let mut staged = tempfile::NamedTempFile::new_in(
            path.parent()
                .ok_or("Missing profile directory")
                .map_err(io::Error::other)?,
        )?;
        serde_json::to_writer(staged.as_file_mut(), &preference)?;
        staged.flush()?;
        staged.as_file().sync_all()?;
        staged.persist(path)?;
        Ok(())
    }

    pub async fn resume(&self, worker: &Worker) {
        let mut slot = self.running.lock().await;
        if slot.is_some() {
            return;
        }
        let result = match self.preference() {
            Ok(Some(preference)) => self
                .start(worker, preference.address, Some(preference.workspace))
                .await
                .map(Some),
            Ok(None) => Ok(None),
            Err(error) => Err(error.to_string()),
        };
        match result {
            Ok(running) => *slot = running,
            Err(error) => *self.startup_error.lock().await = Some(error),
        }
    }

    async fn start(
        &self,
        worker: &Worker,
        address: SocketAddr,
        expected: Option<uuid::Uuid>,
    ) -> Result<(Host, Listener), String> {
        let snapshot = worker.call(Request::Snapshot).await?;
        let root = PathBuf::from(
            snapshot["path"]
                .as_str()
                .ok_or("Open a workspace to start hosting")?,
        );
        let access = self.access.clone();
        #[cfg(windows)]
        let (identity, authority) = tauri::async_runtime::spawn_blocking(move || {
            vaultor_next::host::Authority::open(&access)
        })
        .await
        .map_err(|error| error.to_string())??;
        #[cfg(not(windows))]
        let identity = vaultor_next::host::Identity::open(&access, &access.join("ca.pem"))
            .map_err(|error| error.to_string())?;
        let host = Host::new(worker.storage(), root, identity).await?;
        if expected.is_some_and(|expected| expected != host.workspace_id()) {
            return Err(
                "The workspace changed. Start hosting explicitly to share the current workspace."
                    .into(),
            );
        }
        #[cfg(windows)]
        if let Some(authority) = authority {
            let listener = host
                .clone()
                .listen_automatic(address, authority)
                .await
                .map_err(|error| error.to_string())?;
            return Ok((host, listener));
        }
        let listener = host
            .clone()
            .listen(
                address,
                self.access.join("chain.pem"),
                self.access.join("server-key.pem"),
            )
            .await
            .map_err(|error| error.to_string())?;
        Ok((host, listener))
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
    Startup {
        enabled: bool,
    },
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
        Command::Stop => {
            let stopped = DesktopHost::stop(&mut slot).await;
            desktop.save_preference(None).map_err(|error| {
                format!("Hosting stopped. Could not clear start on launch: {error}")
            })?;
            *desktop.startup_error.lock().await = None;
            stopped?;
        }
        Command::Startup { enabled } => {
            let preference = if enabled {
                let (host, listener) = slot
                    .as_ref()
                    .filter(|(_, listener)| listener.running())
                    .ok_or("Start hosting before setting start on launch")?;
                Some(Startup {
                    address: listener.address(),
                    workspace: host.workspace_id(),
                })
            } else {
                None
            };
            desktop
                .save_preference(preference)
                .map_err(|error| error.to_string())?;
            *desktop.startup_error.lock().await = None;
        }
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
            *slot = Some(desktop.start(&worker, address, None).await?);
            *desktop.startup_error.lock().await = None;
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
    let mut status = match slot.as_ref() {
        Some((host, listener)) if listener.running() => {
            #[cfg(windows)]
            let certificate = listener.certificate_status();
            #[cfg(not(windows))]
            let certificate = Option::<Value>::None;
            json!({
                "address":listener.address().to_string(),"fingerprint": host.fingerprint(),
                "accessPath":desktop.access,"running":true,"certificate":certificate,
            })
        }
        _ => json!({"accessPath":desktop.access,"running":false}),
    };
    let preference = desktop.preference();
    status["startup"] = json!(preference.as_ref().is_ok_and(|value| value.is_some()));
    status["startupError"] = json!(desktop.startup_error.lock().await.as_ref());
    status["addresses"] = json!(private_addresses());
    Ok(status)
}

fn private_addresses() -> Vec<IpAddr> {
    let mut addresses: Vec<_> = if_addrs::get_if_addrs()
        .unwrap_or_default()
        .into_iter()
        .map(|interface| interface.ip())
        .filter(|ip| matches!(ip, IpAddr::V4(v4) if v4.is_private()))
        .collect();
    addresses.sort_unstable();
    addresses.dedup();
    addresses
}
