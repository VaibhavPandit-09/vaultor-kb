//! One SQLite owner thread. Commands await receipts without blocking the webview/event loop.
use crate::domain::{Request, Workspace};
use std::{
    path::PathBuf,
    sync::{mpsc, Mutex},
    thread,
};
use tokio::sync::oneshot;
type Reply = oneshot::Sender<Result<serde_json::Value, String>>;
pub struct Worker {
    sender: Mutex<Option<mpsc::Sender<(Request, Reply)>>>,
    thread: Mutex<Option<thread::JoinHandle<()>>>,
}
impl Worker {
    pub fn start(root: PathBuf, pointer: Option<PathBuf>) -> Result<Self, String> {
        let (sender, receiver) = mpsc::channel::<(Request, Reply)>();
        let thread = thread::Builder::new()
            .name("vaultor-storage".into())
            .spawn(move || {
                // Failed initialization stays recoverable through an explicit Open request.
                let mut workspace = Workspace::open(&root);
                for (request, reply) in receiver {
                    let result = match request {
                        Request::Open { path } => {
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
        })
    }
    pub async fn call(&self, request: Request) -> Result<serde_json::Value, String> {
        let (sender, receiver) = oneshot::channel();
        self.sender
            .lock()
            .map_err(|_| "Storage unavailable")?
            .as_ref()
            .ok_or("Storage closed")?
            .send((request, sender))
            .map_err(|_| "Storage closed")?;
        receiver
            .await
            .map_err(|_| "Storage stopped before receipt".to_string())?
    }
    pub fn stop(&self) {
        self.sender.lock().unwrap().take();
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
