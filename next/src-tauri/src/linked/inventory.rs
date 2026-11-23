use super::native;
use crate::{
    activity::Context,
    domain::{error, Workspace},
    worker::Storage,
};
use pulldown_cmark::{Event, Options, Parser, Tag};
use rusqlite::{params, OptionalExtension};
use serde_json::{json, Value};
use std::{
    fs,
    os::windows::fs::MetadataExt,
    path::{Path, PathBuf},
};
use uuid::Uuid;

static INDEX_READS: std::sync::Mutex<()> = std::sync::Mutex::new(());
const MAX_ENTRIES: usize = 20_000;
const MAX_INDEX_BYTES: usize = 256 * 1024;
const SOURCE_INDEX_BYTES: i64 = 16 * 1024 * 1024;

pub(super) fn is_markdown(path: &Path) -> bool {
    path.extension()
        .and_then(|ext| ext.to_str())
        .is_some_and(|ext| ext.eq_ignore_ascii_case("md") || ext.eq_ignore_ascii_case("markdown"))
}

pub(super) fn is_pdf(path: &Path) -> bool {
    path.extension().and_then(|ext| ext.to_str()).is_some_and(|ext| ext.eq_ignore_ascii_case("pdf"))
}

pub(super) fn is_indexable(path: &Path) -> bool {
    is_markdown(path) || is_pdf(path)
}

fn relative_path(root: &Path, file: &native::ReadFile) -> Result<String, String> {
    let canonical = native::physical(&file.file)?;
    Ok(canonical
        .strip_prefix(root)
        .map_err(|_| "File is outside the pinned source")?
        .to_str()
        .ok_or("Non-Unicode file path")?
        .replace('\\', "/"))
}

pub(super) fn path_key(root: &Path, file: &native::ReadFile) -> Result<String, String> {
    Ok(relative_path(root, file)?.to_lowercase())
}

