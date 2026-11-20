use super::{inventory, native};
use crate::{activity::Activity, domain::error, transfers::Job, worker::Storage};
use notify::{Event, EventKind, RecursiveMode, Watcher};
use serde_json::{json, Value};
use std::{
    collections::{BTreeMap, BTreeSet},
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicBool, Ordering},
        mpsc::{self, RecvTimeoutError},
        Arc, Mutex,
    },
    thread::{self, JoinHandle},
    time::{Duration, Instant},
};

const DEBOUNCE: Duration = Duration::from_millis(175);
const HEALTH_INTERVAL: Duration = Duration::from_secs(4);
const MAX_PATHS: usize = 128;

#[derive(Clone)]
struct Source {
    root: PathBuf,
    grant: Value,
    watching: bool,
}

pub struct Monitor {
    workspace: Arc<Mutex<String>>,
    changed: Arc<AtomicBool>,
    stop: Arc<AtomicBool>,
    thread: Mutex<Option<JoinHandle<()>>>,
}

impl Monitor {
    pub fn start(
        workspace: String,
        storage: Storage,
        activity: Arc<Activity>,
        emit: impl Fn(&str) + Send + 'static,
    ) -> Result<Self, String> {
        let (events, inbox) = mpsc::sync_channel(256);
        let lost = Arc::new(AtomicBool::new(false));
        let overflow = lost.clone();
        let mut watcher = notify::recommended_watcher(move |event: notify::Result<Event>| {
            if events.try_send(event).is_err() {
                overflow.store(true, Ordering::Release);
            }
        })
        .map_err(error)?;
        let workspace = Arc::new(Mutex::new(workspace));
        let changed = Arc::new(AtomicBool::new(true));
        let stop = Arc::new(AtomicBool::new(false));
        let (target, dirty, stopping) = (workspace.clone(), changed.clone(), stop.clone());
        let thread = thread::Builder::new()
            .name("vaultor-linked-monitor".into())
            .spawn(move || {
                let mut current = String::new();
                let mut sources: BTreeMap<String, Source> = BTreeMap::new();
                let mut paths: BTreeMap<(String, String), u8> = BTreeMap::new();
                let mut scans = BTreeSet::new();
                let mut ready = Instant::now();
                let mut health = Instant::now();
                let mut first_pending = None::<Instant>;
                while !stopping.load(Ordering::Acquire) {
                    if dirty.swap(false, Ordering::AcqRel) || Instant::now() >= health {
                        let workspace = target.lock().unwrap().clone();
                        if current != workspace {
                            for source in sources.values().filter(|s| s.watching) {
                                let _ = watcher.unwatch(&source.root);
                            }
                            current = workspace;
                            sources.clear();
                            paths.clear();
                            scans.clear();
                            while inbox.try_recv().is_ok() {}
                        }
                        if let Ok(grants) = load_grants(&storage, &current) {
                            sources.retain(|id, source| {
                                if grants.get(id) == Some(&source.grant) {
                                    return true;
                                }
                                if source.watching {
                                    let _ = watcher.unwatch(&source.root);
                                }
                                paths.retain(|(source_id, _), _| source_id != id);
                                scans.remove(id);
                                false
                            });
                            for (id, grant) in grants {
                                let Some(path) = grant[0].as_str() else {
                                    continue;
                                };
                                let source = sources.entry(id.clone()).or_insert_with(|| Source {
                                    root: PathBuf::from(path),
                                    grant: grant.clone(),
                                    watching: false,
                                });
                                // Only the roots are checked on the health interval. Files are event-driven.
                                let pins = native::pin(&source.root).ok().filter(|pins| {
                                    native::identity(pins.last().unwrap()).ok().as_deref()
                                        == grant[1].as_str()
                                });
                                if let Some(_pins) = pins {
                                    if !source.watching
                                        && watcher
                                            .watch(&source.root, RecursiveMode::Recursive)
                                            .is_ok()
                                    {
                                        source.watching = true;
                                        scans.insert(id);
                                    }
                                } else {
                                    let disconnected = source.watching;
                                    if source.watching {
                                        let _ = watcher.unwatch(&source.root);
                                    }
                                    source.watching = false;
                                    scans.remove(&id);
                                    paths.retain(|(source, _), _| source != &id);
                                    if withdraw_source(&storage, &current, id, grant)
                                        .unwrap_or(false)
                                        || disconnected
                                    {
                                        emit(&current);
                                    }
                                }
                            }
                        }
                        health = Instant::now() + HEALTH_INTERVAL;
                    }

                    let mut received = 0;
                    match inbox.recv_timeout(Duration::from_millis(125)) {
                        Ok(event) => {
                            record_event(event, &sources, &mut paths, &mut scans);
                            received += 1;
                            while received < 256 {
                                let Ok(event) = inbox.try_recv() else {
                                    break;
                                };
                                record_event(event, &sources, &mut paths, &mut scans);
                                received += 1;
                            }
                        }
                        Err(RecvTimeoutError::Disconnected) => break,
                        Err(RecvTimeoutError::Timeout) => {}
                    }
                    if lost.swap(false, Ordering::AcqRel) {
                        paths.clear();
                        scans.extend(
                            sources
                                .iter()
                                .filter(|(_, source)| source.watching)
                                .map(|(id, _)| id.clone()),
                        );
                    }
                    if received > 0 {
                        let now = Instant::now();
                        let first = *first_pending.get_or_insert(now);
                        ready = (now + DEBOUNCE).min(first + Duration::from_secs(1));
                    }
                    if Instant::now() < ready || dirty.load(Ordering::Acquire) {
                        continue;
                    }
                    first_pending = None;
                    let mut updated = false;
                    for ((id, path), attempts) in std::mem::take(&mut paths) {
                        if stopping.load(Ordering::Acquire) || dirty.load(Ordering::Acquire) {
                            break;
                        }
                        let Some(source) = sources.get(&id).filter(|s| s.watching) else {
                            continue;
                        };
                        if scans.contains(&id) {
                            continue;
                        }
                        match inventory::reconcile_path(
                            &storage,
                            &current,
                            &id,
                            &source.grant,
                            &path,
                        ) {
                            Ok(changed) => updated |= changed,
                            Err(_) if attempts < 2 => {
                                paths.insert((id, path), attempts + 1);
                            }
                            Err(_) => {
                                scans.insert(id);
                            }
                        }
                    }
                    if updated {
                        emit(&current);
                    }
                    if !paths.is_empty() {
                        ready = Instant::now() + DEBOUNCE;
                    }
                    // Substantial rescans use Activity, with one outstanding linked scan per workspace.
                    if !scans.is_empty()
                        && !activity.list().iter().any(|task| {
                            task.workspace == current
                                && task.kind == "linked-index"
                                && task.finished.is_none()
                        })
                    {
                        if let Some(id) = scans.first().cloned() {
                            if activity
                                .submit(current.clone(), Job::IndexLinked { source: id.clone() })
                                .is_ok()
                            {
                                scans.remove(&id);
                            }
                        }
                    }
                }
            })
            .map_err(error)?;
        Ok(Self {
            workspace,
            changed,
            stop,
            thread: Mutex::new(Some(thread)),
        })
    }

