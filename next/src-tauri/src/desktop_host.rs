use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{
    fs::{self, File},
    io::{self, Read, Write},
    net::{IpAddr, Ipv4Addr, SocketAddr},
    path::PathBuf,
};
use tokio::sync::Mutex;
use tauri::Emitter;
use vaultor_next::{
    domain::Request,
    host::{Host, Listener},
    worker::Worker,
};

pub type Running = Option<(Host, Listener)>;

pub struct DesktopHost {
    pub running: Mutex<Running>,
    access: PathBuf,
    app: tauri::AppHandle,
    startup_error: Mutex<Option<String>>,
    recovery: Mutex<Option<Recovery>>,
    recovery_wakeup: tokio::sync::Notify,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct Network {
    interface: String,
    prefix: Ipv4Addr,
    mask: Ipv4Addr,
}

struct Recovery {
    network: Network,
    address: SocketAddr,
    workspace: uuid::Uuid,
    discoverable: bool,
}

impl Network {
    fn selected(ip: IpAddr) -> Option<Self> {
        if_addrs::get_if_addrs().ok()?.into_iter().find_map(|i| {
            let if_addrs::IfAddr::V4(v4) = i.addr else { return None };
            if IpAddr::from(v4.ip) != ip || !v4.ip.is_private() || v4.netmask.is_unspecified() { return None; }
            Some(Self { interface: i.name, prefix: (u32::from(v4.ip) & u32::from(v4.netmask)).into(), mask: v4.netmask })
        })
    }

    fn find(&self, address: SocketAddr) -> Option<SocketAddr> {
        let mut candidates = if_addrs::get_if_addrs().ok()?.into_iter().filter_map(|i| {
            let if_addrs::IfAddr::V4(v4) = i.addr else { return None };
            (i.name == self.interface && v4.ip.is_private() && v4.netmask == self.mask &&
                u32::from(v4.ip) & u32::from(self.mask) == u32::from(self.prefix)).then_some(v4.ip)
        }).collect::<Vec<_>>();
        candidates.sort_unstable();
        candidates.dedup();
        if candidates.iter().any(|ip| IpAddr::from(*ip) == address.ip()) { return Some(address); }
        (candidates.len() == 1).then(|| SocketAddr::new(candidates[0].into(), address.port()))
    }
}

#[derive(Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
struct Startup {
    address: SocketAddr,
    workspace: uuid::Uuid,
    #[serde(default)]
    discoverable: bool,
    #[serde(default)]
    network: Option<Network>,
}

impl DesktopHost {
    pub fn new(access: PathBuf, app: tauri::AppHandle) -> Self {
        Self {
            running: Mutex::new(None),
            access,
            app,
            startup_error: Mutex::new(None),
            recovery: Mutex::new(None),
            recovery_wakeup: tokio::sync::Notify::new(),
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
            Ok(Some(preference)) => {
                let replacement = preference.network.as_ref().map(|n| n.find(preference.address));
                let address = replacement.flatten().unwrap_or(preference.address);
                if let Some(network) = preference.network {
                    *self.recovery.lock().await = Some(Recovery {
                        address, network, workspace: preference.workspace, discoverable: preference.discoverable,
                    });
                    self.recovery_wakeup.notify_one();
                }
                let start = if replacement == Some(None) {
                    Err("The selected network has no unambiguous address. Start hosting on a selected address.".into())
                } else {
                    self.start(worker, address, Some(preference.workspace)).await
                };
                match start {
                    Ok((host, mut listener)) => {
                        if let Err(error) = listener.set_discoverable(preference.discoverable, host.host_id()) {
                            *self.startup_error.lock().await = Some(error);
                        }
                        Ok(Some((host, listener)))
                    }
                    Err(error) => Err(error),
                }
            }
            Ok(None) => Ok(None),
            Err(error) => Err(error.to_string()),
        };
        match result {
            Ok(running) => *slot = running,
            Err(error) => *self.startup_error.lock().await = Some(error),
        }
    }

