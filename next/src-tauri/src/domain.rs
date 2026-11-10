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
    New {
        path: String,
    },
    Snapshot,
    Linked {
        request: crate::linked::Request,
    },
    List {
        collection: Option<String>,
        cursor: Option<crate::library::Cursor>,
        limit: Option<u32>,
    },
    Search {
        options: crate::search::SearchOptions,
        cursor: Option<crate::search::SearchCursor>,
        limit: Option<u32>,
    },
    CreateCollection {
        name: String,
        #[serde(rename = "parentId")]
        parent_id: Option<String>,
    },
    UpdateCollection {
        id: String,
        name: String,
        #[serde(rename = "parentId")]
        parent_id: Option<String>,
    },
    Membership {
        id: String,
        add: Option<String>,
        remove: Option<String>,
    },
    BulkMembership {
        ids: Vec<String>,
        add: Option<String>,
        remove: Option<String>,
    },
    Memberships {
        id: String,
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
        proof: Option<crate::editing::Proof>,
    },
    Draft {
        id: String,
        #[serde(rename = "baseRevision")]
        base_revision: i64,
        token: String,
        sequence: i64,
        title: String,
        content: Value,
    },
    Drafts,
    ReadDraft {
        id: String,
    },
    DiscardDraft {
        id: String,
        token: String,
        sequence: i64,
    },
    RebaseDraft {
        id: String,
        token: String,
        sequence: i64,
        revision: i64,
    },
    Setting {
        key: String,
        value: Value,
    },
}
pub struct Workspace {
    pub(crate) db: Connection,
    pub(crate) root: PathBuf,
    _lock: File,
}
pub(crate) fn error(e: impl std::fmt::Display) -> String {
    e.to_string()
}
pub(crate) fn title(value: &str) -> Result<&str, String> {
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
            if metadata != json!({"format": "vaultor-next", "version": 2}) {
                return Err("M2 requires a new empty workspace or an M2 workspace. M1 data is not migrated.".into());
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
                serde_json::to_vec(&json!({"format":"vaultor-next","version":2})).unwrap(),
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
        let mut db = Connection::open(root.join("workspace.sqlite3")).map_err(error)?;
        db.busy_timeout(Duration::from_secs(3)).map_err(error)?;
        let version: i64 = db
            .pragma_query_value(None, "user_version", |r| r.get(0))
            .map_err(error)?;
        if version != 0 && version != 2 {
            return Err("Unsupported SQLite workspace version".into());
        }
        db.execute_batch("PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;
            BEGIN IMMEDIATE;
            CREATE TABLE IF NOT EXISTS collections(id TEXT PRIMARY KEY, name TEXT NOT NULL, normalized TEXT NOT NULL, parent_id TEXT REFERENCES collections(id));
            CREATE UNIQUE INDEX IF NOT EXISTS collection_name ON collections(COALESCE(parent_id,''),normalized);
            CREATE TABLE IF NOT EXISTS resources(seq INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT NOT NULL UNIQUE, title TEXT NOT NULL, content TEXT NOT NULL CHECK(json_valid(content)), revision INTEGER NOT NULL DEFAULT 1, updated_at TEXT NOT NULL DEFAULT(strftime('%Y-%m-%dT%H:%M:%fZ','now')));
            CREATE TABLE IF NOT EXISTS memberships(resource_id TEXT NOT NULL REFERENCES resources(id), collection_id TEXT NOT NULL REFERENCES collections(id), PRIMARY KEY(resource_id,collection_id));
            CREATE INDEX IF NOT EXISTS membership_collection ON memberships(collection_id,resource_id);
            CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY, value TEXT NOT NULL CHECK(json_valid(value)));
            CREATE TABLE IF NOT EXISTS drafts(resource_id TEXT PRIMARY KEY REFERENCES resources(id), base_revision INTEGER NOT NULL, token TEXT NOT NULL, sequence INTEGER NOT NULL, title TEXT NOT NULL, content TEXT NOT NULL CHECK(json_valid(content)), updated_at TEXT NOT NULL DEFAULT(strftime('%Y-%m-%dT%H:%M:%fZ','now')));
            PRAGMA user_version=2; COMMIT;").map_err(error)?;
        crate::transfers::initialize(&db)?;
        crate::search::initialize(&mut db)?;
        crate::linked::initialize(&db)?;
        Ok(Self {
            db,
            root,
            _lock: lock,
        })
    }
    pub fn execute(&mut self, request: Request) -> Result<Value, String> {
        match request {
            Request::Open { .. } | Request::New { .. } => Err("Open belongs to workspace lifecycle".into()),
            Request::Linked { request } => self.linked(request),
            Request::Snapshot => {
                let mut stmt = self.db.prepare("SELECT id,name,parent_id FROM collections ORDER BY normalized,id").map_err(error)?;
                let collections = stmt.query_map([], |r| Ok(json!({"id":r.get::<_,String>(0)?,"name":r.get::<_,String>(1)?,"parentId":r.get::<_,Option<String>>(2)?}))).map_err(error)?.collect::<Result<Vec<_>,_>>().map_err(error)?;
                let mut stmt = self.db.prepare("SELECT key,value FROM settings").map_err(error)?;
                let settings = stmt.query_map([], |r| Ok((r.get::<_,String>(0)?,r.get::<_,String>(1)?))).map_err(error)?.collect::<Result<Vec<_>,_>>().map_err(error)?;
                let settings: serde_json::Map<String,Value> = settings.into_iter().map(|(k,v)| Ok((k,serde_json::from_str(&v).map_err(error)?))).collect::<Result<_,String>>()?;
                Ok(json!({"path":self.root,"collections":collections,"settings":settings}))
            },
            Request::List { collection, cursor, limit } => self.list(collection, cursor, limit),
            Request::Search { options, cursor, limit } => self.search(options, cursor, limit),
            Request::CreateCollection { name, parent_id } => self.collection(None, name, parent_id),
            Request::UpdateCollection { id, name, parent_id } => self.collection(Some(id), name, parent_id),
            Request::Membership { id, add, remove } => self.membership(id, add, remove),
            Request::BulkMembership { ids, add, remove } => self.bulk_membership(ids, add, remove),
            Request::Memberships { id } => self.memberships(id),
            Request::CreateNote { title: name, collection } => {
                let name = title(&name)?;
                let id = Uuid::new_v4().to_string();
                let tx = self.db.transaction().map_err(error)?;
                tx.execute("INSERT INTO resources(id,title,content) VALUES(?1,?2,?3)",params![id,name,r#"{"type":"doc","content":[{"type":"paragraph"}]}"#]).map_err(error)?;
                if let Some(collection) = collection { tx.execute("INSERT INTO memberships VALUES(?1,?2)",params![id,collection]).map_err(error)?; }
                tx.commit().map_err(error)?;
                self.execute(Request::Read { id })
            },
            Request::Read { id } => self.db.query_row("SELECT id,title,content,revision FROM resources WHERE id=?1", [&id], |r| {
                Ok(json!({"id":r.get::<_,String>(0)?,"title":r.get::<_,String>(1)?,"content":r.get::<_,String>(2)?,"revision":r.get::<_,i64>(3)?}))
            }).map_err(error).and_then(|mut value| { value["content"] = serde_json::from_str(value["content"].as_str().unwrap()).map_err(error)?; let mut q=self.db.prepare("SELECT collection_id FROM memberships WHERE resource_id=?1 ORDER BY collection_id").map_err(error)?; value["collections"]=json!(q.query_map([&id],|r|r.get::<_,String>(0)).map_err(error)?.collect::<Result<Vec<_>,_>>().map_err(error)?); value["kind"]=self.db.query_row("SELECT kind FROM managed_originals WHERE resource_id=?1",[&id],|r|r.get::<_,String>(0)).map(Value::String).unwrap_or(json!("note")); Ok(value) }),
            Request::Save { id, revision, title, content, proof } => self.save(id, revision, title, content, proof),
            Request::Draft { id, base_revision, token, sequence, title, content } => self.draft(id,base_revision,token,sequence,title,content),
            Request::Drafts => self.drafts(),
            Request::ReadDraft { id } => self.read_draft(id),
            Request::DiscardDraft { id, token, sequence } => self.discard_draft(id,token,sequence),
            Request::RebaseDraft { id, token, sequence, revision } => self.rebase_draft(id,token,sequence,revision),
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
                parent_id: None,
            })
            .unwrap();
        assert!(w
            .execute(Request::CreateCollection {
                name: " research ".into(),
                parent_id: None
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
            proof: None,
        })
        .unwrap();
        assert!(w
            .execute(Request::Save {
                id: id.clone(),
                revision: 1,
                title: "Stale".into(),
                content: doc.clone(),
                proof: None
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
            w.execute(Request::List {
                collection: None,
                cursor: None,
                limit: None
            })
            .unwrap()["items"]
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