    pub fn reconfigure(&self, workspace: Option<&str>) {
        if let Some(path) = workspace {
            *self.workspace.lock().unwrap() = path.into();
        }
        self.changed.store(true, Ordering::Release);
    }

    pub fn shutdown(&self) {
        self.stop.store(true, Ordering::Release);
        if let Some(thread) = self.thread.lock().unwrap().take() {
            let _ = thread.join();
        }
    }
}

impl Drop for Monitor {
    fn drop(&mut self) {
        self.shutdown();
    }
}

fn load_grants(storage: &Storage, workspace: &str) -> Result<BTreeMap<String, Value>, String> {
    let value = storage.call(workspace, |w| {
        let mut q =
            w.db.prepare("SELECT id FROM linked_sources WHERE active=1 LIMIT 8")
                .map_err(error)?;
        let ids = q
            .query_map([], |r| r.get::<_, String>(0))
            .map_err(error)?
            .collect::<Result<Vec<_>, _>>()
            .map_err(error)?;
        let mut grants = BTreeMap::new();
        for id in ids {
            grants.insert(id.clone(), w.linked_grant(&id)?);
        }
        Ok(json!(grants))
    })?;
    serde_json::from_value(value).map_err(error)
}

fn withdraw_source(
    storage: &Storage,
    workspace: &str,
    source: String,
    grant: Value,
) -> Result<bool, String> {
    let result = storage.call(workspace, move |w| {
        if w.linked_grant(&source)? != grant {
            return Err("Source authorization changed".into());
        }
        let changed =
            w.db.execute(
                "UPDATE linked_inventory SET available=0 WHERE available=1 AND document_id IN
            (SELECT id FROM linked_documents WHERE source_id=?1)",
                [source],
            )
            .map_err(error)?;
        Ok(json!(changed > 0))
    })?;
    Ok(result.as_bool().unwrap_or(false))
}

fn record_event(
    event: notify::Result<Event>,
    sources: &BTreeMap<String, Source>,
    paths: &mut BTreeMap<(String, String), u8>,
    scans: &mut BTreeSet<String>,
) {
    let Ok(event) = event else {
        scans.extend(
            sources
                .iter()
                .filter(|(_, source)| source.watching)
                .map(|(id, _)| id.clone()),
        );
        return;
    };
    if event.need_rescan() {
        scans.extend(
            sources
                .iter()
                .filter(|(_, source)| source.watching)
                .map(|(id, _)| id.clone()),
        );
        return;
    }
    if event.kind.is_access() {
        return;
    }
    for path in event.paths {
        for (id, source) in sources.iter().filter(|(_, source)| source.watching) {
            let Ok(relative) = path.strip_prefix(&source.root) else {
                continue;
            };
            let Some(relative) = relative.to_str() else {
                scans.insert(id.clone());
                continue;
            };
            let relative = relative.replace('\\', "/");
            if relative
                .split('/')
                .any(|part| part == ".git" || part.starts_with(".vaultor-"))
            {
                continue;
            }
            if inventory::is_markdown(Path::new(&relative)) && paths.len() < MAX_PATHS {
                paths.insert((id.clone(), relative), 0);
            } else if relative.is_empty()
                || paths.len() >= MAX_PATHS
                || matches!(
                    event.kind,
                    EventKind::Create(_)
                        | EventKind::Remove(_)
                        | EventKind::Modify(notify::event::ModifyKind::Name(_))
                        | EventKind::Any
                        | EventKind::Other
                )
            {
                scans.insert(id.clone());
            }
        }
    }
}