    pub async fn monitor(&self, worker: &Worker, app: &tauri::AppHandle) {
        loop {
            if self.recovery.lock().await.is_none() {
                self.recovery_wakeup.notified().await;
            } else {
                tokio::time::sleep(std::time::Duration::from_secs(5)).await;
            }
            let mut slot = self.running.lock().await;
            let mut recovery = self.recovery.lock().await;
            let Some(recovery) = recovery.as_mut() else { continue };
            let Some(address) = recovery.network.find(recovery.address) else {
                let was_running = slot.is_some();
                let _ = Self::stop(&mut slot).await;
                let warning = "The selected network is unavailable or ambiguous. Select a listening address again.";
                let mut status = self.startup_error.lock().await;
                if was_running || status.as_deref() != Some(warning) {
                    *status = Some(warning.into());
                    let _ = app.emit("next-host-status", ());
                }
                continue;
            };
            if slot.as_ref().is_some_and(|(_, l)| l.running() && l.address() == address) {
                continue;
            }
            let _ = Self::stop(&mut slot).await;
            match self.start(worker, address, Some(recovery.workspace)).await {
                Ok((host, mut listener)) => {
                    let warning = listener.set_discoverable(recovery.discoverable, host.host_id()).err();
                    recovery.address = listener.address();
                    *slot = Some((host, listener));
                    *self.startup_error.lock().await = warning;
                    let _ = app.emit("next-host-status", ());
                }
                Err(e) => {
                    let mut status = self.startup_error.lock().await;
                    if status.as_ref() != Some(&e) {
                        *status = Some(e);
                        let _ = app.emit("next-host-status", ());
                    }
                }
            }
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
        let app = self.app.clone();
        let workspace_path = root.clone();
        let host = Host::new(worker.storage(), root, identity)
            .await?
            .with_workspace_change_handler(move || {
                let _ = app.emit("next-host-workspace-changed", &workspace_path);
            });
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
    WorkspaceZip {
        action: String,
        id: Option<uuid::Uuid>,
        destination: Option<PathBuf>,
    },
    OpenOwnerBrowser,
    CancelOwnerBrowser { end_session: bool },
    Status,
    Start {
        address: String,
        #[serde(default)]
        recover: bool,
    },
    Stop,
    Startup {
        enabled: bool,
    },
    Pending,
    Watch { host: uuid::Uuid, revision: u64 },
    Discoverable { enabled: bool },
    PairingQr,
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
        Command::OpenOwnerBrowser => {
            let host = slot.as_ref().filter(|(_, listener)| listener.running())
                .map(|(host, _)| host.clone()).ok_or("Start hosting to open the local owner browser")?;
            drop(slot);
            #[cfg(windows)]
            host.open_owner_browser().await?;
            #[cfg(not(windows))]
            return Err("Opening the local owner browser is supported in this Windows candidate".into());
            #[cfg(windows)]
            return Ok(Value::Null);
        }
        Command::CancelOwnerBrowser { end_session } => {
            let (host, _) = slot.as_ref().ok_or("Start hosting first")?;
            host.cancel_owner_browser(end_session)?;
            return Ok(Value::Null);
        }
        Command::WorkspaceZip { action, id, destination } => {
            let host = slot.as_ref().filter(|(_, listener)| listener.running())
                .map(|(host, _)| host.clone()).ok_or("Start hosting to review incoming backups")?;
            drop(slot);
            return tauri::async_runtime::spawn_blocking(move || host.workspace_zip_owner(&action, id, destination))
                .await.map_err(|error| error.to_string())?;
        }
        Command::Watch { host, revision } => {
            let Some((current, _)) = slot.as_ref().filter(|(h, _)| h.host_id() == host) else {
                return Ok(json!(false));
            };
            let mut events = current.management_events();
            drop(slot);
            if *events.borrow_and_update() != revision {
                return Ok(json!(true));
            }
            let _ = tokio::time::timeout(std::time::Duration::from_secs(20), events.changed()).await;
            return Ok(json!(true));
        }
        Command::Discoverable { enabled } => {
            let (host, listener) = slot.as_mut().ok_or("Start hosting before enabling discovery")?;
            listener.set_discoverable(enabled, host.host_id())?;
            if let Some(recovery) = desktop.recovery.lock().await.as_mut() {
                recovery.discoverable = enabled;
            }
            if let Some(mut preference) = desktop.preference().map_err(|e| e.to_string())? {
                preference.discoverable = enabled;
                desktop.save_preference(Some(preference)).map_err(|e| e.to_string())?;
            }
        }
        Command::PairingQr => {
            let (host, listener) = slot.as_ref().filter(|(_, l)| l.running()).ok_or("Start hosting first")?;
            let expires = time::OffsetDateTime::now_utc().unix_timestamp() + 300;
            let text = json!({"v":1,"address":format!("https://{}",listener.address()),
                "hostId":host.host_id(),"fingerprint":host.fingerprint(),"expires":expires});
            let code = qrcode::QrCode::new(format!("vaultor-next:{}",text)).map_err(|e| e.to_string())?;
            let width = code.width();
            let mut path = String::new();
            for (index, color) in code.to_colors().into_iter().enumerate() {
                if color == qrcode::Color::Dark {
                    use std::fmt::Write as _;
                    write!(path, "M{} {}h1v1h-1z", index % width + 4, index / width + 4).unwrap();
                }
            }
            return Ok(json!({"width":width+8,"path":path,"expires":expires}));
        }
        Command::Stop => {
            *desktop.recovery.lock().await = None;
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
                    discoverable: listener.discoverable(),
                    network: desktop.recovery.lock().await.as_ref().map(|r| r.network.clone()),
                })
            } else {
                None
            };
            desktop
                .save_preference(preference)
                .map_err(|error| error.to_string())?;
            *desktop.startup_error.lock().await = None;
        }
        Command::Start { address, recover } => {
            if slot
                .as_ref()
                .is_some_and(|(_, listener)| listener.running())
            {
                return Err("Stop hosting before changing the listening address".into());
            }
            DesktopHost::stop(&mut slot).await?;
            let address: SocketAddr = address
                .parse()
                .map_err(|_| "Enter an IP address and port, such as 127.0.0.1:8443")?;
            let network = if recover {
                Some(Network::selected(address.ip()).ok_or("Select an available private IPv4 network first")?)
            } else { None };
            let (host, listener) = desktop.start(&worker, address, None).await?;
            *desktop.recovery.lock().await = network.map(|network| Recovery {
                network, address: listener.address(), workspace: host.workspace_id(), discoverable: false,
            });
            *slot = Some((host, listener));
            desktop.recovery_wakeup.notify_one();
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
                "hostId":host.host_id(),"discoverable":listener.discoverable(),
                "managementRevision":*host.management_events().borrow(),
            })
        }
        _ => json!({"accessPath":desktop.access,"running":false}),
    };
    let preference = desktop.preference();
    status["startup"] = json!(preference.as_ref().is_ok_and(|value| value.is_some()));
    status["recovering"] = json!(!status["running"].as_bool().unwrap_or(false)
        && desktop.recovery.lock().await.is_some());
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
