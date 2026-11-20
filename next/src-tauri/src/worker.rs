//! One SQLite owner thread. Commands await receipts without blocking the webview/event loop.
use crate::domain::{Request, Workspace};
use std::{
    path::PathBuf,
    sync::{
        atomic::{AtomicUsize, Ordering},
        mpsc, Arc, Mutex,
    },
    thread,
};
use tokio::sync::oneshot;
type Reply = oneshot::Sender<Result<serde_json::Value, String>>;
type Operation = Box<dyn FnOnce(&mut Workspace) -> Result<serde_json::Value, String> + Send>;
enum Message {
    Request(Request, Reply),
    Operation(String, Operation, Reply),
    Stop,
}
#[derive(Clone)]
pub struct Storage {
    sender: mpsc::Sender<Message>,
    #[cfg(feature = "host")]
    changes: tokio::sync::watch::Sender<u64>,
    pub active: Arc<AtomicUsize>,
}
impl Storage {
    #[cfg(feature = "host")]
    pub(crate) fn subscribe(&self) -> tokio::sync::watch::Receiver<u64> {
        self.changes.subscribe()
    }

    #[cfg(feature = "host")]
    pub async fn call_host(
        &self,
        root: &std::path::Path,
        operation: impl FnOnce(&mut Workspace) -> Result<serde_json::Value, String> + Send + 'static,
    ) -> Result<serde_json::Value, String> {
        let (reply, receipt) = oneshot::channel();
        self.sender
            .send(Message::Operation(root.to_string_lossy().into_owned(), Box::new(operation), reply))
            .map_err(|_| "Storage closed")?;
        receipt.await.map_err(|_| "Storage closed")?
    }

    pub fn call(
        &self,
        root: &str,
        operation: impl FnOnce(&mut Workspace) -> Result<serde_json::Value, String> + Send + 'static,
    ) -> Result<serde_json::Value, String> {
        let (tx, rx) = oneshot::channel();
        self.sender
            .send(Message::Operation(root.into(), Box::new(operation), tx))
            .map_err(|_| "Storage closed")?;
        rx.blocking_recv().map_err(|_| "Storage closed")?
    }
}
pub struct Worker {
    sender: Mutex<Option<mpsc::Sender<Message>>>,
    thread: Mutex<Option<thread::JoinHandle<()>>>,
    active: Arc<AtomicUsize>,
    #[cfg(feature = "host")]
    changes: tokio::sync::watch::Sender<u64>,
}

#[cfg(feature = "host")]
fn search_generation(workspace: &Result<Workspace, String>, changes: &tokio::sync::watch::Sender<u64>) -> Option<i64> {
    if changes.receiver_count() == 0 {
        return None;
    }
    workspace.as_ref().ok()?.db.query_row("SELECT value FROM search_generation", [], |row| row.get(0)).ok()
}

#[cfg(feature = "host")]
fn notify_saved(workspace: &Result<Workspace, String>, changes: &tokio::sync::watch::Sender<u64>, before: Option<i64>) {
    if search_generation(workspace, changes).is_some_and(|after| Some(after) != before) {
        changes.send_modify(|sequence| *sequence += 1);
    }
}

