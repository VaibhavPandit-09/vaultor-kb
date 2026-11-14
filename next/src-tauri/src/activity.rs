//! Bounded, on-demand task execution. No Tauri types and no idle polling/thread.
use crate::{domain::error, transfers, worker::Storage};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{
    collections::VecDeque,
    fs,
    path::PathBuf,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Condvar, Mutex,
    },
    time::{Instant, SystemTime, UNIX_EPOCH},
};
use uuid::Uuid;
#[derive(Clone, Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Task {
    pub id: String,
    pub kind: String,
    pub title: String,
    pub workspace: String,
    pub state: String,
    pub phase: String,
    pub done: u64,
    pub total: Option<u64>,
    pub bytes: u64,
    pub total_bytes: Option<u64>,
    pub started: Option<u64>,
    pub finished: Option<u64>,
    pub result: Option<Value>,
    pub error: Option<String>,
    pub cancellable: bool,
}
fn now() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_millis() as u64
}
struct Pending {
    id: String,
    root: String,
    job: transfers::Job,
    cancel: Arc<AtomicBool>,
}
struct State {
    tasks: Vec<Task>,
    queue: VecDeque<Pending>,
    running: bool,
    closed: bool,
    cancels: Vec<(String, Arc<AtomicBool>)>,
}
pub struct Activity {
    state: Mutex<State>,
    idle: Condvar,
    path: PathBuf,
    storage: Storage,
    emit: Box<dyn Fn(Vec<Task>) + Send + Sync>,
    _lock: fs::File,
}
pub struct Context<'a> {
    pub engine: &'a Activity,
    pub id: String,
    pub cancel: Arc<AtomicBool>,
    last: Instant,
}
impl Context<'_> {
    pub fn check(&self) -> Result<(), String> {
        if self.cancel.load(Ordering::SeqCst) {
            Err("Cancelled at a safe boundary; committed items are retained".into())
        } else {
            Ok(())
        }
    }
    pub fn progress(
        &mut self,
        phase: &str,
        done: u64,
        total: Option<u64>,
        bytes: u64,
        total_bytes: Option<u64>,
    ) {
        if self.last.elapsed().as_millis() < 100 && total != Some(done) {
            return;
        }
        self.last = Instant::now();
        self.engine.change(
            &self.id,
            |t| {
                t.phase = phase.into();
                t.done = done;
                t.total = total;
                t.bytes = bytes;
                t.total_bytes = total_bytes;
            },
            false,
        );
    }
    pub fn committing(&self) {
        self.engine.change(
            &self.id,
            |t| {
                t.cancellable = false;
                t.phase = "Verifying and publishing — cancellation deferred".into();
            },
            false,
        );
    }
}
impl Activity {
    pub fn new(
        path: PathBuf,
        storage: Storage,
        emit: impl Fn(Vec<Task>) + Send + Sync + 'static,
    ) -> Result<Arc<Self>, String> {
        use fs2::FileExt;
        let lock = fs::OpenOptions::new()
            .read(true)
            .write(true)
            .create(true)
            .truncate(false)
            .open(path.with_extension("lock"))
            .map_err(error)?;
        lock.try_lock_exclusive()
            .map_err(|_| "Activity profile is already owned by another Vaultor Next process")?;
        let mut tasks: Vec<Task> = fs::metadata(&path)
            .ok()
            .filter(|m| m.len() < 16 * 1024 * 1024)
            .and_then(|_| fs::read(&path).ok())
            .and_then(|b| serde_json::from_slice(&b).ok())
            .unwrap_or_default();
        tasks.truncate(64);
        for t in &mut tasks {
            if t.state == "queued" || t.state == "running" {
                t.state = "interrupted".into();
                t.finished = Some(now());
                t.cancellable = false;
                t.error=Some("Interrupted by application exit. Outputs may include committed import items; review before retrying. No task is automatically replayed.".into());
            }
        }
        Ok(Arc::new(Self {
            state: Mutex::new(State {
                tasks,
                queue: VecDeque::new(),
                running: false,
                closed: false,
                cancels: vec![],
            }),
            idle: Condvar::new(),
            path,
            storage,
            emit: Box::new(emit),
            _lock: lock,
        }))
    }
    pub fn list(&self) -> Vec<Task> {
        self.state.lock().unwrap().tasks.clone()
    }
    fn publish(&self, s: &State, persist: bool) -> Result<(), String> {
        if persist {
            let temp = self.path.with_extension("pending");
            let bytes = serde_json::to_vec(&s.tasks).map_err(error)?;
            fs::write(&temp, bytes).map_err(error)?;
            fs::OpenOptions::new()
                .write(true)
                .open(&temp)
                .and_then(|f| f.sync_all())
                .map_err(error)?;
            fs::rename(temp, &self.path).map_err(error)?;
        }
        (self.emit)(s.tasks.clone());
        Ok(())
    }
    fn change(&self, id: &str, f: impl FnOnce(&mut Task), persist: bool) {
        let mut s = self.state.lock().unwrap();
        if let Some(t) = s.tasks.iter_mut().find(|t| t.id == id) {
            f(t);
        }
        if let Err(e) = self.publish(&s, persist) {
            if let Some(t) = s.tasks.iter_mut().find(|t| t.id == id) {
                t.error = Some(format!("Activity history persistence failed: {e}"));
            }
            (self.emit)(s.tasks.clone());
        }
    }
    pub fn submit(self: &Arc<Self>, root: String, job: transfers::Job) -> Result<Value, String> {
        let mut s = self.state.lock().unwrap();
        if s.closed || s.queue.len() >= 8 {
            return Err("Activity queue is full or closing".into());
        }
        let id = Uuid::new_v4().to_string();
        let cancel = Arc::new(AtomicBool::new(false));
        s.tasks.retain(|t| {
            t.finished.is_none() || saturating_age(t.finished.unwrap()) < 30 * 86400 * 1000
        });
        while s.tasks.len() >= 64 {
            if let Some(i) = s.tasks.iter().rposition(|t| t.finished.is_some()) {
                s.tasks.remove(i);
            } else {
                return Err("Activity history is full".into());
            }
        }
        let kind = job.kind();
        s.tasks.insert(
            0,
            Task {
                id: id.clone(),
                kind: kind.into(),
                title: job.description(),
                workspace: root.clone(),
                state: "queued".into(),
                phase: "Queued".into(),
                done: 0,
                total: None,
                bytes: 0,
                total_bytes: None,
                started: None,
                finished: None,
                result: None,
                error: None,
                cancellable: true,
            },
        );
        self.publish(&s, true)?;
        self.storage.active.fetch_add(1, Ordering::SeqCst);
        s.cancels.push((id.clone(), cancel.clone()));
        s.queue.push_back(Pending {
            id: id.clone(),
            root,
            job,
            cancel,
        });
        if !s.running {
            s.running = true;
            let engine = self.clone();
            std::thread::spawn(move || engine.drain());
        }
        Ok(json!({"id":id}))
    }
    fn drain(self: Arc<Self>) {
        loop {
            let pending = {
                let mut s = self.state.lock().unwrap();
                match s.queue.pop_front() {
                    Some(p) => p,
                    None => {
                        s.running = false;
                        self.idle.notify_all();
                        return;
                    }
                }
            };
            self.change(
                &pending.id,
                |t| {
                    t.state = "running".into();
                    t.started = Some(now());
                    t.phase = "Preparing".into();
                },
                true,
            );
            let mut context = Context {
                engine: &self,
                id: pending.id.clone(),
                cancel: pending.cancel,
                last: Instant::now() - std::time::Duration::from_secs(1),
            };
            let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                context.check().and_then(|_| {
                    transfers::execute(&self.storage, &pending.root, pending.job, &mut context)
                })
            }))
            .unwrap_or_else(|_| {
                Err("Transfer stopped unexpectedly; review Activity and workspace".into())
            });
            self.change(
                &pending.id,
                |t| {
                    t.finished = Some(now());
                    t.cancellable = false;
                    match result {
                        Ok(v) => {
                            t.state = "completed".into();
                            t.phase = "Completed".into();
                            t.result = Some(v)
                        }
                        Err(e) => {
                            t.state = if e.starts_with("Cancelled at") {
                                "cancelled"
                            } else {
                                "failed"
                            }
                            .into();
                            t.phase = t.state.clone();
                            t.error = Some(e);
                        }
                    }
                },
                true,
            );
            let mut s = self.state.lock().unwrap();
            s.cancels.retain(|(id, _)| id != &pending.id);
            self.storage.active.fetch_sub(1, Ordering::SeqCst);
        }
    }
    pub fn cancel(&self, id: &str) -> Result<(), String> {
        let s = self.state.lock().unwrap();
        let t = s.tasks.iter().find(|t| t.id == id).ok_or("Unknown task")?;
        if !t.cancellable {
            return Err("Task is publishing or already finished".into());
        }
        if let Some((_, c)) = s.cancels.iter().find(|(i, _)| i == id) {
            c.store(true, Ordering::SeqCst);
        }
        Ok(())
    }
    pub fn shutdown(&self) {
        let mut s = self.state.lock().unwrap();
        s.closed = true;
        for (_, c) in &s.cancels {
            c.store(true, Ordering::SeqCst);
        }
        while s.running {
            s = self.idle.wait(s).unwrap();
        }
    }
}
fn saturating_age(timestamp: u64) -> u64 {
    now().saturating_sub(timestamp)
}

#[cfg(test)]
mod startup_tests {
    use super::*;

    #[test]
    fn profile_lock_refuses_second_owner_and_releases_on_normal_close() {
        let temp = tempfile::tempdir().unwrap();
        let worker = crate::worker::Worker::start(temp.path().join("workspace"), None).unwrap();
        let path = temp.path().join("next-activity.json");
        let first = Activity::new(path.clone(), worker.storage(), |_| {}).unwrap();
        let before = fs::read(&path).ok();
        let second = Activity::new(path.clone(), worker.storage(), |_| {});
        assert!(matches!(second, Err(ref error) if error.contains("already owned")));
        assert_eq!(fs::read(&path).ok(), before);
        first.shutdown();
        drop(first);
        let reopened = Activity::new(path, worker.storage(), |_| {}).unwrap();
        reopened.shutdown();
    }
}
