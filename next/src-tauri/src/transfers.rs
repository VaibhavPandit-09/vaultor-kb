//! Immutable managed originals, short actor transactions and streaming versioned archives.
use crate::{
    activity::{Activity, Context},
    domain::{error, Workspace},
    worker::Storage,
};
use rusqlite::{params, OptionalExtension};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::{
    collections::{HashMap, HashSet},
    fs::{self, File, OpenOptions},
    io::{Read, Write},
    path::{Path, PathBuf},
    sync::{Arc, Mutex},
    time::{Duration, Instant},
};
use uuid::Uuid;
const MAX_ITEMS: usize = 20000;
const MAX_FILE: u64 = 1024 * 1024 * 1024;
const MAX_TOTAL: u64 = 10 * 1024 * 1024 * 1024;
const MAX_MANIFEST: u64 = 32 * 1024 * 1024;
const MAGIC: &[u8; 8] = b"VAULTOR1";
#[derive(Clone, Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Original {
    pub id: String,
    pub name: String,
    pub hash: String,
    pub bytes: u64,
    pub kind: String,
    pub provenance: String,
}
#[derive(Clone, Serialize, Deserialize, Debug)]
#[serde(deny_unknown_fields)]
pub struct Resource {
    pub id: String,
    pub title: String,
    pub content: Value,
    pub revision: i64,
    pub updated: String,
}
#[derive(Clone, Serialize, Deserialize, Debug)]
#[serde(deny_unknown_fields)]
pub struct Collection {
    pub id: String,
    pub name: String,
    pub parent: Option<String>,
}
#[derive(Serialize, Deserialize, Debug)]
#[serde(deny_unknown_fields)]
pub struct Manifest {
    pub format: String,
    pub version: u32,
    pub resources: Vec<Resource>,
    pub collections: Vec<Collection>,
    pub memberships: Vec<(String, String)>,
    pub originals: Vec<Original>,
    pub settings: Value,
    #[serde(default)]
    pub organization: crate::organization::Archive,
}
#[derive(Clone)]
struct Input {
    path: PathBuf,
    relative: Vec<String>,
    name: String,
    bytes: u64,
    hash: String,
    duplicate: bool,
}
pub struct Plan {
    root: String,
    collection: Option<String>,
    files: Vec<Input>,
    directories: Vec<Vec<String>>,
    issues: Vec<String>,
    created: Instant,
}
pub enum Job {
    Purge {
        ids: Option<Vec<String>>,
    },
    Import {
        plan: Plan,
        separate: bool,
    },
    Export {
        ids: Vec<String>,
        destination: String,
        format: String,
    },
    Archive {
        destination: String,
    },
    Restore {
        source: String,
        destination: String,
        manifest_hash: String,
    },
}
impl Job {
    pub fn kind(&self) -> &str {
        match self {
            Self::Purge { .. } => "resource-purge",
            Self::Import { .. } => "file-import",
            Self::Export { .. } => "resource-export",
            Self::Archive { .. } => "workspace-export",
            Self::Restore { .. } => "workspace-import",
        }
    }
    pub fn description(&self) -> String {
        match self {
            Self::Purge { .. } => "Permanently delete Trash resources".into(),
            Self::Import { plan, .. } => format!("Import {} files", plan.files.len()),
            Self::Export { ids, .. } => format!("Export {} resources", ids.len()),
            Self::Archive { .. } => "Export workspace archive".into(),
            Self::Restore { .. } => "Restore workspace as new".into(),
        }
    }
}
#[derive(Deserialize)]
#[serde(tag = "op", rename_all = "camelCase", deny_unknown_fields)]
pub enum Request {
    Purge {
        ids: Option<Vec<String>>,
    },
    Tasks,
    DismissPreview {
        token: String,
    },
    Cancel {
        id: String,
    },
    Preview {
        paths: Vec<String>,
        folder: bool,
        collection: Option<String>,
    },
    Import {
        token: String,
        separate: bool,
    },
    Export {
        ids: Vec<String>,
        destination: String,
        format: String,
    },
    Archive {
        destination: String,
    },
    InspectArchive {
        source: String,
    },
    Restore {
        source: String,
        destination: String,
        #[serde(rename = "manifestHash")]
        manifest_hash: String,
    },
}
pub struct Transfers {
    pub activity: Arc<Activity>,
    storage: Storage,
    plans: Mutex<HashMap<String, Plan>>,
}
impl Transfers {
    pub fn new(storage: Storage, activity: Arc<Activity>) -> Self {
        Self {
            activity,
            storage,
            plans: Mutex::new(HashMap::new()),
        }
    }
    pub fn execute(&self, root: String, request: Request) -> Result<Value, String> {
        match request {
            Request::Tasks => Ok(json!(self.activity.list())),
            Request::DismissPreview { token } => {
                self.plans.lock().unwrap().remove(&token);
                Ok(Value::Null)
            }
            Request::Cancel { id } => {
                self.activity.cancel(&id)?;
                Ok(Value::Null)
            }
            Request::Preview {
                paths,
                folder,
                collection,
            } => {
                let plan = prepare(&self.storage, &root, paths, folder, collection)?;
                let token = Uuid::new_v4().to_string();
                let summary = json!({"token":token,"files":plan.files.len(),"directories":plan.directories.len(),"bytes":plan.files.iter().map(|f|f.bytes).sum::<u64>(),"duplicates":plan.files.iter().filter(|f|f.duplicate).count(),"issues":plan.issues,"items":plan.files.iter().take(100).map(|f|json!({"name":f.relative.join("/"),"bytes":f.bytes,"duplicate":f.duplicate})).collect::<Vec<_>>()});
                let mut plans = self.plans.lock().unwrap();
                plans.retain(|_, p| p.created.elapsed() < Duration::from_secs(900));
                if plans.len() >= 4 {
                    return Err("Close old import reviews before preparing another".into());
                }
                plans.insert(token, plan);
                Ok(summary)
            }
            Request::Import { token, separate } => {
                let plan = self
                    .plans
                    .lock()
                    .unwrap()
                    .remove(&token)
                    .ok_or("Import review expired; choose source again")?;
                if plan.root != root || plan.created.elapsed() > Duration::from_secs(900) {
                    return Err("Workspace changed or import review expired".into());
                }
                self.activity.submit(root, Job::Import { plan, separate })
            }
            Request::Export {
                ids,
                destination,
                format,
            } => {
                if ids.is_empty()
                    || ids.len() > 100
                    || !matches!(format.as_str(), "markdown" | "text" | "original")
                {
                    return Err("Choose 1–100 resources and a supported format".into());
                }
                self.activity.submit(
                    root,
                    Job::Export {
                        ids,
                        destination,
                        format,
                    },
                )
            }
            Request::Purge { ids } => {
                if ids.as_ref().is_some_and(|v| v.is_empty() || v.len() > 100) {
                    return Err("Choose 1–100 resources or Empty Trash".into());
                }
                self.activity.submit(root, Job::Purge { ids })
            }
            Request::Archive { destination } => {
                self.activity.submit(root, Job::Archive { destination })
            }
            Request::InspectArchive { source } => {
                let (m, hash) = inspect_archive(Path::new(&source), None)?;
                Ok(
                    json!({"manifestHash":hash,"resources":m.resources.len(),"collections":m.collections.len(),"files":m.originals.len(),"bytes":m.originals.iter().map(|f|f.bytes).sum::<u64>(),"version":m.version}),
                )
            }
            Request::Restore {
                source,
                destination,
                manifest_hash,
            } => self.activity.submit(
                root,
                Job::Restore {
                    source,
                    destination,
                    manifest_hash,
                },
            ),
        }
    }
}
pub fn initialize(db: &rusqlite::Connection) -> Result<(), String> {
    db.execute_batch("CREATE TABLE IF NOT EXISTS managed_originals(resource_id TEXT PRIMARY KEY REFERENCES resources(id),name TEXT NOT NULL,hash TEXT NOT NULL,bytes INTEGER NOT NULL,kind TEXT NOT NULL CHECK(kind IN ('note','file')),provenance TEXT NOT NULL);CREATE INDEX IF NOT EXISTS original_duplicate ON managed_originals(hash,name);").map_err(error)
}
pub fn plain_directory(path: &Path) -> Result<(), String> {
    for ancestor in path.ancestors() {
        let m = fs::symlink_metadata(ancestor).map_err(error)?;
        if !m.is_dir() || reparse(&m) {
            return Err("Directory must not contain links/reparse points".into());
        }
    }
    Ok(())
}
pub fn plain_file(path: &Path) -> Result<File, String> {
    for part in path.ancestors() {
        let m = fs::symlink_metadata(part).map_err(error)?;
        if reparse(&m) {
            return Err(format!(
                "Links/reparse points are not imported: {}",
                path.display()
            ));
        }
    }
    let mut options = OpenOptions::new();
    options.read(true);
    #[cfg(windows)]
    {
        use std::os::windows::fs::OpenOptionsExt;
        options.custom_flags(0x00200000);
    }
    let f = options.open(path).map_err(error)?;
    let m = f.metadata().map_err(error)?;
    if !m.is_file() || reparse(&m) || m.len() > MAX_FILE {
        return Err("Not an ordinary file, or exceeds 1 GiB".into());
    }
    Ok(f)
}
fn reparse(m: &fs::Metadata) -> bool {
    #[cfg(windows)]
    {
        use std::os::windows::fs::MetadataExt;
        m.file_attributes() & 0x400 != 0
    }
    #[cfg(not(windows))]
    {
        m.file_type().is_symlink()
    }
}
fn copy_hash(
    mut input: impl Read,
    mut output: impl Write,
    limit: u64,
    mut tick: impl FnMut(u64) -> Result<(), String>,
) -> Result<(u64, String), String> {
    let mut buf = [0u8; 65536];
    let mut hash = Sha256::new();
    let mut count = 0;
    loop {
        let n = input.read(&mut buf).map_err(error)?;
        if n == 0 {
            break;
        }
        count += n as u64;
        if count > limit {
            return Err("File/archive size limit exceeded".into());
        }
        output.write_all(&buf[..n]).map_err(error)?;
        hash.update(&buf[..n]);
        tick(count)?;
    }
    Ok((count, format!("{:x}", hash.finalize())))
}
fn component(name: &str) -> Result<(), String> {
    if name.is_empty()
        || name.len() > 255
        || name == "."
        || name == ".."
        || name.ends_with(['.', ' '])
        || name.chars().any(|c| c < ' ' || "<>:\"/\\|?*".contains(c))
    {
        return Err("Unsafe or unsupported name".into());
    }
    let stem = name.split('.').next().unwrap().to_uppercase();
    if [
        "CON", "PRN", "AUX", "NUL", "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7", "COM8",
        "COM9", "LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9",
    ]
    .contains(&stem.as_str())
    {
        return Err("Reserved Windows filename".into());
    }
    Ok(())
}
fn prepare(
    storage: &Storage,
    root: &str,
    paths: Vec<String>,
    folder: bool,
    collection: Option<String>,
) -> Result<Plan, String> {
    if paths.is_empty() || paths.len() > MAX_ITEMS || folder && paths.len() != 1 {
        return Err("Choose files or one folder".into());
    }
    let known = storage.call(root, {
        let c = collection.clone();
        move |w| {
            if let Some(id) = c {
                w.db.query_row("SELECT id FROM collections WHERE id=?1", [id], |r| {
                    r.get::<_, String>(0)
                })
                .map_err(error)?;
            }
            let mut q =
                w.db.prepare("SELECT name,hash FROM managed_originals")
                    .map_err(error)?;
            let rows = q
                .query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)))
                .map_err(error)?
                .collect::<Result<Vec<_>, _>>()
                .map_err(error)?;
            Ok(json!(rows))
        }
    })?;
    let known: HashSet<(String, String)> = serde_json::from_value::<Vec<(String, String)>>(known)
        .map_err(error)?
        .into_iter()
        .collect();
    let mut plan = Plan {
        root: root.into(),
        collection,
        files: vec![],
        directories: vec![],
        issues: vec![],
        created: Instant::now(),
    };
    let mut pending = vec![];
    let mut seen = HashSet::new();
    let workspace = Path::new(root).canonicalize().map_err(error)?;
    for path in paths {
        let p = PathBuf::from(path);
        let name = p
            .file_name()
            .and_then(|s| s.to_str())
            .ok_or("Invalid source name")?
            .to_string();
        pending.push((p, vec![name], 0));
    }
    let mut visited = 0;
    let mut total = 0;
    while let Some((path, relative, depth)) = pending.pop() {
        visited += 1;
        if visited > MAX_ITEMS || depth > 32 {
            return Err("Import is limited to 20,000 entries and 32 folder levels".into());
        }
        let result: Result<(), String> = (|| {
            for n in &relative {
                component(n)?;
            }
            let m = fs::symlink_metadata(&path).map_err(error)?;
            if reparse(&m) {
                return Err("Symbolic links/junctions are skipped".into());
            }
            let full = path.canonicalize().map_err(error)?;
            if full.starts_with(&workspace) || workspace.starts_with(&full) {
                return Err("Workspace storage cannot be an import source".into());
            }
            if !seen.insert(full.clone()) {
                return Ok(());
            }
            if m.is_dir() {
                if !folder {
                    return Err("Choose folder import for directories".into());
                }
                plan.directories.push(relative.clone());
                for child in fs::read_dir(&full).map_err(error)? {
                    let child = child.map_err(error)?;
                    let name = child
                        .file_name()
                        .into_string()
                        .map_err(|_| "Non-Unicode filename")?;
                    let mut r = relative.clone();
                    r.push(name);
                    if pending.len() + visited >= MAX_ITEMS {
                        return Err("Import exceeds 20,000 entries".into());
                    }
                    pending.push((child.path(), r, depth + 1));
                }
                return Ok(());
            }
            let f = plain_file(&full)?;
            let (bytes, hash) = copy_hash(f, std::io::sink(), MAX_FILE, |_| Ok(()))?;
            total += bytes;
            if total > MAX_TOTAL {
                return Err("Import exceeds 10 GiB".into());
            }
            let name = relative.last().unwrap().clone();
            let duplicate = known.contains(&(name.clone(), hash.clone()));
            plan.files.push(Input {
                path: full,
                relative,
                name,
                bytes,
                hash,
                duplicate,
            });
            Ok(())
        })();
        if total > MAX_TOTAL {
            return Err("Import exceeds 10 GiB".into());
        }
        if let Err(e) = result {
            if plan.issues.len() < 100 {
                plan.issues.push(format!("{}: {e}", relative_label(&path)));
            }
        }
    }
    plan.files.sort_by(|a, b| a.relative.cmp(&b.relative));
    plan.directories.sort();
    if total > MAX_TOTAL {
        return Err("Import exceeds 10 GiB".into());
    }
    Ok(plan)
}
fn relative_label(path: &Path) -> String {
    path.file_name()
        .unwrap_or_default()
        .to_string_lossy()
        .into_owned()
}
struct Cleanup(PathBuf, bool);
impl Drop for Cleanup {
    fn drop(&mut self) {
        if self.1 {
            let _ = fs::remove_dir_all(&self.0);
        } else {
            let _ = fs::remove_file(&self.0);
        }
    }
}
fn stage(parent: &Path, directory: bool) -> Result<Cleanup, String> {
    fs::create_dir_all(parent).map_err(error)?;
    let path = parent.join(format!(".vaultor-stage-{}", Uuid::new_v4()));
    if directory {
        fs::create_dir(&path).map_err(error)?;
    } else {
        OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&path)
            .map_err(error)?;
    }
    Ok(Cleanup(path, directory))
}
fn publish_file(stage: &Path, destination: &Path) -> Result<(), String> {
    if destination.exists() {
        return Err("Destination already exists; choose a new filename".into());
    }
    fs::hard_link(stage, destination)
        .map_err(|e| format!("Cannot publish without overwriting destination: {e}"))?;
    Ok(())
}
pub(crate) fn original_path(root: &Path, id: &str) -> Result<PathBuf, String> {
    Uuid::parse_str(id).map_err(error)?;
    let folder = root.join("managed");
    if folder.exists() && reparse(&fs::symlink_metadata(&folder).map_err(error)?) {
        return Err("Managed storage must not be a reparse point".into());
    }
    Ok(folder.join(format!("{id}.bin")))
}
pub fn execute(
    storage: &Storage,
    root: &str,
    job: Job,
    ctx: &mut Context,
) -> Result<Value, String> {
    match job {
        Job::Purge { ids } => purge(storage, root, ids, ctx),
        Job::Import { plan, separate } => import(storage, root, plan, separate, ctx),
        Job::Export {
            ids,
            destination,
            format,
        } => export(storage, root, ids, &destination, &format, ctx),
        Job::Archive { destination } => archive(storage, root, &destination, ctx),
        Job::Restore {
            source,
            destination,
            manifest_hash,
        } => restore(&source, &destination, &manifest_hash, ctx),
    }
}
fn import(
    storage: &Storage,
    root: &str,
    plan: Plan,
    separate: bool,
    ctx: &mut Context,
) -> Result<Value, String> {
    let mut mapped = HashMap::<Vec<String>, Option<String>>::new();
    mapped.insert(vec![], plan.collection.clone());
    let mut issues = plan.issues;
    let mut imported = 0;
    let mut skipped = 0;
    let mut bytes = 0;
    let total = plan.files.len() as u64;
    let total_bytes = plan.files.iter().map(|f| f.bytes).sum();
    for directory in plan.directories {
        ctx.check()?;
        let parent = mapped
            .get(&directory[..directory.len() - 1])
            .cloned()
            .ok_or("Parent folder unavailable")?;
        let name = directory.last().unwrap().clone();
        let value = storage.call(root, move |w| {
            let normalized = name.trim().to_lowercase();
            let found =
                w.db.query_row(
                    "SELECT id FROM collections WHERE normalized=?1 AND parent_id IS ?2",
                    params![normalized, parent],
                    |r| r.get::<_, String>(0),
                )
                .optional()
                .map_err(error)?;
            if let Some(id) = found {
                Ok(json!({"id":id}))
            } else {
                w.execute(crate::domain::Request::CreateCollection {
                    name,
                    parent_id: parent,
                })
            }
        })?;
        mapped.insert(directory, Some(value["id"].as_str().unwrap().into()));
    }
    for (index, input) in plan.files.into_iter().enumerate() {
        ctx.check()?;
        ctx.progress(
            "Copying originals",
            index as u64,
            Some(total),
            bytes,
            Some(total_bytes),
        );
        if input.duplicate && !separate {
            skipped += 1;
            bytes += input.bytes;
            continue;
        }
        let result = (|| {
            let id = Uuid::new_v4().to_string();
            let target = original_path(Path::new(root), &id)?;
            let staged = stage(target.parent().unwrap(), false)?;
            let mut out = OpenOptions::new()
                .write(true)
                .open(&staged.0)
                .map_err(error)?;
            let (base, hash) = copy_hash(plain_file(&input.path)?, &mut out, MAX_FILE, |n| {
                ctx.check()?;
                ctx.progress(
                    "Copying originals",
                    index as u64,
                    Some(total),
                    bytes + n,
                    Some(total_bytes),
                );
                Ok(())
            })?;
            out.sync_all().map_err(error)?;
            drop(out);
            if base != input.bytes || hash != input.hash {
                return Err("Source changed since review; choose it again".into());
            }
            let ext = input
                .path
                .extension()
                .and_then(|s| s.to_str())
                .unwrap_or("")
                .to_lowercase();
            let mut kind = "file";
            let mut content = json!({"type":"doc","content":[{"type":"paragraph"}]});
            if input.bytes <= 256 * 1024 && matches!(ext.as_str(), "md" | "markdown" | "txt") {
                let raw = fs::read(&staged.0).map_err(error)?;
                if let Ok(text) = std::str::from_utf8(&raw) {
                    if ext == "txt" {
                        content = json!({"type":"doc","content":text.split('\n').map(|line|json!({"type":"paragraph","content":if line.is_empty(){vec![]}else{vec![json!({"type":"text","text":line.trim_end_matches('\r')})]}})).collect::<Vec<_>>()});
                        kind = "note";
                    } else {
                        let parsed = crate::linked::markdown::parse(text);
                        if parsed.reason.is_none() {
                            content = parsed.document;
                            kind = "note";
                        }
                    }
                }
            }
            publish_file(&staged.0, &target)?;
            let original = Original {
                id: id.clone(),
                name: input.name.clone(),
                hash,
                bytes: base,
                kind: kind.into(),
                provenance: input.relative.join("/"),
            };
            let parent = mapped
                .get(&input.relative[..input.relative.len() - 1])
                .cloned()
                .unwrap_or(plan.collection.clone());
            let separate = separate;
            let receipt=storage.call(root,move|w|{let tx=w.db.transaction().map_err(error)?;if !separate {let duplicate:bool=tx.query_row("SELECT EXISTS(SELECT 1 FROM managed_originals WHERE hash=?1 AND name=?2)",params![original.hash,original.name],|r|r.get(0)).map_err(error)?;if duplicate{return Ok(json!({"skipped":true}));}}
   tx.execute("INSERT INTO resources(id,title,content)VALUES(?1,?2,?3)",params![original.id,original.name.chars().take(240).collect::<String>(),content.to_string()]).map_err(error)?;insert_original(&tx,&original)?;if let Some(parent)=parent{tx.execute("INSERT INTO memberships VALUES(?1,?2)",params![original.id,parent]).map_err(error)?;}tx.commit().map_err(error)?;Ok(json!({"skipped":false}))});
            match receipt {
                Ok(v) if v["skipped"] == true => {
                    fs::remove_file(&target).map_err(error)?;
                    Ok(false)
                }
                Ok(_) => Ok(true),
                Err(e) => {
                    let _ = fs::remove_file(target);
                    Err(e)
                }
            }
        })();
        match result {
            Ok(true) => imported += 1,
            Ok(false) => skipped += 1,
            Err(e) => {
                if issues.len() < 100 {
                    issues.push(format!("{}: {e}", input.relative.join("/")));
                }
            }
        }
        bytes += input.bytes;
    }
    ctx.progress(
        "Import committed",
        total,
        Some(total),
        bytes,
        Some(total_bytes),
    );
    Ok(json!({"imported":imported,"skipped":skipped,"issues":issues,"partial":!issues.is_empty()}))
}
fn insert_original(db: &rusqlite::Connection, o: &Original) -> Result<(), String> {
    db.execute(
        "INSERT INTO managed_originals VALUES(?1,?2,?3,?4,?5,?6)",
        params![o.id, o.name, o.hash, o.bytes, o.kind, o.provenance],
    )
    .map_err(error)?;
    Ok(())
}
fn snapshot(w: &mut Workspace, ids: Option<&[String]>) -> Result<Manifest, String> {
    if ids.is_none() {
        let unresolved:i64=w.db.query_row("SELECT (SELECT COUNT(*)FROM drafts)+(SELECT COUNT(*)FROM linked_drafts)+(SELECT COUNT(*)FROM linked_saves)",[],|r|r.get(0)).map_err(error)?;
        if unresolved > 0 {
            return Err("Resolve or explicitly discard all protected drafts/publication evidence before workspace export. Linked source bytes are excluded.".into());
        }
    }
    let mut m = Manifest {
        format: "vaultor-next-portable".into(),
        version: 2,
        resources: vec![],
        collections: vec![],
        memberships: vec![],
        originals: vec![],
        settings: json!({}),
        organization: Default::default(),
    };
    let mut size = 0;
    let mut q =
        w.db.prepare("SELECT id,title,content,revision,updated_at FROM resources ORDER BY seq")
            .map_err(error)?;
    let mut rows = q.query([]).map_err(error)?;
    while let Some(r) = rows.next().map_err(error)? {
        let id: String = r.get(0).map_err(error)?;
        if ids.is_some_and(|ids| !ids.contains(&id)) {
            continue;
        }
        let content: String = r.get(2).map_err(error)?;
        size += content.len();
        if size > MAX_MANIFEST as usize || m.resources.len() >= MAX_ITEMS {
            return Err("Portable snapshot exceeds 32 MiB JSON or 20,000 resources".into());
        }
        m.resources.push(Resource {
            id,
            title: r.get(1).map_err(error)?,
            content: serde_json::from_str(&content).map_err(error)?,
            revision: r.get(3).map_err(error)?,
            updated: r.get(4).map_err(error)?,
        });
    }
    if ids.is_some_and(|i| i.len() != m.resources.len()) {
        return Err("Selected resource is no longer available".into());
    }
    let mut q=w.db.prepare("SELECT resource_id,name,hash,bytes,kind,provenance FROM managed_originals ORDER BY resource_id").map_err(error)?;
    let originals = q
        .query_map([], |r| {
            Ok(Original {
                id: r.get(0)?,
                name: r.get(1)?,
                hash: r.get(2)?,
                bytes: r.get(3)?,
                kind: r.get(4)?,
                provenance: r.get(5)?,
            })
        })
        .map_err(error)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(error)?;
    let selected: HashSet<_> = m.resources.iter().map(|r| r.id.as_str()).collect();
    m.organization = crate::organization::Archive::capture(
        &w.db,
        &m.resources.iter().map(|r| r.id.clone()).collect(),
    )?;
    if ids.is_some(){m.organization.collection_pins.clear();}
    m.originals = originals
        .into_iter()
        .filter(|o| selected.contains(o.id.as_str()))
        .collect();
    if ids.is_none() {
        let mut q =
            w.db.prepare("SELECT id,name,parent_id FROM collections ORDER BY id")
                .map_err(error)?;
        m.collections = q
            .query_map([], |r| {
                Ok(Collection {
                    id: r.get(0)?,
                    name: r.get(1)?,
                    parent: r.get(2)?,
                })
            })
            .map_err(error)?
            .collect::<Result<Vec<_>, _>>()
            .map_err(error)?;
        let mut q=w.db.prepare("SELECT resource_id,collection_id FROM memberships ORDER BY resource_id,collection_id").map_err(error)?;
        m.memberships = q
            .query_map([], |r| Ok((r.get(0)?, r.get(1)?)))
            .map_err(error)?
            .collect::<Result<Vec<_>, _>>()
            .map_err(error)?;
        let mut settings =
            w.db.prepare("SELECT key,value FROM settings WHERE key IN ('theme','behavior')")
                .map_err(error)?;
        let pairs = settings
            .query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)))
            .map_err(error)?
            .collect::<Result<Vec<_>, _>>()
            .map_err(error)?;
        m.settings = Value::Object(
            pairs
                .into_iter()
                .map(|(k, v)| serde_json::from_str(&v).map(|v| (k, v)).map_err(error))
                .collect::<Result<_, _>>()?,
        );
    }
    Ok(m)
}
fn archive(
    storage: &Storage,
    root: &str,
    destination: &str,
    ctx: &mut Context,
) -> Result<Value, String> {
    let data = storage.call(root, |w| {
        Ok(serde_json::to_value(snapshot(w, None)?).map_err(error)?)
    })?;
    let m: Manifest = serde_json::from_value(data).map_err(error)?;
    let manifest = serde_json::to_vec(&m).map_err(error)?;
    if manifest.len() as u64 > MAX_MANIFEST {
        return Err("Manifest exceeds 32 MiB".into());
    }
    let destination = PathBuf::from(destination);
    let staged = stage(
        destination.parent().ok_or("Choose a destination file")?,
        false,
    )?;
    let mut output = OpenOptions::new()
        .write(true)
        .open(&staged.0)
        .map_err(error)?;
    output.write_all(MAGIC).map_err(error)?;
    output
        .write_all(&(manifest.len() as u64).to_le_bytes())
        .map_err(error)?;
    output
        .write_all(&Sha256::digest(&manifest))
        .map_err(error)?;
    output.write_all(&manifest).map_err(error)?;
    let mut bytes = 0;
    let total = m.originals.iter().map(|o| o.bytes).sum();
    for (i, o) in m.originals.iter().enumerate() {
        ctx.check()?;
        let (n, hash) = copy_hash(
            plain_file(&original_path(Path::new(root), &o.id)?)?,
            &mut output,
            MAX_FILE,
            |n| {
                ctx.check()?;
                ctx.progress(
                    "Archiving committed data",
                    i as u64,
                    Some(m.originals.len() as u64),
                    bytes + n,
                    Some(total),
                );
                Ok(())
            },
        )?;
        if n != o.bytes || hash != o.hash {
            return Err("Managed original integrity mismatch; archive not published".into());
        }
        bytes += n;
    }
    output.sync_all().map_err(error)?;
    drop(output);
    inspect_archive(&staged.0, Some(ctx))?;
    ctx.check()?;
    ctx.progress(
        "Archive verified",
        m.originals.len() as u64,
        Some(m.originals.len() as u64),
        bytes,
        Some(total),
    );
    ctx.committing();
    publish_file(&staged.0, &destination)?;
    Ok(
        json!({"path":destination,"resources":m.resources.len(),"bytes":bytes,"excluded":"Linked source contents, registrations, protected drafts and Activity history"}),
    )
}
fn read_manifest(input: &mut File) -> Result<(Manifest, String), String> {
    let mut magic = [0; 8];
    input.read_exact(&mut magic).map_err(error)?;
    if &magic != MAGIC {
        return Err("Not a Vaultor Next portable archive".into());
    }
    let mut length = [0; 8];
    input.read_exact(&mut length).map_err(error)?;
    let length = u64::from_le_bytes(length);
    if length > MAX_MANIFEST {
        return Err("Archive manifest too large".into());
    }
    let mut expected = [0u8; 32];
    input.read_exact(&mut expected).map_err(error)?;
    let mut data = vec![0; length as usize];
    input.read_exact(&mut data).map_err(error)?;
    if Sha256::digest(&data)[..] != expected {
        return Err("Archive manifest integrity mismatch".into());
    }
    let m: Manifest = serde_json::from_slice(&data).map_err(error)?;
    validate(&m)?;
    Ok((m, format!("{:x}", Sha256::digest(data))))
}
fn validate(m: &Manifest) -> Result<(), String> {
    if m.format != "vaultor-next-portable"
        || ![1, 2].contains(&m.version)
        || m.resources.len() > MAX_ITEMS
        || m.collections.len() > MAX_ITEMS
        || m.originals.len() > MAX_ITEMS
        || m.memberships.len() > 200000
    {
        return Err("Unsupported archive version or item limits".into());
    }
    let mut ids = HashSet::new();
    for r in &m.resources {
        Uuid::parse_str(&r.id).map_err(error)?;
        crate::domain::title(&r.title)?;
        crate::editing::document(&r.content)?;
        if r.revision < 1 || !ids.insert(r.id.clone()) {
            return Err("Invalid/duplicate resource identity".into());
        }
    }
    let mut collections = HashMap::new();
    let mut names = HashSet::new();
    for c in &m.collections {
        Uuid::parse_str(&c.id).map_err(error)?;
        crate::domain::title(&c.name)?;
        if collections.insert(c.id.clone(), c).is_some()
            || !names.insert((c.parent.clone(), c.name.trim().to_lowercase()))
        {
            return Err("Duplicate collection".into());
        }
    }
    for c in &m.collections {
        let mut parent = c.parent.as_ref();
        let mut seen = HashSet::from([c.id.clone()]);
        while let Some(id) = parent {
            if !seen.insert(id.clone()) {
                return Err("Collection cycle".into());
            }
            parent = collections
                .get(id)
                .ok_or("Unknown parent collection")?
                .parent
                .as_ref();
        }
    }
    let mut members = HashSet::new();
    for (r, c) in &m.memberships {
        if !ids.contains(r) || !collections.contains_key(c) || !members.insert((r, c)) {
            return Err("Invalid membership".into());
        }
    }
    m.organization.validate(&ids)?;
    let mut pinned_collections=HashSet::new();
    if m.organization.collection_pins.len()>20000 || m.organization.collection_pins.iter().any(|id|!collections.contains_key(id)||!pinned_collections.insert(id)){return Err("Invalid pinned collection inventory".into());}
    let mut originals = HashSet::new();
    let mut bytes = 0;
    for o in &m.originals {
        component(&o.name)?;
        if !ids.contains(&o.id)
            || !originals.insert(&o.id)
            || o.bytes > MAX_FILE
            || !matches!(o.kind.as_str(), "note" | "file")
            || o.hash.len() != 64
            || !o.hash.bytes().all(|b| b.is_ascii_hexdigit())
        {
            return Err("Invalid file inventory".into());
        }
        bytes += o.bytes;
        if bytes > MAX_TOTAL {
            return Err("Archive exceeds 10 GiB".into());
        }
    }
    if !m.settings.is_object()
        || m.settings.as_object().unwrap().keys().any(|k| k != "theme" && k != "behavior")
        || m.settings
            .get("theme")
            .is_some_and(|v| !matches!(v.as_str(), Some("light" | "dark" | "oled")))
    {
        return Err("Unsupported archive settings".into());
    }
    if let Some(value)=m.settings.get("behavior"){crate::desktop::validate_behavior(value)?;}
    Ok(())
}
fn inspect_archive(
    path: &Path,
    mut ctx: Option<&mut Context>,
) -> Result<(Manifest, String), String> {
    let mut input = plain_file_archive(path)?;
    let (m, hash) = read_manifest(&mut input)?;
    for o in &m.originals {
        let (n, actual) = copy_hash(
            (&mut input).take(o.bytes),
            std::io::sink(),
            MAX_FILE,
            |_| {
                if let Some(c) = ctx.as_mut() {
                    c.check()?;
                }
                Ok(())
            },
        )?;
        if n != o.bytes || actual != o.hash {
            return Err(format!("Archive integrity check failed for {}", o.name));
        }
    }
    let mut tail = [0];
    if input.read(&mut tail).map_err(error)? != 0 {
        return Err("Unexpected trailing archive data".into());
    }
    Ok((m, hash))
}
fn plain_file_archive(path: &Path) -> Result<File, String> {
    let m = fs::symlink_metadata(path).map_err(error)?;
    if reparse(&m) || !m.is_file() || m.len() > MAX_TOTAL + MAX_MANIFEST + 48 {
        return Err("Archive is not an ordinary file or exceeds 10 GiB".into());
    }
    File::open(path).map_err(error)
}
fn restore(
    source: &str,
    destination: &str,
    expected: &str,
    ctx: &mut Context,
) -> Result<Value, String> {
    let mut input = plain_file_archive(Path::new(source))?;
    let (m, hash) = read_manifest(&mut input)?;
    if hash != expected {
        return Err("Archive changed since preview".into());
    }
    let destination = PathBuf::from(destination);
    if destination.exists() {
        return Err("Restore requires a new, nonexistent workspace folder".into());
    }
    let staged = stage(
        destination.parent().ok_or("Choose a destination parent")?,
        true,
    )?;
    let mut w = Workspace::open(&staged.0)?;
    let mut bytes = 0;
    let total = m.originals.iter().map(|o| o.bytes).sum();
    for (i, o) in m.originals.iter().enumerate() {
        ctx.check()?;
        let target = original_path(&staged.0, &o.id)?;
        fs::create_dir_all(target.parent().unwrap()).map_err(error)?;
        let mut output = OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(target)
            .map_err(error)?;
        let (n, hash) = copy_hash((&mut input).take(o.bytes), &mut output, MAX_FILE, |n| {
            ctx.check()?;
            ctx.progress(
                "Restoring managed originals",
                i as u64,
                Some(m.originals.len() as u64),
                bytes + n,
                Some(total),
            );
            Ok(())
        })?;
        output.sync_all().map_err(error)?;
        if n != o.bytes || hash != o.hash {
            return Err("Archive payload integrity mismatch".into());
        }
        bytes += n;
    }
    let mut tail = [0];
    if input.read(&mut tail).map_err(error)? != 0 {
        return Err("Unexpected trailing archive data".into());
    }
    ctx.check()?;
    let tx = w.db.transaction().map_err(error)?;
    tx.execute_batch("PRAGMA defer_foreign_keys=ON")
        .map_err(error)?;
    for c in &m.collections {
        tx.execute(
            "INSERT INTO collections VALUES(?1,?2,?3,?4)",
            params![c.id, c.name, c.name.trim().to_lowercase(), c.parent],
        )
        .map_err(error)?;
    }
    for r in &m.resources {
        tx.execute(
            "INSERT INTO resources(id,title,content,revision,updated_at)VALUES(?1,?2,?3,?4,?5)",
            params![r.id, r.title, r.content.to_string(), r.revision, r.updated],
        )
        .map_err(error)?;
    }
    for (r, c) in &m.memberships {
        tx.execute("INSERT INTO memberships VALUES(?1,?2)", params![r, c])
            .map_err(error)?;
    }
    for o in &m.originals {
        insert_original(&tx, o)?;
    }
    m.organization.restore(&tx)?;
    for (k, v) in m.settings.as_object().unwrap() {
        tx.execute(
            "INSERT INTO settings VALUES(?1,?2)",
            params![k, v.to_string()],
        )
        .map_err(error)?;
    }
    tx.commit().map_err(error)?;
    let integrity: String =
        w.db.query_row("PRAGMA integrity_check", [], |r| r.get(0))
            .map_err(error)?;
    if integrity != "ok" {
        return Err("Restored database verification failed".into());
    }
    w.db.execute_batch("PRAGMA wal_checkpoint(TRUNCATE)")
        .map_err(error)?;
    drop(w);
    ctx.check()?;
    ctx.progress(
        "Restored data verified",
        m.originals.len() as u64,
        Some(m.originals.len() as u64),
        bytes,
        Some(total),
    );
    ctx.committing();
    publish_directory(&staged.0, &destination)?;
    Ok(
        json!({"path":destination,"resources":m.resources.len(),"files":m.originals.len(),"bytes":bytes}),
    )
}
fn publish_directory(source: &Path, destination: &Path) -> Result<(), String> {
    if destination.exists() {
        return Err("Destination already exists".into());
    }
    #[cfg(windows)]
    {
        use std::os::windows::ffi::OsStrExt;
        let a: Vec<u16> = source.as_os_str().encode_wide().chain(Some(0)).collect();
        let b: Vec<u16> = destination
            .as_os_str()
            .encode_wide()
            .chain(Some(0))
            .collect();
        if unsafe { windows_sys::Win32::Storage::FileSystem::MoveFileW(a.as_ptr(), b.as_ptr()) }
            == 0
        {
            return Err(error(std::io::Error::last_os_error()));
        }
        Ok(())
    }
    #[cfg(not(windows))]
    {
        fs::rename(source, destination).map_err(error)
    }
}
fn export(
    storage: &Storage,
    root: &str,
    ids: Vec<String>,
    destination: &str,
    format: &str,
    ctx: &mut Context,
) -> Result<Value, String> {
    let manifest = storage.call(root, move |w| {
        Ok(serde_json::to_value(snapshot(w, Some(&ids))?).map_err(error)?)
    })?;
    let m: Manifest = serde_json::from_value(manifest).map_err(error)?;
    let destination = PathBuf::from(destination);
    let staged = stage(destination.parent().ok_or("Choose an export parent")?, true)?;
    let mut total_bytes = 0;
    for (i, r) in m.resources.iter().enumerate() {
        ctx.check()?;
        let original = m.originals.iter().find(|o| o.id == r.id);
        let (name, data) = if format == "original" || original.is_some_and(|o| o.kind == "file") {
            let o = original
                .ok_or("This resource has no imported original; choose Markdown or text")?;
            (o.name.clone(), None)
        } else {
            (
                format!(
                    "{}.{}",
                    safe_name(&r.title),
                    if format == "text" { "txt" } else { "md" }
                ),
                Some(render(&r.content, format == "markdown")?),
            )
        };
        let name = format!("{}-{}", &r.id[..8], name);
        component(&name)?;
        let mut out = OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(staged.0.join(&name))
            .map_err(error)?;
        if let Some(data) = data {
            out.write_all(data.as_bytes()).map_err(error)?;
            total_bytes += data.len() as u64;
        } else {
            let o = original.unwrap();
            let (n, hash) = copy_hash(
                plain_file(&original_path(Path::new(root), &r.id)?)?,
                &mut out,
                MAX_FILE,
                |_| ctx.check(),
            )?;
            if n != o.bytes || hash != o.hash {
                return Err("Managed original integrity mismatch".into());
            }
            total_bytes += n;
        }
        out.sync_all().map_err(error)?;
        ctx.progress(
            "Exporting resources",
            i as u64 + 1,
            Some(m.resources.len() as u64),
            total_bytes,
            None,
        );
    }
    ctx.check()?;
    ctx.committing();
    publish_directory(&staged.0, &destination)?;
    Ok(
        json!({"path":destination,"resources":m.resources.len(),"bytes":total_bytes,"format":format}),
    )
}
fn safe_name(name: &str) -> String {
    let value: String = name
        .chars()
        .take(100)
        .map(|c| {
            if c < ' ' || "<>:\"/\\|?*".contains(c) {
                '_'
            } else {
                c
            }
        })
        .collect();
    value.trim_matches(['.', ' ']).to_string()
}
fn render(node: &Value, markdown: bool) -> Result<String, String> {
    let kind = node["type"].as_str().ok_or("Invalid editor node")?;
    let children = || -> Result<String, String> {
        Ok(node["content"]
            .as_array()
            .map(|a| {
                a.iter()
                    .map(|n| render(n, markdown))
                    .collect::<Result<Vec<_>, _>>()
            })
            .transpose()?
            .unwrap_or_default()
            .join(""))
    };
    if kind == "codeBlock" {
        let raw = node["content"]
            .as_array()
            .map(|a| {
                a.iter()
                    .map(|n| render(n, false))
                    .collect::<Result<Vec<_>, _>>()
            })
            .transpose()?
            .unwrap_or_default()
            .join("");
        if !markdown {
            return Ok(raw);
        }
        let fence = "`".repeat(
            raw.split(|c| c != '`')
                .map(str::len)
                .max()
                .unwrap_or(0)
                .max(2)
                + 1,
        );
        return Ok(format!("{fence}\n{raw}\n{fence}\n\n"));
    }
    let inner = children()?;
    Ok(match kind {
        "doc" => inner,
        "text" => {
            let mut text = node["text"].as_str().unwrap_or("").to_string();
            if markdown {
                for c in ['\\', '*', '_', '[', ']', '`'] {
                    text = text.replace(c, &format!("\\{c}"));
                }
                if let Some(marks) = node["marks"].as_array() {
                    for mark in marks {
                        text = match mark["type"].as_str() {
                            Some("bold") => format!("**{text}**"),
                            Some("italic") => format!("*{text}*"),
                            Some("strike") => format!("~~{text}~~"),
                            Some("code") => {
                                return Err(
                                    "Inline code export is not yet supported; choose plain text"
                                        .into(),
                                )
                            }
                            Some("link") => {
                                let href = mark["attrs"]["href"].as_str().unwrap_or("");
                                if href.contains(['\n', '\r', '<', '>']) {
                                    return Err("Unsupported link target".into());
                                }
                                format!("[{text}](<{href}>)")
                            }
                            _ => {
                                return Err(
                                    "Unsupported formatting for Markdown; choose plain text".into(),
                                )
                            }
                        };
                    }
                }
            }
            text
        }
        "paragraph" => format!("{inner}\n\n"),
        "heading" => format!(
            "{}{inner}\n\n",
            if markdown {
                "#".repeat(node["attrs"]["level"].as_u64().unwrap_or(1).clamp(1, 6) as usize) + " "
            } else {
                String::new()
            }
        ),
        "hardBreak" => "\n".into(),
        "horizontalRule" => "---\n\n".into(),
        "bulletList" | "orderedList" | "taskList" => inner,
        "listItem" | "taskItem" => {
            format!("{}{}\n", if markdown { "- " } else { "" }, inner.trim_end())
        }
        "blockquote" => {
            if markdown {
                inner.lines().map(|l| format!("> {l}\n")).collect()
            } else {
                inner
            }
        }
        "codeBlock" => {
            if markdown {
                let fence = "`".repeat(inner.chars().filter(|c| *c == '`').count().max(2) + 1);
                format!("{fence}\n{inner}\n{fence}\n\n")
            } else {
                inner
            }
        }
        _ => {
            return Err(format!(
                "Export does not support {kind}; original resource remains unchanged"
            ))
        }
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{domain::Request as DomainRequest, worker::Worker};
    struct Harness {
        temp: tempfile::TempDir,
        root: String,
        worker: Worker,
        service: Transfers,
    }
    impl Harness {
        fn new() -> Self {
            let temp = tempfile::tempdir().unwrap();
            let root = temp.path().join("workspace").to_string_lossy().into_owned();
            let worker = Worker::start(root.clone().into(), None).unwrap();
            let storage = worker.storage();
            storage.call(&root, |_| Ok(Value::Null)).unwrap();
            let activity =
                Activity::new(temp.path().join("activity.json"), storage.clone(), |_| {}).unwrap();
            Self {
                temp,
                root,
                worker,
                service: Transfers::new(storage, activity),
            }
        }
        fn call(&self, r: Request) -> Value {
            self.service.execute(self.root.clone(), r).unwrap()
        }
        fn task(&self, r: Request) -> crate::activity::Task {
            let id = self.call(r)["id"].as_str().unwrap().to_owned();
            for _ in 0..3000 {
                if let Some(t) = self
                    .service
                    .activity
                    .list()
                    .into_iter()
                    .find(|t| t.id == id && t.finished.is_some())
                {
                    return t;
                }
                std::thread::sleep(Duration::from_millis(5));
            }
            panic!("Task timed out")
        }
        fn review(&self, path: &Path, folder: bool) -> String {
            self.call(Request::Preview {
                paths: vec![path.to_string_lossy().into_owned()],
                folder,
                collection: None,
            })["token"]
                .as_str()
                .unwrap()
                .into()
        }
    }
    impl Drop for Harness {
        fn drop(&mut self) {
            self.service.activity.shutdown();
            self.worker.stop();
        }
    }
    #[test]
    fn lifecycle_archive_and_cleanup_preserve_source_and_restore_metadata() {
        let h = Harness::new();
        let source = h.temp.path().join("original.bin");
        fs::write(&source, [0, 1, 255, 7]).unwrap();
        let token = h.review(&source, false);
        assert_eq!(
            h.task(Request::Import {
                token,
                separate: false
            })
            .state,
            "completed"
        );
        let id = h
            .service
            .storage
            .call(&h.root, |w| {
                let id: String =
                    w.db.query_row("SELECT id FROM resources", [], |r| r.get(0))
                        .unwrap();
                let tag = w.organization(crate::organization::Request::Tag {
                    id: None,
                    name: "Retained".into(),
                    color: "#112233".into(),
                })?["id"]
                    .as_str()
                    .unwrap()
                    .to_string();
                w.organization(crate::organization::Request::Tagging {
                    ids: vec![id.clone()],
                    tag,
                    add: true,
                })?;
                w.organization(crate::organization::Request::Pin {
                    ids: vec![id.clone()],
                    value: true,
                })?;
                w.organization(crate::organization::Request::Trash {
                    ids: vec![id.clone()],
                    restore: false,
                })?;
                Ok(json!(id))
            })
            .unwrap()
            .as_str()
            .unwrap()
            .to_string();
        let archive = h.temp.path().join("lifecycle.vaultor");
        assert_eq!(
            h.task(Request::Archive {
                destination: archive.to_string_lossy().into_owned()
            })
            .state,
            "completed"
        );
        let (m, hash) = inspect_archive(&archive, None).unwrap();
        assert_eq!(m.organization.tags.len(), 1);
        assert_eq!(m.organization.states[0].1, true);
        let restored = h.temp.path().join("restored");
        assert_eq!(
            h.task(Request::Restore {
                source: archive.to_string_lossy().into_owned(),
                destination: restored.to_string_lossy().into_owned(),
                manifest_hash: hash
            })
            .state,
            "completed"
        );
        let purge = h.task(Request::Purge { ids: None });
        assert_eq!(purge.state, "completed");
        assert_eq!(purge.result.unwrap()["deleted"], 1);
        assert!(!original_path(Path::new(&h.root), &id).unwrap().exists());
        assert_eq!(fs::read(source).unwrap(), [0, 1, 255, 7]);
        let mut restored = Workspace::open(&restored).unwrap();
        assert_eq!(
            restored
                .organization(crate::organization::Request::Tags {
                    query: "Retained".into(),
                    after: None
                })
                .unwrap()["items"][0]["count"],
            0
        );
        assert!(original_path(&restored.root, &id).unwrap().exists());
        restored
            .organization(crate::organization::Request::Trash {
                ids: vec![id],
                restore: true,
            })
            .unwrap();
    }
    #[test]
    fn managed_import_duplicates_hierarchy_and_archive_roundtrip() {
        let h = Harness::new();
        let source = h.temp.path().join("source");
        fs::create_dir_all(source.join("Nested/Empty")).unwrap();
        let md = b"# Imported\r\n\r\nBody preserved.\r\n";
        fs::write(source.join("Nested/Note.md"), md).unwrap();
        let binary = vec![0, 1, 2, 255, 0, 17];
        fs::write(source.join("original.bin"), &binary).unwrap();
        let token = h.review(&source, true);
        let task = h.task(Request::Import {
            token,
            separate: false,
        });
        assert_eq!(task.state, "completed", "{:?}", task.error);
        assert_eq!(task.result.unwrap()["imported"], 2);
        assert_eq!(fs::read(source.join("Nested/Note.md")).unwrap(), md);
        let token = h.review(&source, true);
        let task = h.task(Request::Import {
            token,
            separate: false,
        });
        assert_eq!(task.result.unwrap()["skipped"], 2);
        let snapshot_value = h
            .service
            .storage
            .call(&h.root, |w| {
                w.execute(crate::domain::Request::Setting{key:"session".into(),value:json!({"version":1,"documents":[]})})?;
                Ok(serde_json::to_value(snapshot(w, None)?).unwrap())
            })
            .unwrap();
        let m: Manifest = serde_json::from_value(snapshot_value).unwrap();
        assert!(m.settings.get("session").is_none(),"Portable archives exclude local session metadata");
        assert_eq!(m.collections.len(), 3);
        assert_eq!(m.resources.len(), 2);
        assert_eq!(m.originals.iter().filter(|o| o.kind == "file").count(), 1);
        assert!(m
            .resources
            .iter()
            .any(|r| r.content.to_string().contains("Body preserved")));
        let output = h.temp.path().join("sample.vaultor");
        let task = h.task(Request::Archive {
            destination: output.to_string_lossy().into_owned(),
        });
        assert_eq!(task.state, "completed", "{:?}", task.error);
        let preview = h.call(Request::InspectArchive {
            source: output.to_string_lossy().into_owned(),
        });
        let destination = h.temp.path().join("restored");
        let task = h.task(Request::Restore {
            source: output.to_string_lossy().into_owned(),
            destination: destination.to_string_lossy().into_owned(),
            manifest_hash: preview["manifestHash"].as_str().unwrap().into(),
        });
        assert_eq!(task.state, "completed", "{:?}", task.error);
        let mut restored = Workspace::open(&destination).unwrap();
        let restored_manifest = snapshot(&mut restored, None).unwrap();
        assert_eq!(restored_manifest.resources.len(), 2);
        assert_eq!(restored_manifest.memberships.len(), 2);
        for o in &restored_manifest.originals {
            assert_eq!(
                copy_hash(
                    plain_file(&original_path(&destination, &o.id).unwrap()).unwrap(),
                    std::io::sink(),
                    MAX_FILE,
                    |_| Ok(())
                )
                .unwrap()
                .1,
                o.hash
            );
        }
        let existing = h.task(Request::Archive {
            destination: output.to_string_lossy().into_owned(),
        });
        assert_eq!(existing.state, "failed");
        assert!(inspect_archive(&output, None).is_ok());
        let id = m
            .resources
            .iter()
            .find(|r| m.originals.iter().any(|o| o.id == r.id && o.kind == "file"))
            .unwrap()
            .id
            .clone();
        let task = h.task(Request::Export {
            ids: vec![id],
            destination: h
                .temp
                .path()
                .join("exported")
                .to_string_lossy()
                .into_owned(),
            format: "original".into(),
        });
        assert_eq!(task.state, "completed");
        let path = fs::read_dir(h.temp.path().join("exported"))
            .unwrap()
            .next()
            .unwrap()
            .unwrap()
            .path();
        assert_eq!(fs::read(path).unwrap(), binary);
    }
    #[test]
    fn corrupt_unsafe_archive_and_changed_source_do_not_publish() {
        let h = Harness::new();
        let source = h.temp.path().join("note.txt");
        fs::write(&source, "reviewed").unwrap();
        let token = h.review(&source, false);
        fs::write(&source, "changed").unwrap();
        let task = h.task(Request::Import {
            token,
            separate: false,
        });
        assert_eq!(task.result.unwrap()["imported"], 0);
        assert_eq!(fs::read_to_string(&source).unwrap(), "changed");
        let mut m = Manifest {
            format: "vaultor-next-portable".into(),
            version: 2,
            resources: vec![],
            collections: vec![],
            memberships: vec![],
            originals: vec![],
            settings: json!({}),
            organization: Default::default(),
        };
        let id = Uuid::new_v4().to_string();
        m.resources.push(Resource {
            id: id.clone(),
            title: "Unsafe".into(),
            content: json!({"type":"doc","content":[]}),
            revision: 1,
            updated: "now".into(),
        });
        m.originals.push(Original {
            id,
            name: "../escape".into(),
            hash: "0".repeat(64),
            bytes: 0,
            kind: "file".into(),
            provenance: "test".into(),
        });
        assert!(validate(&m).is_err());
        let forged = h.temp.path().join("unsafe.vaultor");
        let raw = serde_json::to_vec(&m).unwrap();
        let mut archive_bytes = MAGIC.to_vec();
        archive_bytes.extend_from_slice(&(raw.len() as u64).to_le_bytes());
        archive_bytes.extend_from_slice(&Sha256::digest(&raw));
        archive_bytes.extend(raw);
        fs::write(&forged, archive_bytes).unwrap();
        assert!(inspect_archive(&forged, None).is_err());
        let destination = h.temp.path().join("never-published");
        let task = h.task(Request::Restore {
            source: forged.to_string_lossy().into_owned(),
            destination: destination.to_string_lossy().into_owned(),
            manifest_hash: "unused".into(),
        });
        assert_eq!(task.state, "failed");
        assert!(!destination.exists());
        let archive = h.temp.path().join("bad.vaultor");
        fs::write(&archive, b"VAULTOR1broken").unwrap();
        assert!(h
            .service
            .execute(
                h.root.clone(),
                Request::InspectArchive {
                    source: archive.to_string_lossy().into_owned()
                }
            )
            .is_err());
        assert!(!h.temp.path().join("escape").exists());
        let archive = h.temp.path().join("good.vaultor");
        assert_eq!(
            h.task(Request::Archive {
                destination: archive.to_string_lossy().into_owned()
            })
            .state,
            "completed"
        );
        let mut bytes = fs::read(&archive).unwrap();
        bytes[48] ^= 1;
        fs::write(&archive, bytes).unwrap();
        assert!(inspect_archive(&archive, None).is_err());
        assert!(!fs::read_dir(h.temp.path()).unwrap().any(|e| e
            .unwrap()
            .file_name()
            .to_string_lossy()
            .starts_with(".vaultor-stage-")));
    }
    #[test]
    fn task_cancellation_history_and_recovery_barrier() {
        let h = Harness::new();
        let source = h.temp.path().join("many");
        fs::create_dir(&source).unwrap();
        for i in 0..100 {
            fs::write(source.join(format!("{i}.txt")), "Durable source").unwrap();
        }
        let token = h.review(&source, true);
        let id = h.call(Request::Import {
            token,
            separate: false,
        })["id"]
            .as_str()
            .unwrap()
            .to_string();
        h.service.activity.cancel(&id).unwrap();
        h.service.activity.shutdown();
        let task = h
            .service
            .activity
            .list()
            .into_iter()
            .find(|t| t.id == id)
            .unwrap();
        assert_eq!(task.state, "cancelled");
        assert_eq!(
            fs::read_to_string(source.join("0.txt")).unwrap(),
            "Durable source"
        );
        let data: Vec<crate::activity::Task> =
            serde_json::from_slice(&fs::read(h.temp.path().join("activity.json")).unwrap())
                .unwrap();
        assert_eq!(data[0].state, "cancelled");
        let storage = h.worker.storage();
        storage
            .call(&h.root, |w| {
                let n = w.execute(DomainRequest::CreateNote {
                    title: "Pending".into(),
                    collection: None,
                })?;
                w.execute(DomainRequest::Draft {
                    id: n["id"].as_str().unwrap().into(),
                    base_revision: 1,
                    token: "test".into(),
                    sequence: 1,
                    title: "Pending".into(),
                    content: json!({"type":"doc","content":[]}),
                })?;
                assert!(snapshot(w, None).unwrap_err().contains("Resolve"));
                Ok(Value::Null)
            })
            .unwrap();
    }
    #[test]
    fn interrupted_history_is_bounded_and_never_replays() {
        let h = Harness::new();
        let source = h.temp.path().join("one.txt");
        fs::write(&source, "hello").unwrap();
        let token = h.review(&source, false);
        let task = h.task(Request::Import {
            token,
            separate: false,
        });
        let mut interrupted = task;
        interrupted.state = "running".into();
        interrupted.finished = None;
        let path = h.temp.path().join("interrupted.json");
        fs::write(&path, serde_json::to_vec(&vec![interrupted; 70]).unwrap()).unwrap();
        h.service.activity.shutdown();
        let engine = Activity::new(path, h.worker.storage(), |_| {}).unwrap();
        assert_eq!(engine.list().len(), 64);
        assert!(engine
            .list()
            .iter()
            .all(|t| t.state == "interrupted" && !t.cancellable));
        assert_eq!(
            h.worker
                .storage()
                .active
                .load(std::sync::atomic::Ordering::SeqCst),
            0
        );
        engine.shutdown();
    }
}

fn purge(
    storage: &Storage,
    root: &str,
    ids: Option<Vec<String>>,
    ctx: &mut Context,
) -> Result<Value, String> {
    let candidates = storage.call(root, move |w| {
        let mut q = w
            .db
            .prepare("SELECT resource_id FROM resource_state WHERE trashed=1 ORDER BY resource_id")
            .map_err(error)?;
        let all = q
            .query_map([], |r| r.get::<_, String>(0))
            .map_err(error)?
            .collect::<Result<Vec<_>, _>>()
            .map_err(error)?;
        Ok(json!(all
            .into_iter()
            .filter(|id| ids.as_ref().is_none_or(|ids| ids.contains(id)))
            .collect::<Vec<_>>()))
    })?;
    let ids = candidates.as_array().unwrap();
    let mut removed = 0;
    let mut issues = vec![];
    for (index, id) in ids.iter().enumerate() {
        ctx.check()?;
        let id = id.as_str().unwrap().to_string();
        let owned = id.clone();
        match storage.call(root, move |w| w.purge_one(&owned)) {
            Ok(_) => removed += 1,
            Err(e) => issues.push(format!("{id}: {e}")),
        };
        ctx.progress(
            "Deleting eligible managed resources",
            (index + 1) as u64,
            Some(ids.len() as u64),
            0,
            None,
        );
    }
    // Only UUID paths positively recorded in our committed cleanup journal are eligible.
    let pending = storage.call(root, |w| {
        let mut q =
            w.db.prepare("SELECT id FROM pending_deletions LIMIT 20000")
                .map_err(error)?;
        let values = q
            .query_map([], |r| r.get::<_, String>(0))
            .map_err(error)?
            .collect::<Result<Vec<_>, _>>()
            .map_err(error)?;
        Ok(json!(values))
    })?;
    for id in pending.as_array().unwrap() {
        ctx.check()?;
        let id = id.as_str().unwrap().to_string();
        let path = original_path(Path::new(root), &id)?;
        match fs::symlink_metadata(&path) {
            Ok(m) => {
                if reparse(&m) || !m.is_file() {
                    issues.push(format!("{id}: unsafe file cleanup refused"));
                    continue;
                }
                if let Err(e) = fs::remove_file(&path) {
                    issues.push(format!("{id}: {e}"));
                    continue;
                }
            }
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
            Err(e) => {
                issues.push(format!("{id}: {e}"));
                continue;
            }
        }
        storage.call(root, move |w| {
            w.db.execute("DELETE FROM pending_deletions WHERE id=?1", [id])
                .map_err(error)?;
            Ok(Value::Null)
        })?;
    }
    Ok(
        json!({"deleted":removed,"protectedOrFailed":issues.len(),"issues":issues,"partial":!issues.is_empty()}),
    )
}