// Withdraw a superseded PDF body before the slower parser starts. Cancellation
// can leave a title-only result, but can never restore the superseded body.
fn withdraw_changed_pdf(
    storage: &Storage, workspace: &str, source: &str, grant: &Value, path: &str,
    file: &native::ReadFile,
) -> Result<(), String> {
    let (source, grant, path, identity, revision, birth) = (
        source.to_owned(), grant.clone(), path.to_owned(), file.id.clone(),
        file.revision.clone(), native::birth(&file.file)?,
    );
    storage.call(workspace, move |w| {
        if w.linked_grant(&source)? != grant {
            return Err("Linked source authorization changed".into());
        }
        let tx = w.db.transaction().map_err(error)?;
        let prior = "SELECT d.id FROM linked_documents d JOIN linked_inventory i ON i.document_id=d.id
            WHERE d.source_id=?1 AND i.indexed_revision<>'' AND
            (d.path_key=lower(?2) OR (d.identity=?3 AND i.birth=?5)) AND
            (d.path<>?2 OR d.identity<>?3 OR i.indexed_revision<>?4 OR i.birth<>?5)";
        tx.execute(
            &format!("UPDATE note_search SET body='' WHERE rowid IN
                (SELECT seq FROM resources WHERE substr(id,8) IN ({prior}) AND id LIKE 'linked:%')"),
            params![source,path,identity,revision,birth],
        ).map_err(error)?;
        let changed = tx.execute(
            &format!("UPDATE linked_inventory SET indexed_revision='',indexed_bytes=0 WHERE document_id IN ({prior})"),
            params![source,path,identity,revision,birth],
        ).map_err(error)?;
        if changed>0 { tx.execute("UPDATE search_generation SET value=value+1", []).map_err(error)?; }
        tx.commit().map_err(error)?;
        Ok(Value::Null)
    })?;
    Ok(())
}

#[derive(Default)]
pub(super) struct Extract {
    body: String,
    links: Vec<String>,
}

fn extract(file: &native::ReadFile, cancelled: impl Fn() -> bool) -> Extract {
    let mut result = Extract::default();
    if is_pdf(&file.path) {
        result.body = crate::pdf_text::extract(&file.bytes, cancelled).1.unwrap_or_default();
        return result;
    }
    if file.bytes.len() > MAX_INDEX_BYTES {
        return result;
    }
    let source = std::str::from_utf8(&file.bytes).expect("native read verified UTF-8");
    let mut link_bytes = 0;
    for event in Parser::new_ext(source, Options::ENABLE_TABLES | Options::ENABLE_TASKLISTS) {
        match event {
            Event::Text(text) | Event::Code(text) => {
                result.body.push_str(&text);
                result.body.push(' ');
            }
            Event::Start(Tag::Link { dest_url, .. })
                if result.links.len() < 2000
                    && dest_url.len() <= 4096
                    && link_bytes + dest_url.len() <= 64 * 1024 =>
            {
                link_bytes += dest_url.len();
                result.links.push(dest_url.into_string());
            }
            _ => {}
        }
    }
    result
}

/// Normalize within the originating grant. Empty paths refer to the originating file.
pub(super) fn relative_target(path: &str, href: &str) -> Result<String, String> {
    let raw = href.split('#').next().unwrap_or("");
    let decoded = percent_encoding::percent_decode_str(raw)
        .decode_utf8()
        .map_err(error)?;
    if decoded.contains([':', '\0', '?']) || decoded.starts_with(['\\', '/']) {
        return Err("Only relative links within the originating source are enabled".into());
    }
    if decoded.is_empty() {
        return Ok(path.into());
    }
    let mut target: Vec<_> = path.split('/').collect();
    target.pop();
    let normalized = decoded.replace('\\', "/");
    for part in normalized.split('/') {
        match part {
            "" | "." => {}
            ".." => {
                target.pop().ok_or("Link escapes the registered source")?;
            }
            part => target.push(part),
        }
    }
    let target = target.join("/");
    native::relative(&target)?;
    Ok(target)
}

impl Workspace {
    pub(super) fn linked_grant(&self, source: &str) -> Result<Value, String> {
        let (root, identity) = self.linked_root(source)?;
        let epoch: Option<String> = self
            .db
            .query_row(
                "SELECT epoch FROM linked_grants WHERE source_id=?1",
                [source],
                |r| r.get(0),
            )
            .optional()
            .map_err(error)?;
        Ok(json!([root, identity, epoch]))
    }

    pub(super) fn linked_relationships(&self, id: &str) -> Result<Value, String> {
        let resource = format!("linked:{id}");
        let (source, path, _, _) = self.linked_location(id)?;
        let file = self.linked_read_indexable(id)?;
        self.confirm_linked_identity(id, &file)?;
        let mut outgoing = self.db.prepare(
            "SELECT ref.path_key,r.id,r.title,ref.occurrences FROM linked_references ref
             LEFT JOIN linked_documents d ON d.source_id=?2 AND d.path_key=ref.path_key AND d.id IN
               (SELECT i.document_id FROM linked_inventory i JOIN visible_resources v ON v.id=i.resource_id)
             LEFT JOIN visible_resources r ON r.id='linked:'||d.id
             WHERE ref.document_id=?1 ORDER BY ref.path_key LIMIT 100").map_err(error)?;
        let outgoing = outgoing
            .query_map(params![id, source], |r| {
                Ok(json!({
                    "path":r.get::<_,String>(0)?, "id":r.get::<_,Option<String>>(1)?,
                    "title":r.get::<_,Option<String>>(2)?, "occurrences":r.get::<_,i64>(3)?
                }))
            })
            .map_err(error)?
            .collect::<Result<Vec<_>, _>>()
            .map_err(error)?;
        let mut incoming = self.db.prepare(
            "SELECT r.id,r.title,ref.occurrences FROM linked_references ref
             JOIN linked_documents d ON d.id=ref.document_id JOIN visible_resources r ON r.id='linked:'||d.id
             WHERE d.source_id=?1 AND ref.path_key=?2
             UNION ALL SELECT r.id,r.title,1 FROM resource_links l JOIN visible_resources r ON r.id=l.source_id
             WHERE l.target_id=?3 ORDER BY 2,1 LIMIT 100").map_err(error)?;
        let incoming = incoming.query_map(params![source,path.to_lowercase(),resource], |r| Ok(json!({
            "id":r.get::<_,String>(0)?, "title":r.get::<_,String>(1)?, "occurrences":r.get::<_,i64>(2)?
        }))).map_err(error)?.collect::<Result<Vec<_>,_>>().map_err(error)?;
        Ok(json!({"incoming":incoming,"outgoing":outgoing}))
    }

    pub(super) fn confirm_linked_identity(
        &self,
        id: &str,
        file: &native::ReadFile,
    ) -> Result<(), String> {
        let (_, _, identity, revision) = self.linked_location(id)?;
        let birth: Option<String> = self
            .db
            .query_row(
                "SELECT birth FROM linked_inventory WHERE document_id=?1",
                [id],
                |r| r.get(0),
            )
            .optional()
            .map_err(error)?;
        if file.id != identity
            || match birth {
                Some(birth) => birth != native::birth(&file.file)?,
                None => file.revision != revision,
            }
        {
            return Err(
                "Linked file identity changed; the original and any draft remain separate".into(),
            );
        }
        Ok(())
    }

    pub(super) fn observe_linked(
        &mut self,
        source: &str,
        root: &Path,
        file: &native::ReadFile,
        index: Option<(&str, Option<Extract>)>,
    ) -> Result<String, String> {
        let path = relative_path(root, file)?;
        let key = path.to_lowercase();
        let birth = native::birth(&file.file)?;
        let title = Path::new(&path)
            .file_name()
            .and_then(|name| name.to_str())
            .ok_or("Missing filename")?;
        let (_, expected_root) = self.linked_root(source)?;
        if native::identity(
            file.pins
                .iter()
                .find(|pin| native::physical(pin).is_ok_and(|p| p == root))
                .ok_or("Source changed during observation")?,
        )? != expected_root
        {
            return Err("Source authorization changed".into());
        }
        let tx = self.db.transaction().map_err(error)?;
        let mut matches = tx.prepare(
            "SELECT d.id,d.path,i.indexed_revision FROM linked_documents d LEFT JOIN linked_inventory i ON i.document_id=d.id
             WHERE d.source_id=?1 AND d.identity=?2 AND (i.birth=?3 OR (i.birth IS NULL AND d.path_key=?4 AND d.revision=?5)) LIMIT 2")
            .map_err(error)?;
        let known = matches
            .query_map(params![source, file.id, birth, key, file.revision], |r| {
                Ok((
                    r.get::<_, String>(0)?,
                    r.get::<_, String>(1)?,
                    r.get::<_, Option<String>>(2)?,
                ))
            })
            .map_err(error)?
            .collect::<Result<Vec<_>, _>>()
            .map_err(error)?;
        drop(matches);
        if known.len() > 1 {
            return Err("Multiple linked records match this file. Existing organization and drafts were retained".into());
        }
        let (id, previous_path, indexed) = known
            .into_iter()
            .next()
            .unwrap_or_else(|| (Uuid::new_v4().to_string(), String::new(), None));
        let pending: bool = tx
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM linked_saves s JOIN linked_documents d ON d.id=s.id
             WHERE d.source_id=?1 AND (d.id=?2 OR d.path_key=?3))",
                params![source, id, key],
                |r| r.get(0),
            )
            .map_err(error)?;
        if pending {
            return Err("Resolve pending linked publication before reconciling this path".into());
        }
        // Multiple hard links do not provide evidence that the original path moved.
        if native::info(&file.file)?.nNumberOfLinks != 1
            && previous_path != path
            && !previous_path.is_empty()
        {
            return Err("Hard-linked file aliases cannot establish rename continuity".into());
        }
        tx.execute("INSERT INTO linked_documents VALUES(?1,?2,?3,?4,?5,?6)
            ON CONFLICT(id) DO UPDATE SET path=excluded.path,path_key=excluded.path_key WHERE path<>excluded.path",
            params![id,source,path,key,file.id,file.revision]).map_err(error)?;
        let resource = format!("linked:{id}");
        tx.execute("INSERT INTO resources(id,title,content) VALUES(?1,?2,'{}')
            ON CONFLICT(id) DO UPDATE SET title=excluded.title,revision=revision+1 WHERE title<>excluded.title",
            params![resource,title]).map_err(error)?;
        tx.execute("INSERT INTO linked_inventory(resource_id,document_id,birth,available) VALUES(?1,?2,?3,1)
            ON CONFLICT(document_id) DO UPDATE SET available=1 WHERE available=0",
            params![resource,id,birth]).map_err(error)?;
        // Same-path replacement has its own identity. Withdraw the previous search result and edges.
        tx.execute("UPDATE linked_inventory SET available=0 WHERE document_id IN
            (SELECT id FROM linked_documents WHERE source_id=?1 AND path_key=?2 AND id<>?3) AND available=1",
            params![source,key,id]).map_err(error)?;
        if let Some((scan, extracted)) = index {
            tx.execute(
                "UPDATE linked_inventory SET scan=?2 WHERE document_id=?1",
                params![id, scan],
            )
            .map_err(error)?;
            if indexed.as_deref() != Some(&file.revision) || previous_path != path {
                let mut extracted =
                    extracted.ok_or("Linked identity changed during indexing; refresh again")?;
                let (used, previous): (i64, i64) = tx.query_row(
                    "SELECT COALESCE((SELECT bytes FROM linked_index_usage WHERE source_id=?1),0),indexed_bytes
                     FROM linked_inventory WHERE document_id=?2",params![source,id],|r|Ok((r.get(0)?,r.get(1)?))).map_err(error)?;
                let extracted_bytes = (extracted.body.len()
                    + extracted
                        .links
                        .iter()
                        .map(|href| href.len() + 32)
                        .sum::<usize>()) as i64;
                let admitted = used - previous + extracted_bytes <= SOURCE_INDEX_BYTES;
                if !admitted {
                    extracted = Extract::default();
                }
                let display_root: String = tx
                    .query_row(
                        "SELECT display_path FROM linked_sources WHERE id=?1",
                        [source],
                        |r| r.get(0),
                    )
                    .map_err(error)?;
                let source_name = display_root
                    .split(['/', '\\'])
                    .filter(|part| !part.is_empty())
                    .next_back()
                    .unwrap_or("");
                tx.execute("UPDATE note_search SET title=?2,body=?3 WHERE rowid=(SELECT seq FROM resources WHERE id=?1)",
                    params![resource,format!("{path} {source_name}"),extracted.body]).map_err(error)?;
                tx.execute("DELETE FROM linked_references WHERE document_id=?1", [&id])
                    .map_err(error)?;
                for href in extracted.links {
                    if let Ok(target) = relative_target(&path, &href) {
                        tx.execute("INSERT INTO linked_references VALUES(?1,?2,1)
                            ON CONFLICT(document_id,path_key) DO UPDATE SET occurrences=occurrences+1",
                            params![id,target.to_lowercase()]).map_err(error)?;
                    }
                }
                tx.execute(
                    "UPDATE linked_inventory SET indexed_revision=?2,indexed_bytes=?3 WHERE document_id=?1",
                    params![id,if admitted {file.revision.as_str()} else {""},if admitted {extracted_bytes} else {0}],
                )
                .map_err(error)?;
                tx.execute("UPDATE search_generation SET value=value+1", [])
                    .map_err(error)?;
            }
        } else if indexed
            .as_deref()
            .is_some_and(|rev| !rev.is_empty() && (rev != file.revision || previous_path != path))
        {
            tx.execute("UPDATE note_search SET title=?2,body='' WHERE rowid=(SELECT seq FROM resources WHERE id=?1)",params![resource,path]).map_err(error)?;
            tx.execute("DELETE FROM linked_references WHERE document_id=?1", [&id])
                .map_err(error)?;
            tx.execute(
                "UPDATE linked_inventory SET indexed_revision='',indexed_bytes=0 WHERE document_id=?1",
                [&id],
            )
            .map_err(error)?;
            tx.execute("UPDATE search_generation SET value=value+1", [])
                .map_err(error)?;
        }
        if is_pdf(Path::new(&path)) {
            tx.execute("UPDATE linked_documents SET revision=?2 WHERE id=?1 AND revision<>?2", params![id,file.revision]).map_err(error)?;
        }
        tx.commit().map_err(error)?;
        Ok(id)
    }
}

pub fn index(
    storage: &Storage,
    ctx: &mut Context<'_>,
    workspace: &str,
    source: String,
) -> Result<Value, String> {
    let _scan = INDEX_READS.lock().map_err(error)?;
    ctx.check()?;
    let id = source.clone();
    let grant = storage.call(workspace, move |w| w.linked_grant(&id))?;
    let (root, identity, _): (PathBuf, String, Option<String>) =
        serde_json::from_value(grant.clone()).map_err(error)?;
    if !native::pin(&root)
        .and_then(|pins| native::identity(pins.last().unwrap()))
        .is_ok_and(|id| id == identity)
    {
        return storage.call(workspace, move |w| {
            if w.linked_grant(&source)? != grant {
                return Err("Source authorization changed".into());
            }
            w.db.execute(
                "UPDATE linked_inventory SET available=0 WHERE available=1 AND document_id IN
                (SELECT id FROM linked_documents WHERE source_id=?1)",
                [source],
            )
            .map_err(error)?;
            Err("Linked folder unavailable. Restore the folder or authorize it again.".into())
        });
    }
    let cache_source = source.clone();
    let cached = storage.call(workspace, move |w| {
        let mut q = w.db.prepare("SELECT d.path_key,i.indexed_revision||':'||d.identity||':'||i.birth||':'||d.path FROM linked_inventory i JOIN linked_documents d ON d.id=i.document_id
            WHERE d.source_id=?1 AND i.available=1 ORDER BY d.path_key LIMIT 20000").map_err(error)?;
        let cached = q.query_map([cache_source], |r|Ok((r.get::<_,String>(0)?,r.get::<_,String>(1)?)))
            .map_err(error)?.collect::<Result<std::collections::HashMap<_,_>,_>>().map_err(error)?;
        Ok(json!(cached))
    })?;
    let scan = Uuid::new_v4().to_string();
    let mut directories = vec![PathBuf::new()];
    let (mut visited, mut indexed, mut skipped) = (0, 0, 0);
    while let Some(relative) = directories.pop() {
        ctx.check()?;
        let pins = native::pin(&root.join(&relative))?;
        if !pins.iter().any(|pin| {
            native::physical(pin).is_ok_and(|p| p == root)
                && native::identity(pin).is_ok_and(|id| id == identity)
        }) {
            return Err("Linked source was replaced".into());
        }
        let directory = native::physical(pins.last().unwrap())?;
        for entry in fs::read_dir(directory).map_err(error)? {
            ctx.check()?;
            visited += 1;
            if visited > MAX_ENTRIES {
                return Err("Index stopped at 20,000 entries; select a narrower folder".into());
            }
            let entry = entry.map_err(error)?;
            let name = entry
                .file_name()
                .into_string()
                .map_err(|_| "Non-Unicode linked entry")?;
            if name == ".git" || name.starts_with(".vaultor-") {
                continue;
            }
            let meta = fs::symlink_metadata(entry.path()).map_err(error)?;
            if meta.file_attributes() & 0x400 != 0 {
                continue;
            }
            let child = relative.join(name);
            if meta.is_dir() {
                directories.push(child);
            } else if is_indexable(&child) {
                if is_pdf(&child) && grant[2].is_null() {
                    skipped += 1;
                    continue;
                }
                let Ok(file) = native::read_indexable(&root, &identity, &child.to_string_lossy())
                else {
                    skipped += 1;
                    continue;
                };
                let path = relative_path(&root, &file)?;
                let key = path.to_lowercase();
                let fingerprint = format!(
                    "{}:{}:{}:{}",
                    file.revision,
                    file.id,
                    native::birth(&file.file)?,
                    path
                );
                let extracted = if cached[&key].as_str() != Some(&fingerprint) {
                    if is_pdf(&child) {
                        withdraw_changed_pdf(storage, workspace, &source, &grant, &path, &file)?;
                    }
                    Some(extract(&file, || ctx.check().is_err()))
                } else {
                    None
                };
                ctx.check()?;
                let (source, root, scan, grant) =
                    (source.clone(), root.clone(), scan.clone(), grant.clone());
                let observed = storage.call(workspace, move |w| {
                    if w.linked_grant(&source)? != grant {
                        return Err("Source authorization changed".into());
                    }
                    w.observe_linked(&source, &root, &file, Some((&scan, extracted)))?;
                    Ok(Value::Null)
                });
                match observed {
                    Ok(_) => indexed += 1,
                    Err(err)
                        if err.contains("pending linked publication")
                            || err.contains("rename continuity") =>
                    {
                        skipped += 1
                    }
                    Err(err) => return Err(err),
                }
                if (indexed + skipped) % 32 == 0 {
                    ctx.progress("Indexing linked files", indexed, None, 0, None);
                }
            }
        }
    }
    ctx.check()?;
    storage.call(workspace, move |w| {
        if w.linked_grant(&source)? != grant {
            return Err("Source authorization changed".into());
        }
        let tx = w.db.transaction().map_err(error)?;
        tx.execute("UPDATE linked_inventory SET available=0 WHERE scan<>?1 AND available=1 AND document_id IN
            (SELECT id FROM linked_documents WHERE source_id=?2 AND id NOT IN (SELECT id FROM linked_saves))",
            params![scan,source]).map_err(error)?;
        tx.execute("DELETE FROM linked_references WHERE document_id IN (SELECT i.document_id FROM linked_inventory i
            JOIN linked_documents d ON d.id=i.document_id WHERE d.source_id=?1 AND i.available=0 AND i.indexed_bytes>0)",[&source]).map_err(error)?;
        tx.execute("UPDATE note_search SET body='' WHERE rowid IN (SELECT r.seq FROM resources r
            JOIN linked_inventory i ON i.resource_id=r.id JOIN linked_documents d ON d.id=i.document_id
            WHERE d.source_id=?1 AND i.available=0 AND i.indexed_bytes>0)",[&source]).map_err(error)?;
        tx.execute("UPDATE linked_inventory SET indexed_revision='',indexed_bytes=0 WHERE available=0 AND indexed_bytes>0
            AND document_id IN (SELECT id FROM linked_documents WHERE source_id=?1)",[&source]).map_err(error)?;
        let covered: i64 = tx.query_row("SELECT count(*) FROM linked_inventory i JOIN linked_documents d ON d.id=i.document_id
            WHERE d.source_id=?1 AND i.available=1 AND i.indexed_revision<>''",[&source],|r|r.get(0)).map_err(error)?;
        tx.commit().map_err(error)?;
        Ok(json!({"discovered":indexed,"indexReceipts":covered,"skipped":skipped,"visited":visited}))
    })
}

/// Read one notification target under the same lease and grant used for a complete scan.
pub(super) fn reconcile_path(
    storage: &Storage,
    workspace: &str,
    source: &str,
    grant: &Value,
    path: &str,
) -> Result<bool, String> {
    let _scan = INDEX_READS.lock().map_err(error)?;
    let (root, identity, _): (PathBuf, String, Option<String>) =
        serde_json::from_value(grant.clone()).map_err(error)?;
    let relative = native::relative(path)?;
    if is_pdf(&relative) && grant[2].is_null() {
        return Ok(false);
    }
    let key = path.to_lowercase();
    let (source, grant) = (source.to_string(), grant.clone());
    match native::read_indexable(&root, &identity, path) {
        Ok(file) => {
            let id = source.clone();
            let observed_path = relative_path(&root, &file)?;
            let birth = native::birth(&file.file)?;
            let revision = file.revision.clone();
            let carrier = file.id.clone();
            let current = storage.call(workspace, move |w| {
                let fresh: bool = w.db.query_row(
                    "SELECT EXISTS(SELECT 1 FROM linked_documents d JOIN linked_inventory i ON d.id=i.document_id
                     WHERE d.source_id=?1 AND d.path=?2 AND d.identity=?3 AND i.birth=?4 AND i.indexed_revision=?5 AND i.available=1)",
                    params![id,observed_path,carrier,birth,revision],|r|r.get(0)).map_err(error)?;
                Ok(json!(fresh))
            })?.as_bool().unwrap_or(false);
            if current {
                return Ok(false);
            }
            if is_pdf(&relative) {
                withdraw_changed_pdf(storage, workspace, &source, &grant, path, &file)?;
            }
            let extracted = extract(&file, || false);
            storage.call(workspace, move |w| {
                if w.linked_grant(&source)? != grant {
                    return Err("Source authorization changed".into());
                }
                w.observe_linked(&source, &root, &file, Some(("", Some(extracted))))?;
                Ok(Value::Null)
            })?;
            Ok(true)
        }
        Err(message) => {
            let pins = native::pin(&root)?;
            if native::identity(pins.last().unwrap())? != identity {
                return Err("Source authorization changed".into());
            }
            // Sharing failures, publication gaps and reparse refusals are not reliable deletions.
            let parent = root.join(relative.parent().unwrap_or(Path::new("")));
            let parent_pins = native::pin(&parent)?;
            let parent = native::physical(parent_pins.last().unwrap())?;
            if !parent.starts_with(&root) {
                return Err("Source authorization changed".into());
            }
            match fs::symlink_metadata(parent.join(relative.file_name().ok_or("Missing filename")?))
            {
                Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
                _ => return Err(message),
            }
            let result = storage.call(workspace, move |w| {
                if w.linked_grant(&source)? != grant { return Err("Source authorization changed".into()); }
                let tx=w.db.transaction().map_err(error)?;
                let ids = {
                    let mut q=tx.prepare("SELECT d.id FROM linked_documents d JOIN linked_inventory i ON i.document_id=d.id
                      WHERE d.source_id=?1 AND d.path_key=?2 AND i.available=1 AND d.id NOT IN (SELECT id FROM linked_saves)").map_err(error)?;
                    let rows=q.query_map(params![source,key],|r|r.get::<_,String>(0)).map_err(error)?.collect::<Result<Vec<_>,_>>().map_err(error)?;
                    rows
                };
                for id in &ids {
                    Workspace::withdraw_linked_index(&tx,id)?;
                    tx.execute("UPDATE linked_inventory SET available=0 WHERE document_id=?1",[id]).map_err(error)?;
                }
                tx.commit().map_err(error)?;
                Ok(json!(!ids.is_empty()))
            })?;
            drop((pins, parent_pins));
            Ok(result.as_bool().unwrap_or(false))
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{
        domain::Request, linked::Request as Linked, organization::Request as Org,
        search::SearchOptions,
    };

    fn text(workspace: &Workspace, value: &str, collection: Option<String>, source: &str) -> Value {
        workspace
            .search(
                SearchOptions {
                    query: value.into(),
                    content: true,
                    collection,
                    order: "title".into(),
                    view: format!("source:{source}"),
                    tag: None,
                    tags: vec![],
                    any_tag: false,
                    kind: None,
                },
                None,
                Some(100),
            )
            .unwrap()
    }

    #[test]
    fn stable_organization_index_and_revoke_keep_external_bytes() {
        let workspace = tempfile::tempdir().unwrap();
        let source_dir = tempfile::tempdir().unwrap();
        let from = source_dir.path().join("Draft.md");
        let target = source_dir.path().join("Other Note.md");
        let original = "# Heading\r\n\r\nrareword [ref][id] [again](Other%20Note.md)\r\n\r\n[id]: Other%20Note.md\r\n";
        fs::write(&from, original).unwrap();
        fs::write(&target, "otherword [self](#anchor)").unwrap();
        let mut w = Workspace::open(workspace.path()).unwrap();
        let registration = w
            .linked(Linked::Register {
                path: source_dir.path().display().to_string(),
            })
            .unwrap();
        let source = registration["id"].as_str().unwrap();
        let (root, root_id) = w.linked_root(source).unwrap();
        let observe = |w: &mut Workspace, path: &str| {
            let file = native::read(&root, &root_id, path, false).unwrap();
            let body = extract(&file, || false);
            w.observe_linked(source, &root, &file, Some(("test", Some(body))))
                .unwrap()
        };
        let doc = observe(&mut w, "Draft.md");
        let other = observe(&mut w, "Other Note.md");
        let id = format!("linked:{doc}");
        let a = w.collection(None, "A".into(), None).unwrap()["id"]
            .as_str()
            .unwrap()
            .to_string();
        let b = w.collection(None, "B".into(), None).unwrap()["id"]
            .as_str()
            .unwrap()
            .to_string();
        w.bulk_membership(vec![id.clone()], Some(a.clone()), None)
            .unwrap();
        w.bulk_membership(vec![id.clone()], Some(b.clone()), None)
            .unwrap();
        let tag = w
            .organization(Org::Tag {
                id: None,
                name: "Topic".into(),
                color: "#ffffff".into(),
            })
            .unwrap();
        w.organization(Org::Tagging {
            ids: vec![id.clone()],
            tag: tag["id"].as_str().unwrap().into(),
            add: true,
        })
        .unwrap();
        w.organization(Org::Pin {
            ids: vec![id.clone()],
            value: true,
        })
        .unwrap();
        assert_eq!(
            text(&w, "rareword", Some(a.clone()), source)["items"][0]["id"],
            id
        );
        assert_eq!(
            w.linked(Linked::Relationships { id: other.clone() })
                .unwrap()["incoming"][0]["occurrences"],
            2
        );
        assert_eq!(
            w.linked(Linked::Relationships { id: other }).unwrap()["outgoing"][0]["occurrences"],
            1
        );
        assert!(w.execute(Request::Read { id: id.clone() }).is_err());
        assert!(w
            .organization(Org::Trash {
                ids: vec![id.clone()],
                restore: false
            })
            .is_err());

        let case = source_dir.path().join("DRAFT.md");
        fs::rename(&from, &case).unwrap();
        assert_eq!(observe(&mut w, "DRAFT.md"), doc);
        assert_eq!(
            text(&w, "rareword", Some(a.clone()), source)["items"][0]["id"],
            id
        );
        fs::create_dir(source_dir.path().join("nested")).unwrap();
        let moved = source_dir.path().join("nested/Moved.md");
        fs::rename(&case, &moved).unwrap();
        fs::write(&from, "# Unrelated replacement\n").unwrap();
        assert_ne!(observe(&mut w, "Draft.md"), doc);
        assert!(w.linked(Linked::OpenId { id: doc.clone() }).is_err());
        assert_eq!(observe(&mut w, "nested/Moved.md"), doc);
        assert_eq!(
            w.linked(Linked::OpenId { id: doc.clone() }).unwrap()["path"],
            "nested/Moved.md"
        );
        assert_eq!(
            w.memberships(id.clone()).unwrap()["members"]
                .as_array()
                .unwrap()
                .len(),
            2
        );
        let plan = w
            .organization(Org::CollectionPlan { id: a.clone() })
            .unwrap()
            .to_string();
        w.organization(Org::DeleteCollection {
            id: a,
            plan,
            trash: true,
        })
        .unwrap();
        assert_eq!(fs::read_to_string(&moved).unwrap(), original);
        assert_eq!(text(&w, "rareword", Some(b.clone()), source)["total"], 1);
        w.linked(Linked::Remove {
            source: source.into(),
        })
        .unwrap();
        assert_eq!(text(&w, "rareword", Some(b.clone()), source)["total"], 0);
        assert!(w.linked(Linked::OpenId { id: doc.clone() }).is_err());
        assert_eq!(fs::read_to_string(&moved).unwrap(), original);
        w.linked(Linked::Register {
            path: source_dir.path().display().to_string(),
        })
        .unwrap();
        assert_eq!(observe(&mut w, "nested/Moved.md"), doc);
        drop(w);
        let w = Workspace::open(workspace.path()).unwrap();
        assert_eq!(text(&w, "rareword", Some(b), source)["items"][0]["id"], id);
        let metadata =
            w.db.query_row(
                "SELECT pinned, (SELECT count(*) FROM resource_tags WHERE resource_id=?1)
            FROM resource_state WHERE resource_id=?1",
                [id],
                |r| Ok((r.get::<_, bool>(0)?, r.get::<_, i64>(1)?)),
            )
            .unwrap();
        assert_eq!(metadata, (true, 1));
    }

    #[test]
    fn relative_destinations_refuse_root_escape_even_after_decoding() {
        assert_eq!(
            relative_target("nested/a.md", "../Other%20Note.md#heading").unwrap(),
            "Other Note.md"
        );
        for href in [
            "../../outside.md",
            "%2foutside.md",
            "%5coutside.md",
            "../%2e%2e/outside.md",
            "C%3a/x.md",
            "x.md%00",
        ] {
            assert!(relative_target("nested/a.md", href).is_err(), "{href}");
        }
    }

    #[test]
    fn larger_supported_document_can_save_a_bounded_source_patch() {
        let paragraph = "Ordinary prose with a stable suffix. ".repeat(40);
        let original = format!(
            "# Larger\r\n\r\nStart here.\r\n\r\n{}",
            format!("{paragraph}\r\n\r\n").repeat(700)
        );
        assert!(original.len() > 950 * 1024 && original.len() < super::super::markdown::EDIT_BYTES);
        let dir = tempfile::tempdir().unwrap();
        let workspace = tempfile::tempdir().unwrap();
        let file = dir.path().join("Larger.md");
        fs::write(&file, &original).unwrap();
        let mut w = Workspace::open(workspace.path()).unwrap();
        let source = w
            .linked(Linked::Register {
                path: dir.path().display().to_string(),
            })
            .unwrap();
        let mut doc = w
            .linked(Linked::Open {
                source: source["id"].as_str().unwrap().into(),
                path: "Larger.md".into(),
            })
            .unwrap();
        assert_eq!(doc["editable"], true);
        doc["content"]["content"][1]["content"][0]["text"] = json!("Changed here.");
        let id = doc["documentId"].as_str().unwrap().to_string();
        w.linked(Linked::Protect {
            id: id.clone(),
            revision: doc["revision"].as_str().unwrap().into(),
            base: original.clone(),
            content: doc["content"].clone(),
            token: "test".into(),
            sequence: 1,
        })
        .unwrap();
        assert_eq!(fs::read_to_string(&file).unwrap(), original);
        let saved = w
            .linked(Linked::Save {
                id: id.clone(),
                token: "test".into(),
                sequence: 1,
            })
            .unwrap();
        assert_eq!(saved["documentId"], id);
        assert_eq!(
            fs::read_to_string(file).unwrap(),
            original.replacen("Start here.", "Changed here.", 1)
        );
    }
}
