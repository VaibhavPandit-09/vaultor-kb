//! External files remain authoritative. SQLite holds registrations, identity evidence and non-authoritative drafts/intents.
pub mod markdown;
#[cfg(windows)]
pub mod native;
use crate::domain::{error, Workspace};
use rusqlite::{params, OptionalExtension};
use serde::Deserialize;
use serde_json::{json, Value};
use std::path::{Path, PathBuf};
use uuid::Uuid;
#[derive(Debug, Deserialize)]
#[serde(tag = "op", rename_all = "camelCase", deny_unknown_fields)]
pub enum Request {
    Sources,
    Web {
        url: String,
    },
    Register {
        path: String,
    },
    Remove {
        source: String,
    },
    Directory {
        source: String,
        path: String,
        after: Option<String>,
    },
    Open {
        source: String,
        path: String,
    },
    Follow {
        id: String,
        href: String,
    },
    Protect {
        id: String,
        revision: String,
        base: String,
        content: Value,
        token: String,
        sequence: i64,
    },
    Save {
        id: String,
        token: String,
        sequence: i64,
    },
    Drafts,
    Recover {
        id: String,
    },
    Discard {
        id: String,
        token: String,
        sequence: i64,
    },
    Inspect {
        id: String,
    },
    Resolve {
        id: String,
    },
}
pub fn initialize(db: &rusqlite::Connection) -> Result<(), String> {
    db.execute_batch("CREATE TABLE IF NOT EXISTS linked_sources(id TEXT PRIMARY KEY,path TEXT NOT NULL,display_path TEXT NOT NULL,identity TEXT NOT NULL,active INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS linked_documents(id TEXT PRIMARY KEY,source_id TEXT NOT NULL REFERENCES linked_sources(id),path TEXT NOT NULL,path_key TEXT NOT NULL,identity TEXT NOT NULL,revision TEXT NOT NULL,UNIQUE(source_id,path_key,identity));
 CREATE TABLE IF NOT EXISTS linked_drafts(id TEXT PRIMARY KEY REFERENCES linked_documents(id),revision TEXT NOT NULL,base TEXT NOT NULL,content TEXT NOT NULL,token TEXT NOT NULL,sequence INTEGER NOT NULL,state TEXT NOT NULL DEFAULT 'draft',last_error TEXT,updated_at TEXT NOT NULL DEFAULT(strftime('%Y-%m-%dT%H:%M:%fZ','now')));
 CREATE TABLE IF NOT EXISTS linked_saves(id TEXT PRIMARY KEY REFERENCES linked_documents(id),status TEXT NOT NULL,stage TEXT NOT NULL,capture TEXT NOT NULL,original_identity TEXT NOT NULL,original_hash TEXT NOT NULL,candidate_identity TEXT,candidate_hash TEXT NOT NULL,candidate TEXT NOT NULL,token TEXT NOT NULL,sequence INTEGER NOT NULL,error TEXT);").map_err(error)
}
#[cfg(windows)]
impl Workspace {
    fn linked_root(&self, id: &str) -> Result<(PathBuf, String), String> {
        self.db
            .query_row(
                "SELECT path,identity FROM linked_sources WHERE id=?1 AND active=1",
                [id],
                |r| Ok((PathBuf::from(r.get::<_, String>(0)?), r.get(1)?)),
            )
            .map_err(|_| {
                "Linked source is unavailable or removed; register it with the folder picker".into()
            })
    }
    fn linked_location(&self, id: &str) -> Result<(String, String, String, String), String> {
        self.db
            .query_row(
                "SELECT source_id,path,identity,revision FROM linked_documents WHERE id=?1",
                [id],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)),
            )
            .map_err(error)
    }
    fn linked_read(&self, id: &str, lease: bool) -> Result<native::ReadFile, String> {
        let (source, path, _, _) = self.linked_location(id)?;
        let (root, identity) = self.linked_root(&source)?;
        native::read(&root, &identity, &path, lease)
    }
    fn linked_response(
        &self,
        id: &str,
        base: String,
        document: Value,
        reason: Option<String>,
        draft: Option<Value>,
        current: Option<Value>,
    ) -> Result<Value, String> {
        let (source, path, identity, revision) = self.linked_location(id)?;
        let parsed = if base.len() <= 256 * 1024 {
            Some(markdown::parse(&base))
        } else {
            None
        };
        let reason = reason
            .or_else(|| parsed.as_ref().and_then(|p| p.reason.clone()))
            .or_else(|| {
                if parsed.is_none() {
                    Some("Over 256 KiB: source view only (reading limit 1 MiB)".into())
                } else {
                    None
                }
            });
        let frontmatter = parsed.map(|p| p.frontmatter).unwrap_or_default();
        Ok(
            json!({"id":format!("linked:{id}"),"documentId":id,"sourceId":source,"path":path,"identity":identity,"revision":revision,"title":Path::new(&path).file_name().unwrap_or_default().to_string_lossy(),"base":base,"content":document,"editable":reason.is_none(),"reason":reason,"frontmatter":frontmatter,"draft":draft,"current":current}),
        )
    }
    fn linked_open(&mut self, source: String, path: String) -> Result<Value, String> {
        let extension = Path::new(&path)
            .extension()
            .and_then(|s| s.to_str())
            .unwrap_or("")
            .to_lowercase();
        if !["md", "markdown"].contains(&extension.as_str()) {
            return Err("Only Markdown documents open in Linked Sources".into());
        }
        let (root, root_id) = self.linked_root(&source)?;
        let file = native::read(&root, &root_id, &path, false)?;
        let canonical = native::physical(&file.file)?;
        let path = canonical
            .strip_prefix(&root)
            .map_err(|_| "File is outside the pinned source")?
            .to_string_lossy()
            .replace('\\', "/");
        let key = path.replace('\\', "/").to_lowercase();
        let pending:Option<String>=self.db.query_row("SELECT n.id FROM linked_documents n JOIN linked_saves s ON s.id=n.id WHERE n.source_id=?1 AND n.path_key=?2",params![source,key],|r|r.get(0)).optional().map_err(error)?;
        if let Some(id) = pending {
            return self.linked_recover(&id);
        }
        let known:Option<String>=self.db.query_row("SELECT id FROM linked_documents WHERE source_id=?1 AND path_key=?2 AND identity=?3",params![source,key,file.id],|r|r.get(0)).optional().map_err(error)?;
        let id = known.unwrap_or_else(|| Uuid::new_v4().to_string());
        self.db
            .execute(
                "INSERT INTO linked_documents VALUES(?1,?2,?3,?4,?5,?6) ON CONFLICT(id) DO NOTHING",
                params![id, source, path, key, file.id, file.revision],
            )
            .map_err(error)?;
        if self
            .db
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM linked_drafts WHERE id=?1)",
                [&id],
                |r| r.get::<_, bool>(0),
            )
            .map_err(error)?
        {
            return self.linked_recover(&id);
        }
        self.db
            .execute(
                "UPDATE linked_documents SET revision=?1 WHERE id=?2",
                params![file.revision, id],
            )
            .map_err(error)?;
        let base = String::from_utf8(file.bytes).map_err(error)?;
        let parsed = if base.len() <= 256 * 1024 {
            markdown::parse(&base)
        } else {
            markdown::parse("")
        };
        self.linked_response(&id, base, parsed.document, file.reason, None, None)
    }
    fn linked_recover(&self, id: &str) -> Result<Value, String> {
        let(base,content,token,sequence,state,last_error):(String,String,String,i64,String,Option<String>)=self.db.query_row("SELECT base,content,token,sequence,state,last_error FROM linked_drafts WHERE id=?1",[id],|r|Ok((r.get(0)?,r.get(1)?,r.get(2)?,r.get(3)?,r.get(4)?,r.get(5)?))).map_err(error)?;
        let current = self.linked_inspect(id)?;
        let source_reason = current["current"]["error"]
            .as_str()
            .map(|_| "Source unavailable; protected draft retained for review".to_string())
            .or_else(|| current["current"]["reason"].as_str().map(str::to_string));
        self.linked_response(
            id,
            base,
            serde_json::from_str(&content).map_err(error)?,
            source_reason,
            Some(json!({"token":token,"sequence":sequence,"state":state,"error":last_error})),
            Some(current),
        )
    }
    fn linked_inspect(&self, id: &str) -> Result<Value, String> {
        let current = match self.linked_read(id, false) {
            Ok(f) => {
                json!({"identity":f.id,"revision":f.revision,"text":String::from_utf8_lossy(&f.bytes),"reason":f.reason})
            }
            Err(e) => json!({"error":e}),
        };
        let intent:Option<Value>=self.db.query_row("SELECT status,stage,capture,original_hash,candidate_hash,error FROM linked_saves WHERE id=?1",[id],|r|Ok(json!({"status":r.get::<_,String>(0)?,"stage":r.get::<_,String>(1)?,"capture":r.get::<_,String>(2)?,"originalHash":r.get::<_,String>(3)?,"candidateHash":r.get::<_,String>(4)?,"error":r.get::<_,Option<String>>(5)?}))).optional().map_err(error)?;
        Ok(json!({"current":current,"publication":intent}))
    }
    pub(crate) fn linked(&mut self, request: Request) -> Result<Value, String> {
        match request {
            Request::Web { url } => {
                native::open_web(&web_url(&url)?)?;
                Ok(Value::Null)
            }
            Request::Sources => {
                let mut q=self.db.prepare("SELECT id,display_path FROM linked_sources WHERE active=1 ORDER BY display_path,id").map_err(error)?;
                let rows = q
                    .query_map([], |r| {
                        Ok(json!({"id":r.get::<_,String>(0)?,"path":r.get::<_,String>(1)?}))
                    })
                    .map_err(error)?
                    .collect::<Result<Vec<_>, _>>()
                    .map_err(error)?;
                Ok(json!(rows))
            }
            Request::Register { path } => {
                let pins = native::pin(Path::new(&path))?;
                let physical = native::physical(pins.last().unwrap())?;
                let identity = native::identity(pins.last().unwrap())?;
                let workspace_pins = native::pin(&self.root)?;
                let workspace_path = native::physical(workspace_pins.last().unwrap())?;
                if workspace_path.starts_with(&physical) || physical.starts_with(&workspace_path) {
                    return Err(
                        "Linked folders must be separate from Vaultor workspace storage".into(),
                    );
                }
                let mut q = self
                    .db
                    .prepare("SELECT id,path,identity,active FROM linked_sources")
                    .map_err(error)?;
                let rows = q
                    .query_map([], |r| {
                        Ok((
                            r.get::<_, String>(0)?,
                            r.get::<_, String>(1)?,
                            r.get::<_, String>(2)?,
                            r.get::<_, bool>(3)?,
                        ))
                    })
                    .map_err(error)?
                    .collect::<Result<Vec<_>, _>>()
                    .map_err(error)?;
                drop(q);
                let mut chosen = None;
                let mut count = 0;
                for (id, old, old_id, active) in rows {
                    if active {
                        count += 1;
                    }
                    if old_id == identity {
                        chosen = Some(id);
                        continue;
                    }
                    if active
                        && (physical.starts_with(&old) || Path::new(&old).starts_with(&physical))
                    {
                        return Err(
                            "Overlapping linked folders are already covered by an existing source"
                                .into(),
                        );
                    }
                }
                if chosen.is_none() && count >= 8 {
                    return Err("Up to eight linked folders are supported".into());
                }
                let id = chosen.unwrap_or_else(|| Uuid::new_v4().to_string());
                self.db.execute("INSERT INTO linked_sources VALUES(?1,?2,?3,?4,1) ON CONFLICT(id) DO UPDATE SET path=excluded.path,display_path=excluded.display_path,active=1",params![id,physical.to_string_lossy(),path,identity]).map_err(error)?;
                Ok(json!({"id":id,"path":path}))
            }
            Request::Remove { source } => {
                self.db
                    .execute("UPDATE linked_sources SET active=0 WHERE id=?1", [source])
                    .map_err(error)?;
                Ok(Value::Null)
            }
            Request::Directory {
                source,
                path,
                after,
            } => {
                let (root, identity) = self.linked_root(&source)?;
                let pins = native::pin(&root)?;
                if native::identity(pins.last().unwrap())? != identity {
                    return Err("Linked folder was replaced".into());
                }
                let rel = native::relative(&path)?;
                let pins = native::pin(&root.join(rel))?;
                let directory = native::physical(pins.last().unwrap())?;
                let mut entries = std::collections::BTreeMap::new();
                let mut hidden = 0;
                let mut count = 0;
                for e in std::fs::read_dir(directory).map_err(error)? {
                    count += 1;
                    if count > 20000 {
                        return Err("This directory exceeds the 20,000-entry browsing limit; choose a narrower source".into());
                    }
                    let e = e.map_err(error)?;
                    let name = e
                        .file_name()
                        .into_string()
                        .map_err(|_| "Non-Unicode entry name is unsupported")?;
                    if name == ".git" || name.starts_with(".vaultor-") {
                        continue;
                    }
                    let meta = std::fs::symlink_metadata(e.path()).map_err(error)?;
                    use std::os::windows::fs::MetadataExt;
                    let blocked = meta.file_attributes() & 0x400 != 0;
                    let directory = meta.file_attributes() & 0x10 != 0; // FILE_ATTRIBUTE_DIRECTORY includes junction directory entries.
                    let markdown = Path::new(&name)
                        .extension()
                        .and_then(|s| s.to_str())
                        .is_some_and(|s| {
                            s.eq_ignore_ascii_case("md") || s.eq_ignore_ascii_case("markdown")
                        });
                    if !directory && !markdown {
                        hidden += 1;
                        continue;
                    }
                    if after.as_ref().is_some_and(|a| name <= *a) {
                        continue;
                    }
                    let child = if path.is_empty() {
                        name.clone()
                    } else {
                        format!("{}/{name}", path.replace('\\', "/"))
                    };
                    entries.insert(
                        name.clone(),
                        json!({"name":name,"path":child,"directory":directory,"blocked":blocked}),
                    );
                    if entries.len() > 101 {
                        entries.pop_last();
                    }
                }
                let more = entries.len() > 100;
                let mut entries = entries.into_iter().take(100).collect::<Vec<_>>();
                let next = if more {
                    entries.last().map(|e| e.0.clone())
                } else {
                    None
                };
                Ok(
                    json!({"entries":entries.drain(..).map(|e|e.1).collect::<Vec<_>>(),"next":next,"hidden":hidden}),
                )
            }
            Request::Open { source, path } => self.linked_open(source, path),
            Request::Follow { id, href } => {
                if href.contains(':') || href.starts_with(['\\', '/']) {
                    return Err("Only relative links within registered folders are enabled".into());
                }
                let decoded =
                    percent_encoding::percent_decode_str(href.split('#').next().unwrap_or(""))
                        .decode_utf8()
                        .map_err(error)?;
                let (source, path, _, _) = self.linked_location(&id)?;
                let (root, _) = self.linked_root(&source)?;
                let mut target = root.join(Path::new(&path).parent().unwrap_or(Path::new("")));
                for part in decoded.replace('\\', "/").split('/') {
                    match part {
                        "" | "." => {}
                        ".." => {
                            if !target.pop() {
                                return Err("Link escapes registered sources".into());
                            }
                        }
                        _ => {
                            if part.contains(':') {
                                return Err("Unsafe link".into());
                            }
                            target.push(part)
                        }
                    }
                }
                let mut q = self
                    .db
                    .prepare("SELECT id,path FROM linked_sources WHERE active=1")
                    .map_err(error)?;
                let roots = q
                    .query_map([], |r| {
                        Ok((
                            r.get::<_, String>(0)?,
                            PathBuf::from(r.get::<_, String>(1)?),
                        ))
                    })
                    .map_err(error)?
                    .collect::<Result<Vec<_>, _>>()
                    .map_err(error)?;
                drop(q);
                for (source, root) in roots {
                    if let Ok(rel) = target.strip_prefix(root) {
                        return self.linked_open(source, rel.to_string_lossy().replace('\\', "/"));
                    }
                }
                Err("Link is outside registered folders; register its folder first".into())
            }
            Request::Protect {
                id,
                revision,
                base,
                content,
                token,
                sequence,
            } => {
                let pending: bool = self
                    .db
                    .query_row(
                        "SELECT EXISTS(SELECT 1 FROM linked_saves WHERE id=?1)",
                        [&id],
                        |r| r.get(0),
                    )
                    .map_err(error)?;
                if pending {
                    return Err(
                        "Review pending publication before changing its protected draft".into(),
                    );
                }
                if sequence <= 0 || token.is_empty() || token.len() > 100 {
                    return Err("Invalid linked draft proof".into());
                }
                let (_, _, _, captured) = self.linked_location(&id)?;
                if captured != revision || native::hash(base.as_bytes()) != revision {
                    return Err("Draft baseline does not match the opened source revision".into());
                }
                if base.len() > 256 * 1024 || markdown::parse(&base).reason.is_some() {
                    return Err("Unsupported source cannot create an editable draft".into());
                }
                if content["type"] != "doc" || !content["content"].is_array() {
                    return Err("Invalid structured linked draft".into());
                }
                let text = content.to_string();
                if text.len() > 2 * 1024 * 1024 {
                    return Err("Linked draft exceeds 2 MiB".into());
                }
                let tx = self.db.transaction().map_err(error)?;
                let existing: Option<(String, i64, String)> = tx
                    .query_row(
                        "SELECT token,sequence,content FROM linked_drafts WHERE id=?1",
                        [&id],
                        |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
                    )
                    .optional()
                    .map_err(error)?;
                if let Some((old, seq, body)) = existing {
                    if old != token || sequence < seq {
                        return Err(
                            "Linked draft writer/sequence changed; existing evidence retained"
                                .into(),
                        );
                    }
                    if sequence == seq {
                        if body == text {
                            return Ok(json!({"sequence":sequence}));
                        }
                        return Err("Linked draft sequence collision".into());
                    }
                }
                let(count,bytes):(i64,i64)=tx.query_row("SELECT COUNT(*),COALESCE(SUM(length(CAST(base AS BLOB))+length(CAST(content AS BLOB))),0) FROM linked_drafts WHERE id<>?1",[&id],|r|Ok((r.get(0)?,r.get(1)?))).map_err(error)?;
                if count >= 64 || bytes + base.len() as i64 + text.len() as i64 > 32 * 1024 * 1024 {
                    return Err("Linked recovery is full; existing drafts were not evicted".into());
                }
                tx.execute("INSERT INTO linked_drafts(id,revision,base,content,token,sequence) VALUES(?1,?2,?3,?4,?5,?6) ON CONFLICT(id) DO UPDATE SET content=excluded.content,sequence=excluded.sequence,state='draft',last_error=NULL,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')",params![id,revision,base,text,token,sequence]).map_err(error)?;
                tx.commit().map_err(error)?;
                Ok(json!({"sequence":sequence}))
            }
            Request::Save {
                id,
                token,
                sequence,
            } => {
                self.db.execute("UPDATE linked_drafts SET state='saving',last_error=NULL WHERE id=?1 AND token=?2 AND sequence=?3",params![id,token,sequence]).map_err(error)?;
                let result = self.linked_save(&id, &token, sequence);
                if let Err(message) = &result {
                    let pending: bool = self
                        .db
                        .query_row(
                            "SELECT EXISTS(SELECT 1 FROM linked_saves WHERE id=?1)",
                            [&id],
                            |r| r.get(0),
                        )
                        .map_err(error)?;
                    let state = if pending {
                        "review"
                    } else if message.contains("conflict") {
                        "conflict"
                    } else {
                        "failed"
                    };
                    self.db.execute("UPDATE linked_drafts SET state=?1,last_error=?2 WHERE id=?3 AND token=?4 AND sequence=?5",params![state,message,id,token,sequence]).map_err(error)?;
                }
                result
            }
            Request::Drafts => {
                let mut q=self.db.prepare("SELECT d.id,n.path,d.sequence,COALESCE(s.status,d.state) FROM linked_drafts d JOIN linked_documents n ON n.id=d.id LEFT JOIN linked_saves s ON s.id=d.id ORDER BY d.updated_at DESC,d.id").map_err(error)?;
                let rows=q.query_map([],|r|Ok(json!({"id":r.get::<_,String>(0)?,"path":r.get::<_,String>(1)?,"sequence":r.get::<_,i64>(2)?,"status":r.get::<_,Option<String>>(3)?}))).map_err(error)?.collect::<Result<Vec<_>,_>>().map_err(error)?;
                Ok(json!(rows))
            }
            Request::Recover { id } => self.linked_recover(&id),
            Request::Discard {
                id,
                token,
                sequence,
            } => {
                let pending: bool = self
                    .db
                    .query_row(
                        "SELECT EXISTS(SELECT 1 FROM linked_saves WHERE id=?1)",
                        [&id],
                        |r| r.get(0),
                    )
                    .map_err(error)?;
                if pending {
                    return Err(
                        "Publication evidence needs review before discarding this draft".into(),
                    );
                }
                if self
                    .db
                    .execute(
                        "DELETE FROM linked_drafts WHERE id=?1 AND token=?2 AND sequence=?3",
                        params![id, token, sequence],
                    )
                    .map_err(error)?
                    != 1
                {
                    return Err("Draft changed; reopen its review".into());
                }
                Ok(Value::Null)
            }
            Request::Inspect { id } => self.linked_inspect(&id),
            Request::Resolve { id } => self.linked_resolve(&id),
        }
    }
    fn linked_save(&mut self, id: &str, token: &str, sequence: i64) -> Result<Value, String> {
        let pending: bool = self
            .db
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM linked_saves WHERE id=?1)",
                [id],
                |r| r.get(0),
            )
            .map_err(error)?;
        if pending {
            return Err("Previous publication needs review; no automatic retry".into());
        }
        let(base,content,revision):(String,String,String)=self.db.query_row("SELECT base,content,revision FROM linked_drafts WHERE id=?1 AND token=?2 AND sequence=?3",params![id,token,sequence],|r|Ok((r.get(0)?,r.get(1)?,r.get(2)?))).map_err(|_|"Draft changed; protect the newest edits before Save".to_string())?;
        let proposed: Value = serde_json::from_str(&content).map_err(error)?;
        let candidate = markdown::patch(&base, &proposed)?;
        let original = self.linked_read(id, true)?;
        let (_, _, identity, _) = self.linked_location(id)?;
        if original.id != identity || original.revision != revision {
            return Err("External revision conflict. Draft retained; inspect the current filesystem version.".into());
        }
        if candidate.as_bytes() == original.bytes {
            self.db
                .execute(
                    "DELETE FROM linked_drafts WHERE id=?1 AND token=?2 AND sequence=?3",
                    params![id, token, sequence],
                )
                .map_err(error)?;
            return self.linked_response(id, candidate, proposed, None, None, None);
        }
        let operation = Uuid::new_v4();
        let stage = format!(".vaultor-stage-{operation}");
        let capture = format!(".vaultor-capture-{operation}");
        let candidate_hash = native::hash(candidate.as_bytes());
        let parent = native::physical(original.pins.last().unwrap())?;
        self.db.execute("INSERT INTO linked_saves(id,status,stage,capture,original_identity,original_hash,candidate_hash,candidate,token,sequence) VALUES(?1,'prepared',?2,?3,?4,?5,?6,?7,?8,?9)",params![id,parent.join(&stage).to_string_lossy(),parent.join(&capture).to_string_lossy(),original.id,revision,candidate_hash,candidate,token,sequence]).map_err(error)?;
        let outcome: Result<(), String> = (|| {
            let staged = native::stage(&original, &stage, candidate.as_bytes())?;
            let next_id = native::identity(&staged)?;
            self.db
                .execute(
                    "UPDATE linked_saves SET candidate_identity=?1 WHERE id=?2",
                    params![next_id, id],
                )
                .map_err(error)?;
            native::rename(&original.file, original.pins.last().unwrap(), &capture)?;
            self.db
                .execute(
                    "UPDATE linked_saves SET status='captured' WHERE id=?1",
                    [id],
                )
                .map_err(error)?;
            native::verify_metadata(&original.file, &staged)?;
            // Deliberately no replacing rename: a gap occupant is never overwritten.
            native::rename(
                &staged,
                original.pins.last().unwrap(),
                original.path.file_name().unwrap().to_str().unwrap(),
            )?;
            self.db
                .execute(
                    "UPDATE linked_saves SET status='published' WHERE id=?1",
                    [id],
                )
                .map_err(error)?;
            staged.sync_all().map_err(error)?;
            native::verify_published(&staged, &original.path, &candidate_hash)?;
            native::verify_metadata(&original.file, &staged)?;
            self.db
                .execute(
                    "UPDATE linked_saves SET status='verified' WHERE id=?1",
                    [id],
                )
                .map_err(error)?;
            native::discard_file(&original.file)?;
            let tx = self.db.transaction().map_err(error)?;
            tx.execute(
                "UPDATE linked_documents SET identity=?1,revision=?2 WHERE id=?3",
                params![next_id, candidate_hash, id],
            )
            .map_err(error)?;
            tx.execute(
                "DELETE FROM linked_drafts WHERE id=?1 AND token=?2 AND sequence=?3",
                params![id, token, sequence],
            )
            .map_err(error)?;
            tx.execute("DELETE FROM linked_saves WHERE id=?1", [id])
                .map_err(error)?;
            tx.commit().map_err(error)?;
            Ok(())
        })();
        if let Err(e) = outcome {
            let _ = self.db.execute(
                "UPDATE linked_saves SET error=?1 WHERE id=?2",
                params![e, id],
            );
            return Err(format!(
                "Save failed or outcome uncertain; retained draft/publication evidence. {e}"
            ));
        }
        self.linked_response(id, candidate, proposed, None, None, None)
    }
    fn linked_resolve(&mut self, id: &str) -> Result<Value, String> {
        let intent:Option<(String,String,String,String,String,Option<String>,String,String,i64)>=self.db.query_row("SELECT status,stage,capture,original_identity,original_hash,candidate_identity,candidate_hash,token,sequence FROM linked_saves WHERE id=?1",[id],|r|Ok((r.get(0)?,r.get(1)?,r.get(2)?,r.get(3)?,r.get(4)?,r.get(5)?,r.get(6)?,r.get(7)?,r.get(8)?))).optional().map_err(error)?;
        let Some((_status, stage, capture, old_id, old_hash, new_id, new_hash, token, sequence)) =
            intent
        else {
            return Err("No publication intent to review".into());
        };
        let current = self.linked_read(id, true)?;
        let original_unchanged = current.id == old_id && current.revision == old_hash;
        let published = Some(current.id.clone()) == new_id && current.revision == new_hash;
        if !original_unchanged && !published {
            return Err("Neither original nor proposed publication is verifiable. Keep the draft and inspect paths; no automatic restore or overwrite.".into());
        }
        // Delete only the known captured/staged object, never a same-name replacement.
        let (source, relative, _, _) = self.linked_location(id)?;
        let (root, root_id) = self.linked_root(&source)?;
        for (path, expected, expected_hash) in if published {
            vec![(capture, Some(old_id), old_hash)]
        } else {
            vec![(stage, new_id, new_hash)]
        } {
            if Path::new(&path).exists() {
                let name = Path::new(&path)
                    .file_name()
                    .unwrap()
                    .to_str()
                    .ok_or("Unsupported recovery path")?;
                let parent = Path::new(&relative).parent().unwrap_or(Path::new(""));
                let r = parent.join(name).to_string_lossy().to_string();
                let file = native::read(&root, &root_id, &r, true)?;
                if Some(file.id) != expected || file.revision != expected_hash {
                    return Err("Recovery sidecar changed; nothing was deleted".into());
                }
                native::discard_file(&file.file)?;
            }
        }
        if published {
            let tx = self.db.transaction().map_err(error)?;
            tx.execute(
                "UPDATE linked_documents SET identity=?1,revision=?2 WHERE id=?3",
                params![current.id, current.revision, id],
            )
            .map_err(error)?;
            tx.execute(
                "DELETE FROM linked_drafts WHERE id=?1 AND token=?2 AND sequence=?3",
                params![id, token, sequence],
            )
            .map_err(error)?;
            tx.execute("DELETE FROM linked_saves WHERE id=?1", [id])
                .map_err(error)?;
            tx.commit().map_err(error)?;
            drop(current);
            self.linked_open(source, relative)
        } else {
            self.db
                .execute("DELETE FROM linked_saves WHERE id=?1", [id])
                .map_err(error)?;
            drop(current);
            self.db
                .execute(
                    "UPDATE linked_drafts SET state='draft',last_error=NULL WHERE id=?1",
                    [id],
                )
                .map_err(error)?;
            self.linked_recover(id)
        }
    }
}
#[cfg(not(windows))]
impl Workspace {
    pub(crate) fn linked(&mut self, _: Request) -> Result<Value, String> {
        Err("Linked sources are qualified only on Windows local NTFS".into())
    }
}

pub fn web_url(value: &str) -> Result<String, String> {
    let url = url::Url::parse(value).map_err(|_| "Invalid web link")?;
    if !matches!(url.scheme(), "http" | "https")
        || url.host_str().is_none()
        || !url.username().is_empty()
        || url.password().is_some()
        || value.chars().any(|c| c.is_control())
    {
        return Err("Only credential-free HTTP(S) web links can open externally".into());
    }
    Ok(url.into())
}
