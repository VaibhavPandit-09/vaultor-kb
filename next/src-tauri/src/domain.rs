//! Portable local domain. No Tauri types, HTTP, process launch or renderer-owned SQL.
use fs2::FileExt;
use rusqlite::{params, Connection};
use serde::Deserialize;
use serde_json::{json, Value};
use std::{
    fs::{self, File, OpenOptions},
    path::{Path, PathBuf},
    time::Duration,
};
use uuid::Uuid;

#[derive(Debug, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase", deny_unknown_fields)]
pub enum Request {
    Open {
        path: String,
    },
    Snapshot,
    List {
        collection: Option<String>,
    },
    CreateCollection {
        name: String,
    },
    CreateNote {
        title: String,
        collection: Option<String>,
    },
    Read {
        id: String,
    },
    Save {
        id: String,
        revision: i64,
        title: String,
        content: Value,
    },
    Setting {
        key: String,
        value: Value,
    },
}
pub struct Workspace {
    db: Connection,
    root: PathBuf,
    _lock: File,
}
fn error(e: impl std::fmt::Display) -> String {
    e.to_string()
}
fn title(value: &str) -> Result<&str, String> {
    let value = value.trim();
    if value.is_empty() || value.chars().count() > 240 {
        return Err("Name must contain 1–240 characters".into());
    }
    Ok(value)
}
impl Workspace {
    pub fn is_path(&self, path: &Path) -> bool {
        path.canonicalize().is_ok_and(|p| p == self.root)
    }
    pub fn open(root: &Path) -> Result<Self, String> {
        fs::create_dir_all(root).map_err(error)?;
        let root = root.canonicalize().map_err(error)?;
        let marker = root.join("vaultor-next.json");
        if marker.exists() {
            let metadata: Value =
                serde_json::from_slice(&fs::read(&marker).map_err(error)?).map_err(error)?;
            if metadata != json!({"format": "vaultor-next", "version": 1}) {
                return Err("Unsupported workspace format".into());
            }
        } else {
            if fs::read_dir(&root).map_err(error)?.next().is_some() {
                return Err("Choose an empty directory or an existing Vaultor Next workspace. Legacy workspaces are not supported.".into());
            }
            OpenOptions::new()
                .write(true)
                .create_new(true)
                .open(&marker)
                .map_err(error)?;
            fs::write(
                &marker,
                serde_json::to_vec(&json!({"format":"vaultor-next","version":1})).unwrap(),
            )
            .map_err(error)?;
        }
        let lock = OpenOptions::new()
            .read(true)
            .write(true)
            .create(true)
            .truncate(false)
            .open(root.join("workspace.lock"))
            .map_err(error)?;
        lock.try_lock_exclusive()
            .map_err(|_| "Workspace is already open in another process".to_string())?;
        let db = Connection::open(root.join("workspace.sqlite3")).map_err(error)?;
        db.busy_timeout(Duration::from_secs(3)).map_err(error)?;
        let version: i64 = db
            .pragma_query_value(None, "user_version", |r| r.get(0))
            .map_err(error)?;
        if version > 1 {
            return Err("Workspace was created by a newer Vaultor Next".into());
        }
        db.execute_batch("PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;
            BEGIN IMMEDIATE;
            CREATE TABLE IF NOT EXISTS collections(id TEXT PRIMARY KEY, name TEXT NOT NULL, normalized TEXT NOT NULL UNIQUE);
            CREATE TABLE IF NOT EXISTS resources(id TEXT PRIMARY KEY, title TEXT NOT NULL, content TEXT NOT NULL CHECK(json_valid(content)), revision INTEGER NOT NULL DEFAULT 1, updated_at TEXT NOT NULL DEFAULT(strftime('%Y-%m-%dT%H:%M:%fZ','now')));
            CREATE TABLE IF NOT EXISTS memberships(resource_id TEXT NOT NULL REFERENCES resources(id), collection_id TEXT NOT NULL REFERENCES collections(id), PRIMARY KEY(resource_id,collection_id));
            CREATE INDEX IF NOT EXISTS membership_collection ON memberships(collection_id,resource_id);
            CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY, value TEXT NOT NULL CHECK(json_valid(value)));
            PRAGMA user_version=1; COMMIT;").map_err(error)?;
        Ok(Self {
            db,
            root,
            _lock: lock,
        })
    }
    pub fn execute(&mut self, request: Request) -> Result<Value, String> {
        match request {
            Request::Open { .. } => Err("Open belongs to workspace lifecycle".into()),
            Request::Snapshot => {
                let mut stmt = self.db.prepare("SELECT id,name FROM collections ORDER BY normalized").map_err(error)?;
                let collections = stmt.query_map([], |r| Ok(json!({"id":r.get::<_,String>(0)?,"name":r.get::<_,String>(1)?}))).map_err(error)?.collect::<Result<Vec<_>,_>>().map_err(error)?;
                let mut stmt = self.db.prepare("SELECT key,value FROM settings").map_err(error)?;
                let settings = stmt.query_map([], |r| Ok((r.get::<_,String>(0)?,r.get::<_,String>(1)?))).map_err(error)?.collect::<Result<Vec<_>,_>>().map_err(error)?;
                let settings: serde_json::Map<String,Value> = settings.into_iter().map(|(k,v)| Ok((k,serde_json::from_str(&v).map_err(error)?))).collect::<Result<_,String>>()?;
                Ok(json!({"path":self.root,"collections":collections,"settings":settings}))
            },
            Request::List { collection } => {
                let mut stmt = self.db.prepare("SELECT id,title,revision,updated_at FROM resources WHERE (?1 IS NULL OR id IN (SELECT resource_id FROM memberships WHERE collection_id=?1)) ORDER BY updated_at DESC,id LIMIT 500").map_err(error)?;
                let items = stmt.query_map([collection], |r| Ok(json!({"id":r.get::<_,String>(0)?,"title":r.get::<_,String>(1)?,"revision":r.get::<_,i64>(2)?,"updatedAt":r.get::<_,String>(3)?}))).map_err(error)?.collect::<Result<Vec<_>,_>>().map_err(error)?;
                Ok(json!(items))
            },
            Request::CreateCollection { name } => {
                let name = title(&name)?;
                let id = Uuid::new_v4().to_string();
                self.db.execute("INSERT INTO collections(id,name,normalized) VALUES(?1,?2,?3)",params![id,name,name.to_lowercase()]).map_err(error)?;
                Ok(json!({"id":id,"name":name}))
            },
            Request::CreateNote { title: name, collection } => {
                let name = title(&name)?;
                let id = Uuid::new_v4().to_string();
                let tx = self.db.transaction().map_err(error)?;
                tx.execute("INSERT INTO resources(id,title,content) VALUES(?1,?2,?3)",params![id,name,r#"{"type":"doc","content":[{"type":"paragraph"}]}"#]).map_err(error)?;
                if let Some(collection) = collection { tx.execute("INSERT INTO memberships VALUES(?1,?2)",params![id,collection]).map_err(error)?; }
                tx.commit().map_err(error)?;
                self.execute(Request::Read { id })
            },
            Request::Read { id } => self.db.query_row("SELECT id,title,content,revision FROM resources WHERE id=?1", [id], |r| {
                Ok(json!({"id":r.get::<_,String>(0)?,"title":r.get::<_,String>(1)?,"content":r.get::<_,String>(2)?,"revision":r.get::<_,i64>(3)?}))
            }).map_err(error).and_then(|mut value| { value["content"] = serde_json::from_str(value["content"].as_str().unwrap()).map_err(error)?; Ok(value) }),
            Request::Save { id, revision, title: name, content } => {
                let name = title(&name)?;
                if content.get("type").and_then(Value::as_str) != Some("doc") || !content.get("content").is_some_and(Value::is_array) { return Err("Expected structured Tiptap document".into()); }
                let content = serde_json::to_string(&content).map_err(error)?;
                if content.len() > 8 * 1024 * 1024 { return Err("Note exceeds the 8 MiB foundation limit".into()); }
                let changed = self.db.execute("UPDATE resources SET title=?1,content=?2,revision=revision+1,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?3 AND revision=?4",params![name,content,id,revision]).map_err(error)?;
                if changed != 1 { return Err("Note revision conflict. Your unsaved editor is retained; do not overwrite the stored note.".into()); }
                Ok(json!({"revision":revision+1}))
            },
            Request::Setting { key, value } => {
                if key != "theme" || ![json!("light"),json!("dark"),json!("oled")].contains(&value) { return Err("Unsupported setting".into()); }
                self.db.execute("INSERT INTO settings VALUES(?1,?2) ON CONFLICT(key) DO UPDATE SET value=excluded.value",params![key,value.to_string()]).map_err(error)?;
                Ok(Value::Null)
            },
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn transactions_revisions_restart_and_ownership() {
        let temp = tempfile::tempdir().unwrap();
        let mut w = Workspace::open(temp.path()).unwrap();
        assert!(Workspace::open(temp.path()).is_err());
        let c = w
            .execute(Request::CreateCollection {
                name: "Research".into(),
            })
            .unwrap();
        assert!(w
            .execute(Request::CreateCollection {
                name: " research ".into()
            })
            .is_err());
        assert!(w
            .execute(Request::CreateNote {
                title: "Rollback".into(),
                collection: Some("missing".into())
            })
            .is_err());
        let n = w
            .execute(Request::CreateNote {
                title: "Note".into(),
                collection: Some(c["id"].as_str().unwrap().into()),
            })
            .unwrap();
        let id = n["id"].as_str().unwrap().to_string();
        let doc = json!({"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Persisted λ"}]}]});
        w.execute(Request::Save {
            id: id.clone(),
            revision: 1,
            title: "Edited".into(),
            content: doc.clone(),
        })
        .unwrap();
        assert!(w
            .execute(Request::Save {
                id: id.clone(),
                revision: 1,
                title: "Stale".into(),
                content: doc.clone()
            })
            .is_err());
        w.execute(Request::Setting {
            key: "theme".into(),
            value: json!("dark"),
        })
        .unwrap();
        drop(w);
        let mut w = Workspace::open(temp.path()).unwrap();
        let saved = w.execute(Request::Read { id }).unwrap();
        assert_eq!(saved["content"], doc);
        assert_eq!(saved["revision"], 2);
        assert_eq!(saved["title"], "Edited");
        assert_eq!(
            w.execute(Request::List { collection: None })
                .unwrap()
                .as_array()
                .unwrap()
                .len(),
            1
        );
        assert_eq!(
            w.execute(Request::Snapshot).unwrap()["settings"]["theme"],
            "dark"
        );
    }
    #[test]
    fn refuses_unowned_storage_and_invalid_documents() {
        let temp = tempfile::tempdir().unwrap();
        fs::write(temp.path().join("external.md"), "untouched").unwrap();
        assert!(Workspace::open(temp.path()).is_err());
        assert_eq!(
            fs::read_to_string(temp.path().join("external.md")).unwrap(),
            "untouched"
        );
        assert!(!temp.path().join("workspace.sqlite3").exists());
    }
}