impl Worker {
    pub fn start(root: PathBuf, pointer: Option<PathBuf>) -> Result<Self, String> {
        let (sender, receiver) = mpsc::channel::<Message>();
        let active = Arc::new(AtomicUsize::new(0));
        let gate = active.clone();
        #[cfg(feature = "host")]
        let changes = tokio::sync::watch::Sender::new(0);
        #[cfg(feature = "host")]
        let signals = changes.clone();
        let thread = thread::Builder::new()
            .name("vaultor-storage".into())
            .spawn(move || {
                let preferences_path=Some(pointer.as_ref().and_then(|p|p.parent()).map(|p|p.join("preferences.json")).unwrap_or_else(||root.join(".profile-preferences.json")));
                // Failed initialization stays recoverable through an explicit Open request.
                let mut workspace = Workspace::open(&root);
                // An explicit test override must establish ownership before it can store metadata.
                let preferences_owned=pointer.is_some()||workspace.is_ok();
                for message in receiver {
                    #[cfg(feature = "host")]
                    let before = search_generation(&workspace, &signals);
                    let (request, reply) = match message {
                        Message::Stop => break,
                        Message::Request(r, tx) => (r, tx),
                        Message::Operation(root, op, tx) => {
                            let result = match workspace.as_mut() {
                                Ok(w) if w.is_path(std::path::Path::new(&root)) => op(w),
                                _ => Err("Workspace changed; task refused".into()),
                            };
                            #[cfg(feature = "host")]
                            notify_saved(&workspace, &signals, before);
                            let _ = tx.send(result);
                            continue;
                        }
                    };
                    let request = match request {
                        Request::Preferences {value} => {let result=if preferences_owned{crate::desktop::preferences(preferences_path.as_deref(),value)}else{Err("Preferences refused: isolated workspace initialization failed".into())};let _=reply.send(result);continue;},
                        Request::New { path } => {
                            if std::path::Path::new(&path).exists() {
                                let _ =
                                    reply.send(Err("New workspace folder already exists".into()));
                                continue;
                            }
                            Request::Open { path }
                        }
                        r => r,
                    };
                    let result = match request {
                        Request::Open { path } => {
                            if gate.load(Ordering::SeqCst) > 0 {
                                let _ = reply.send(Err(
                                    "Finish or cancel Activity tasks before switching workspace"
                                        .into(),
                                ));
                                continue;
                            }
                            if workspace
                                .as_ref()
                                .is_ok_and(|w| w.is_path(std::path::Path::new(&path)))
                            {
                                workspace.as_mut().unwrap().execute(Request::Snapshot)
                            } else {
                                match Workspace::open(std::path::Path::new(&path)) {
                                    Ok(mut next) => {
                                        let snapshot = next.execute(Request::Snapshot);
                                        let remembered = match (&pointer, &snapshot) {
                                            (Some(pointer), Ok(snapshot)) => std::fs::write(
                                                pointer,
                                                serde_json::to_vec(&snapshot["path"]).unwrap(),
                                            )
                                            .map_err(|e| e.to_string()),
                                            _ => Ok(()),
                                        };
                                        match remembered {
                                            Ok(()) => {
                                                workspace = Ok(next);
                                                snapshot
                                            }
                                            Err(e) => Err(e),
                                        }
                                    }
                                    Err(error) => Err(error),
                                }
                            }
                        }
                        other => match workspace.as_mut() {
                            Ok(w) => w.execute(other),
                            Err(e) => Err(e.clone()),
                        },
                    };
                    let _ = reply.send(result);
                    #[cfg(feature = "host")]
                    notify_saved(&workspace, &signals, before);
                }
                // Connection, lock and statements drop together after queued work drains.
            })
            .map_err(|e| e.to_string())?;
        Ok(Self {
            sender: Mutex::new(Some(sender)),
            thread: Mutex::new(Some(thread)),
            active,
            #[cfg(feature = "host")]
            changes,
        })
    }
    pub async fn call(&self, request: Request) -> Result<serde_json::Value, String> {
        let (sender, receiver) = oneshot::channel();
        self.sender
            .lock()
            .map_err(|_| "Storage unavailable")?
            .as_ref()
            .ok_or("Storage closed")?
            .send(Message::Request(request, sender))
            .map_err(|_| "Storage closed")?;
        receiver
            .await
            .map_err(|_| "Storage stopped before receipt".to_string())?
    }
    pub fn storage(&self) -> Storage {
        Storage {
            sender: self.sender.lock().unwrap().as_ref().unwrap().clone(),
            #[cfg(feature = "host")]
            changes: self.changes.clone(),
            active: self.active.clone(),
        }
    }
    pub fn stop(&self) {
        if let Some(sender) = self.sender.lock().unwrap().take() {
            let _ = sender.send(Message::Stop);
        }
        if let Some(thread) = self.thread.lock().unwrap().take() {
            let _ = thread.join();
        }
    }
}
impl Drop for Worker {
    fn drop(&mut self) {
        self.stop();
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    fn run<T>(future: impl std::future::Future<Output = T>) -> T {
        tokio::runtime::Builder::new_current_thread().build().unwrap().block_on(future)
    }
    #[test]
    fn isolated_preferences_do_not_write_into_unowned_folders() {
        let temp=tempfile::tempdir().unwrap();
        let root=temp.path().join("external");std::fs::create_dir(&root).unwrap();
        std::fs::write(root.join("original.txt"),"untouched").unwrap();
        let worker=Worker::start(root.clone(),None).unwrap();
        assert!(run(worker.call(Request::Preferences{value:Some(serde_json::json!({"theme":"oled"}))})).is_err());
        assert!(!root.join(".profile-preferences.json").exists());
        assert_eq!(std::fs::read_to_string(root.join("original.txt")).unwrap(),"untouched");worker.stop();
    }
    #[test]
    fn active_tasks_block_switch_and_stale_storage_receipts_are_refused() {
        let temp = tempfile::tempdir().unwrap();
        let first = temp.path().join("first");
        let worker = Worker::start(first.clone(), None).unwrap();
        let storage = worker.storage();
        let root = first.to_string_lossy().to_string();
        storage
            .call(&root, |_| Ok(serde_json::Value::Null))
            .unwrap();
        storage.active.store(1, Ordering::SeqCst);
        let second = temp.path().join("second");
        let call = |request| run(worker.call(request));
        assert!(call(Request::New {
            path: second.to_string_lossy().into_owned()
        })
        .unwrap_err()
        .contains("Activity"));
        assert!(!second.exists());
        storage.active.store(0, Ordering::SeqCst);
        call(Request::New {
            path: second.to_string_lossy().into_owned(),
        })
        .unwrap();
        assert!(storage
            .call(&root, |_| Ok(serde_json::Value::Null))
            .is_err());
        worker.stop();
    }
}
