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
    pub active: Arc<AtomicUsize>,
}
impl Storage {
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
}
impl Worker {
    pub fn start(root: PathBuf, pointer: Option<PathBuf>) -> Result<Self, String> {
        let (sender, receiver) = mpsc::channel::<Message>();
        let active = Arc::new(AtomicUsize::new(0));
        let gate = active.clone();
        let thread = thread::Builder::new()
            .name("vaultor-storage".into())
            .spawn(move || {
                // Failed initialization stays recoverable through an explicit Open request.
                let mut workspace = Workspace::open(&root);
                for message in receiver {
                    let (request, reply) = match message {
                        Message::Stop => break,
                        Message::Request(r, tx) => (r, tx),
                        Message::Operation(root, op, tx) => {
                            let result = match workspace.as_mut() {
                                Ok(w) if w.is_path(std::path::Path::new(&root)) => op(w),
                                _ => Err("Workspace changed; task refused".into()),
                            };
                            let _ = tx.send(result);
                            continue;
                        }
                    };
                    let request = match request {
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
                }
                // Connection, lock and statements drop together after queued work drains.
            })
            .map_err(|e| e.to_string())?;
        Ok(Self {
            sender: Mutex::new(Some(sender)),
            thread: Mutex::new(Some(thread)),
            active,
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
        let call = |request| tauri::async_runtime::block_on(worker.call(request));
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
