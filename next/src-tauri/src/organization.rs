//! Identity-based organization and recoverable managed-resource lifecycle.
use crate::domain::{error, title, Workspace};
use rusqlite::{params, Connection};
use serde::Deserialize;
use serde_json::{json, Value};
use uuid::Uuid;
#[derive(Debug, Deserialize)]
#[serde(tag = "op", rename_all = "camelCase", deny_unknown_fields)]
pub enum Request {
    Tags {
        query: String,
        after: Option<String>,
    },
    Tag {
        id: Option<String>,
        name: String,
        color: String,
    },
    DeleteTag {
        id: String,
    },
    Assigned {
        ids: Vec<String>,
    },
    Tagging {
        ids: Vec<String>,
        tag: String,
        add: bool,
    },
    Pin {
        ids: Vec<String>,
        value: bool,
    },
    Recent {
        id: String,
        title: String,
        source: Option<String>,
        path: Option<String>,
    },
    Recents,
    Trash {
        ids: Vec<String>,
        restore: bool,
    },
    CollectionPlan {
        id: String,
    },
    DeleteCollection {
        id: String,
        plan: String,
        trash: bool,
    },
}
pub(crate) fn initialize(db: &Connection) -> Result<(), String> {
    db.execute_batch("CREATE TABLE IF NOT EXISTS tags(id TEXT PRIMARY KEY,name TEXT NOT NULL,normalized TEXT NOT NULL UNIQUE,color TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS resource_tags(resource_id TEXT NOT NULL REFERENCES resources(id),tag_id TEXT NOT NULL REFERENCES tags(id),PRIMARY KEY(resource_id,tag_id));
 CREATE INDEX IF NOT EXISTS tag_resources ON resource_tags(tag_id,resource_id);
 CREATE TABLE IF NOT EXISTS resource_state(resource_id TEXT PRIMARY KEY REFERENCES resources(id),trashed INTEGER NOT NULL DEFAULT 0,pinned INTEGER NOT NULL DEFAULT 0,opened INTEGER NOT NULL DEFAULT 0);
 CREATE TABLE IF NOT EXISTS recent_links(id TEXT PRIMARY KEY,title TEXT NOT NULL,source TEXT NOT NULL,path TEXT NOT NULL,opened INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS pending_deletions(id TEXT PRIMARY KEY);
 CREATE TRIGGER IF NOT EXISTS lifecycle_draft BEFORE INSERT ON drafts WHEN EXISTS(SELECT 1 FROM resource_state WHERE resource_id=new.resource_id AND trashed=1) BEGIN SELECT RAISE(ABORT,'Resource is in Trash'); END;
 CREATE TRIGGER IF NOT EXISTS lifecycle_save BEFORE UPDATE OF title,content ON resources WHEN EXISTS(SELECT 1 FROM resource_state WHERE resource_id=new.id AND trashed=1) BEGIN SELECT RAISE(ABORT,'Resource is in Trash'); END;
 CREATE TRIGGER IF NOT EXISTS collection_changed AFTER UPDATE ON collections BEGIN UPDATE search_generation SET value=value+1; END;
 CREATE TRIGGER IF NOT EXISTS org_state_insert AFTER INSERT ON resource_state BEGIN UPDATE search_generation SET value=value+1; END;
 CREATE TRIGGER IF NOT EXISTS org_state_update AFTER UPDATE ON resource_state BEGIN UPDATE search_generation SET value=value+1; END;
 CREATE TRIGGER IF NOT EXISTS org_tag_insert AFTER INSERT ON resource_tags BEGIN UPDATE search_generation SET value=value+1; END;
 CREATE TRIGGER IF NOT EXISTS org_tag_delete AFTER DELETE ON resource_tags BEGIN UPDATE search_generation SET value=value+1; END;") .map_err(error)
}
fn ids(ids: Vec<String>) -> Result<Vec<String>, String> {
    if ids.is_empty() || ids.len() > 100 {
        return Err("Choose 1–100 visible resources".into());
    }
    Ok(ids
        .into_iter()
        .collect::<std::collections::BTreeSet<_>>()
        .into_iter()
        .collect())
}
fn validate(db: &Connection, ids: &[String], unprotected: bool) -> Result<(), String> {
    for id in ids {
        let exists: bool = db
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM resources WHERE id=?1)",
                [id],
                |r| r.get(0),
            )
            .map_err(error)?;
        if !exists {
            return Err("Resource no longer exists; nothing changed".into());
        }
        if unprotected
            && db
                .query_row(
                    "SELECT EXISTS(SELECT 1 FROM drafts WHERE resource_id=?1)",
                    [id],
                    |r| r.get::<_, bool>(0),
                )
                .map_err(error)?
        {
            return Err(
                "Resolve protected drafts before changing lifecycle; nothing changed".into(),
            );
        }
    }
    Ok(())
}
impl Workspace {
    pub fn pending_cleanup(&self) -> Result<bool, String> {
        self.db
            .query_row("SELECT EXISTS(SELECT 1 FROM pending_deletions)", [], |r| {
                r.get(0)
            })
            .map_err(error)
    }
    pub(crate) fn organization(&mut self, r: Request) -> Result<Value, String> {
        match r {
            Request::Tags { query, after } => {
                if query.len() > 256 {
                    return Err("Tag query too long".into());
                }
                let mut q=self.db.prepare("SELECT t.id,t.name,t.color,t.normalized,(SELECT count(*) FROM resource_tags a WHERE a.tag_id=t.id AND NOT EXISTS(SELECT 1 FROM resource_state s WHERE s.resource_id=a.resource_id AND s.trashed=1)) FROM tags t WHERE instr(t.normalized,?1)>0 AND (?2 IS NULL OR t.normalized>?2) ORDER BY t.normalized LIMIT 101").map_err(error)?;
                let mut rows=q.query_map(params![query.trim().to_lowercase(),after],|r|Ok(json!({"id":r.get::<_,String>(0)?,"name":r.get::<_,String>(1)?,"color":r.get::<_,String>(2)?,"key":r.get::<_,String>(3)?,"count":r.get::<_,i64>(4)?}))).map_err(error)?.collect::<Result<Vec<_>,_>>().map_err(error)?;
                let next = if rows.len() > 100 {
                    rows.truncate(100);
                    rows.last().unwrap()["key"].clone()
                } else {
                    Value::Null
                };
                let exact: bool = self
                    .db
                    .query_row(
                        "SELECT EXISTS(SELECT 1 FROM tags WHERE normalized=?1)",
                        [query.trim().to_lowercase()],
                        |r| r.get(0),
                    )
                    .map_err(error)?;
                Ok(json!({"items":rows,"next":next,"exact":exact}))
            }
            Request::Tag { id, name, color } => {
                let name = title(&name)?;
                if color.len() != 7
                    || !color.starts_with('#')
                    || !color[1..].bytes().all(|c| c.is_ascii_hexdigit())
                {
                    return Err("Use a six-digit tag color".into());
                }
                let id = id.unwrap_or_else(|| Uuid::new_v4().to_string());
                self.db.execute("INSERT INTO tags VALUES(?1,?2,?3,?4) ON CONFLICT(id) DO UPDATE SET name=excluded.name,normalized=excluded.normalized,color=excluded.color",params![id,name,name.to_lowercase(),color]).map_err(error)?;
                Ok(json!({"id":id}))
            }
            Request::DeleteTag { id } => {
                let tx = self.db.transaction().map_err(error)?;
                tx.execute("DELETE FROM resource_tags WHERE tag_id=?1", [&id])
                    .map_err(error)?;
                tx.execute("DELETE FROM tags WHERE id=?1", [id])
                    .map_err(error)?;
                tx.commit().map_err(error)?;
                Ok(Value::Null)
            }
            Request::Assigned { ids: input } => {
                let selected = ids(input)?;
                let mut result = vec![];
                for id in selected {
                    let mut q = self
                        .db
                        .prepare(
                            "SELECT tag_id FROM resource_tags WHERE resource_id=?1 ORDER BY tag_id",
                        )
                        .map_err(error)?;
                    let tags = q
                        .query_map([&id], |r| r.get::<_, String>(0))
                        .map_err(error)?
                        .collect::<Result<Vec<_>, _>>()
                        .map_err(error)?;
                    result.push(json!({"id":id,"tags":tags}));
                }
                Ok(json!(result))
            }
            Request::Tagging {
                ids: input,
                tag,
                add,
            } => {
                let selected = ids(input)?;
                let tx = self.db.transaction().map_err(error)?;
                validate(&tx, &selected, false)?;
                let mut changed = 0;
                for id in &selected {
                    changed += tx
                        .execute(
                            if add {
                                "INSERT OR IGNORE INTO resource_tags VALUES(?1,?2)"
                            } else {
                                "DELETE FROM resource_tags WHERE resource_id=?1 AND tag_id=?2"
                            },
                            params![id, tag],
                        )
                        .map_err(error)?;
                }
                tx.commit().map_err(error)?;
                Ok(json!({"changed":changed}))
            }
            Request::Pin { ids: input, value } => {
                let selected = ids(input)?;
                let tx = self.db.transaction().map_err(error)?;
                validate(&tx, &selected, false)?;
                for id in selected {
                    tx.execute("INSERT INTO resource_state(resource_id,pinned) VALUES(?1,?2) ON CONFLICT(resource_id) DO UPDATE SET pinned=excluded.pinned",params![id,value]).map_err(error)?;
                }
                tx.commit().map_err(error)?;
                Ok(Value::Null)
            }
            Request::Recent {
                id,
                title,
                source,
                path,
            } => {
                if let (Some(source), Some(path)) = (source, path) {
                    if id.len() > 200
                        || title.len() > 960
                        || path.len() > 4096
                        || source.len() > 200
                    {
                        return Err("Invalid recent link".into());
                    }
                    self.db.execute("INSERT INTO recent_links VALUES(?1,?2,?3,?4,CAST(strftime('%s','now') AS INTEGER)) ON CONFLICT(id) DO UPDATE SET title=excluded.title,opened=excluded.opened",params![id,title,source,path]).map_err(error)?;
                    self.db.execute("DELETE FROM recent_links WHERE id NOT IN (SELECT id FROM recent_links ORDER BY opened DESC,id LIMIT 32)",[]).map_err(error)?;
                } else {
                    self.db.execute("INSERT INTO resource_state(resource_id,opened) VALUES(?1,CAST(strftime('%s','now') AS INTEGER)) ON CONFLICT(resource_id) DO UPDATE SET opened=excluded.opened WHERE opened<excluded.opened-15",[id]).map_err(error)?;
                }
                Ok(Value::Null)
            }
            Request::Recents => {
                let mut q=self.db.prepare("SELECT r.id,r.title,NULL,NULL,s.opened FROM resources r JOIN resource_state s ON s.resource_id=r.id WHERE s.trashed=0 AND s.opened>0 UNION ALL SELECT id,title,source,path,opened FROM recent_links ORDER BY 5 DESC,1 LIMIT 12").map_err(error)?;
                let result=q.query_map([],|r|Ok(json!({"id":r.get::<_,String>(0)?,"title":r.get::<_,String>(1)?,"source":r.get::<_,Option<String>>(2)?,"path":r.get::<_,Option<String>>(3)?}))).map_err(error)?.collect::<Result<Vec<_>,_>>().map_err(error)?;
                Ok(json!(result))
            }
            Request::Trash {
                ids: input,
                restore,
            } => {
                let selected = ids(input)?;
                let tx = self.db.transaction().map_err(error)?;
                validate(&tx, &selected, true)?;
                for id in selected {
                    tx.execute("INSERT INTO resource_state(resource_id,trashed) VALUES(?1,?2) ON CONFLICT(resource_id) DO UPDATE SET trashed=excluded.trashed",params![id,!restore]).map_err(error)?;
                }
                tx.commit().map_err(error)?;
                Ok(Value::Null)
            }
            Request::CollectionPlan { id } => self.collection_plan(&id),
            Request::DeleteCollection { id, plan, trash } => {
                let current = self.collection_plan(&id)?;
                if current.to_string() != plan {
                    return Err("Collection changed; review again".into());
                }
                let resource_ids = current["exclusive"]
                    .as_array()
                    .unwrap()
                    .iter()
                    .map(|v| v.as_str().unwrap().to_string())
                    .collect::<Vec<_>>();
                let tx = self.db.transaction().map_err(error)?;
                if trash {
                    validate(&tx, &resource_ids, true)?;
                    for resource in resource_ids {
                        tx.execute("INSERT INTO resource_state(resource_id,trashed) VALUES(?1,1) ON CONFLICT(resource_id) DO UPDATE SET trashed=1",[resource]).map_err(error)?;
                    }
                }
                for c in current["collections"].as_array().unwrap().iter().rev() {
                    let c = c.as_str().unwrap();
                    tx.execute("DELETE FROM memberships WHERE collection_id=?1", [c])
                        .map_err(error)?;
                    tx.execute("DELETE FROM collections WHERE id=?1", [c])
                        .map_err(error)?;
                }
                tx.commit().map_err(error)?;
                Ok(Value::Null)
            }
        }
    }
    fn collection_plan(&self, id: &str) -> Result<Value, String> {
        let mut q=self.db.prepare("WITH RECURSIVE branch(id,depth) AS (SELECT id,0 FROM collections WHERE id=?1 UNION ALL SELECT c.id,b.depth+1 FROM collections c JOIN branch b ON c.parent_id=b.id) SELECT id FROM branch ORDER BY depth,id").map_err(error)?;
        let collections = q
            .query_map([id], |r| r.get::<_, String>(0))
            .map_err(error)?
            .collect::<Result<Vec<_>, _>>()
            .map_err(error)?;
        if collections.is_empty() {
            return Err("Collection no longer exists".into());
        }
        let mut q=self.db.prepare("WITH RECURSIVE branch(id) AS (SELECT id FROM collections WHERE id=?1 UNION ALL SELECT c.id FROM collections c JOIN branch b ON c.parent_id=b.id) SELECT DISTINCT resource_id FROM memberships WHERE collection_id IN branch AND resource_id NOT IN (SELECT resource_id FROM memberships WHERE collection_id NOT IN branch) ORDER BY resource_id").map_err(error)?;
        let exclusive = q
            .query_map([id], |r| r.get::<_, String>(0))
            .map_err(error)?
            .collect::<Result<Vec<_>, _>>()
            .map_err(error)?;
        let generation: i64 = self
            .db
            .query_row("SELECT value FROM search_generation", [], |r| r.get(0))
            .map_err(error)?;
        Ok(json!({"collections":collections,"exclusive":exclusive,"generation":generation}))
    }
    /// Metadata commit precedes file removal. UUID cleanup receipt survives crashes and retries.
    pub(crate) fn purge_one(&mut self, id: &str) -> Result<Value, String> {
        let tx = self.db.transaction().map_err(error)?;
        validate(&tx, &[id.to_string()], true)?;
        if !tx
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM resource_state WHERE resource_id=?1 AND trashed=1)",
                [id],
                |r| r.get::<_, bool>(0),
            )
            .map_err(error)?
        {
            return Err("Only trashed resources can be permanently deleted".into());
        }
        tx.execute("INSERT OR IGNORE INTO pending_deletions VALUES(?1)", [id])
            .map_err(error)?;
        for table in [
            "resource_tags",
            "memberships",
            "resource_state",
            "managed_originals",
        ] {
            tx.execute(&format!("DELETE FROM {table} WHERE resource_id=?1"), [id])
                .map_err(error)?;
        }
        tx.execute("DELETE FROM resources WHERE id=?1", [id])
            .map_err(error)?;
        tx.commit().map_err(error)?;
        Ok(Value::Null)
    }
}
#[derive(Default, serde::Serialize, serde::Deserialize, Debug)]
#[serde(deny_unknown_fields)]
pub struct Archive {
    pub tags: Vec<(String, String, String)>,
    pub assignments: Vec<(String, String)>,
    pub states: Vec<(String, bool, bool, i64)>,
}
impl Archive {
    pub fn capture(
        db: &Connection,
        selected: &std::collections::HashSet<String>,
    ) -> Result<Self, String> {
        let mut q = db
            .prepare("SELECT id,name,color FROM tags ORDER BY id")
            .map_err(error)?;
        let tags = q
            .query_map([], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)))
            .map_err(error)?
            .collect::<Result<Vec<_>, _>>()
            .map_err(error)?;
        let mut q = db
            .prepare("SELECT resource_id,tag_id FROM resource_tags ORDER BY 1,2")
            .map_err(error)?;
        let assignments = q
            .query_map([], |r| Ok((r.get::<_, String>(0)?, r.get(1)?)))
            .map_err(error)?
            .collect::<Result<Vec<_>, _>>()
            .map_err(error)?
            .into_iter()
            .filter(|(id, _)| selected.contains(id))
            .collect();
        let mut q = db
            .prepare("SELECT resource_id,trashed,pinned,opened FROM resource_state ORDER BY 1")
            .map_err(error)?;
        let states = q
            .query_map([], |r| {
                Ok((r.get::<_, String>(0)?, r.get(1)?, r.get(2)?, r.get(3)?))
            })
            .map_err(error)?
            .collect::<Result<Vec<_>, _>>()
            .map_err(error)?
            .into_iter()
            .filter(|(id, _, _, _)| selected.contains(id))
            .collect();
        Ok(Self {
            tags,
            assignments,
            states,
        })
    }
    pub fn validate(&self, resources: &std::collections::HashSet<String>) -> Result<(), String> {
        if self.tags.len() > 20000 || self.assignments.len() > 200000 || self.states.len() > 20000 {
            return Err("Organization inventory too large".into());
        }
        let (mut tags, mut names, mut assignments, mut states) = (
            std::collections::HashSet::new(),
            std::collections::HashSet::new(),
            std::collections::HashSet::new(),
            std::collections::HashSet::new(),
        );
        for (id, name, color) in &self.tags {
            Uuid::parse_str(id).map_err(error)?;
            title(name)?;
            if !tags.insert(id)
                || !names.insert(name.trim().to_lowercase())
                || color.len() != 7
                || !color.starts_with('#')
                || !color[1..].bytes().all(|c| c.is_ascii_hexdigit())
            {
                return Err("Invalid tag inventory".into());
            }
        }
        for (r, t) in &self.assignments {
            if !resources.contains(r) || !tags.contains(t) || !assignments.insert((r, t)) {
                return Err("Invalid tag assignment inventory".into());
            }
        }
        for (r, _, _, opened) in &self.states {
            if !resources.contains(r) || !states.insert(r) || *opened < 0 {
                return Err("Invalid lifecycle inventory".into());
            }
        }
        Ok(())
    }
    pub fn restore(&self, db: &Connection) -> Result<(), String> {
        for (id, name, color) in &self.tags {
            db.execute(
                "INSERT INTO tags VALUES(?1,?2,?3,?4)",
                params![id, name, name.trim().to_lowercase(), color],
            )
            .map_err(error)?;
        }
        for (r, t) in &self.assignments {
            db.execute("INSERT INTO resource_tags VALUES(?1,?2)", params![r, t])
                .map_err(error)?;
        }
        for (r, trash, pin, opened) in &self.states {
            db.execute(
                "INSERT INTO resource_state VALUES(?1,?2,?3,?4)",
                params![r, trash, pin, opened],
            )
            .map_err(error)?;
        }
        Ok(())
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::Request as D;
    fn note(w: &mut Workspace) -> String {
        w.execute(D::CreateNote {
            title: "Note".into(),
            collection: None,
        })
        .unwrap()["id"]
            .as_str()
            .unwrap()
            .into()
    }
    fn query(w: &Workspace, view: &str, tag: Option<String>) -> Value {
        w.search(
            crate::search::SearchOptions {
                query: "".into(),
                content: false,
                collection: None,
                order: "created".into(),
                view: view.into(),
                tag,
            },
            None,
            None,
        )
        .unwrap()
    }
    #[test]
    fn tags_identity_bulk_counts_restart_and_archive() {
        let dir = tempfile::tempdir().unwrap();
        let mut w = Workspace::open(dir.path()).unwrap();
        let a = note(&mut w);
        let b = note(&mut w);
        let tag = w
            .organization(Request::Tag {
                id: None,
                name: "Research".into(),
                color: "#6688aa".into(),
            })
            .unwrap()["id"]
            .as_str()
            .unwrap()
            .to_string();
        assert!(w
            .organization(Request::Tag {
                id: None,
                name: " research ".into(),
                color: "#6688aa".into()
            })
            .is_err());
        assert!(w
            .organization(Request::Tagging {
                ids: vec![a.clone(), "missing".into()],
                tag: tag.clone(),
                add: true
            })
            .is_err());
        assert_eq!(query(&w, "library", Some(tag.clone()))["total"], 0);
        w.organization(Request::Tagging {
            ids: vec![a.clone(), b.clone()],
            tag: tag.clone(),
            add: true,
        })
        .unwrap();
        w.organization(Request::Pin {
            ids: vec![a.clone()],
            value: true,
        })
        .unwrap();
        w.organization(Request::Tag {
            id: Some(tag.clone()),
            name: "Renamed".into(),
            color: "#998877".into(),
        })
        .unwrap();
        assert_eq!(query(&w, "pinned", Some(tag.clone()))["total"], 1);
        let selected = std::collections::HashSet::from([a.clone(), b.clone()]);
        let archive = Archive::capture(&w.db, &selected).unwrap();
        archive.validate(&selected).unwrap();
        drop(w);
        let mut w = Workspace::open(dir.path()).unwrap();
        let tags = w
            .organization(Request::Tags {
                query: "NAME".into(),
                after: None,
            })
            .unwrap();
        assert_eq!(tags["items"][0]["count"], 2);
        assert_eq!(tags["items"][0]["name"], "Renamed");
        w.organization(Request::DeleteTag { id: tag.clone() })
            .unwrap();
        assert_eq!(query(&w, "library", Some(tag))["total"], 0);
        assert_eq!(query(&w, "library", None)["total"], 2);
    }
    #[test]
    fn lifecycle_preserves_metadata_and_refuses_drafts_and_active_purge() {
        let dir = tempfile::tempdir().unwrap();
        let mut w = Workspace::open(dir.path()).unwrap();
        let a = note(&mut w);
        assert!(w.purge_one(&a).is_err());
        w.execute(D::Draft {
            id: a.clone(),
            base_revision: 1,
            token: "token".into(),
            sequence: 1,
            title: "Protected".into(),
            content: json!({"type":"doc","content":[]}),
        })
        .unwrap();
        assert!(w
            .organization(Request::Trash {
                ids: vec![a.clone()],
                restore: false
            })
            .is_err());
        w.execute(D::DiscardDraft {
            id: a.clone(),
            token: "token".into(),
            sequence: 1,
        })
        .unwrap();
        w.organization(Request::Pin {
            ids: vec![a.clone()],
            value: true,
        })
        .unwrap();
        w.organization(Request::Trash {
            ids: vec![a.clone()],
            restore: false,
        })
        .unwrap();
        assert_eq!(query(&w, "library", None)["total"], 0);
        assert_eq!(query(&w, "trash", None)["total"], 1);
        assert!(w.execute(D::Read { id: a.clone() }).is_err());
        assert!(w
            .execute(D::Save {
                id: a.clone(),
                revision: 1,
                title: "Late writer".into(),
                content: json!({"type":"doc","content":[]}),
                proof: None
            })
            .is_err());
        w.organization(Request::Trash {
            ids: vec![a.clone()],
            restore: true,
        })
        .unwrap();
        assert_eq!(query(&w, "pinned", None)["total"], 1);
        w.organization(Request::Trash {
            ids: vec![a.clone()],
            restore: false,
        })
        .unwrap();
        w.purge_one(&a).unwrap();
        assert_eq!(query(&w, "trash", None)["total"], 0);
        assert_eq!(
            w.db.query_row("SELECT count(*) FROM pending_deletions", [], |r| r
                .get::<_, i64>(0))
                .unwrap(),
            1
        );
    }
    #[test]
    fn collection_review_keeps_shared_resources_and_rejects_stale_plan() {
        let dir = tempfile::tempdir().unwrap();
        let mut w = Workspace::open(dir.path()).unwrap();
        let a = note(&mut w);
        let b = note(&mut w);
        let branch = w.collection(None, "Branch".into(), None).unwrap()["id"]
            .as_str()
            .unwrap()
            .to_string();
        let outside = w.collection(None, "Outside".into(), None).unwrap()["id"]
            .as_str()
            .unwrap()
            .to_string();
        w.bulk_membership(vec![a.clone(), b.clone()], Some(branch.clone()), None)
            .unwrap();
        w.membership(b.clone(), Some(outside.clone()), None)
            .unwrap();
        let plan = w.collection_plan(&branch).unwrap();
        assert_eq!(plan["exclusive"], json!([a.clone()]));
        w.collection(Some(branch.clone()), "Renamed".into(), None)
            .unwrap();
        assert!(w
            .organization(Request::DeleteCollection {
                id: branch.clone(),
                plan: plan.to_string(),
                trash: true
            })
            .is_err());
        let plan = w.collection_plan(&branch).unwrap();
        w.organization(Request::DeleteCollection {
            id: branch,
            plan: plan.to_string(),
            trash: true,
        })
        .unwrap();
        assert_eq!(query(&w, "trash", None)["total"], 1);
        assert_eq!(query(&w, "library", None)["total"], 1);
        assert_eq!(w.memberships(b).unwrap()["members"], json!([outside]));
    }
    #[test]
    fn tag_pages_and_recent_throttle() {
        let dir = tempfile::tempdir().unwrap();
        let mut w = Workspace::open(dir.path()).unwrap();
        for i in 0..110 {
            w.organization(Request::Tag {
                id: None,
                name: format!("Tag {i:03}"),
                color: "#334455".into(),
            })
            .unwrap();
        }
        let first = w
            .organization(Request::Tags {
                query: "".into(),
                after: None,
            })
            .unwrap();
        assert_eq!(first["items"].as_array().unwrap().len(), 100);
        assert_eq!(
            w.organization(Request::Tags {
                query: "".into(),
                after: Some(first["next"].as_str().unwrap().into())
            })
            .unwrap()["items"]
                .as_array()
                .unwrap()
                .len(),
            10
        );
        let a = note(&mut w);
        for _ in 0..2 {
            w.organization(Request::Recent {
                id: a.clone(),
                title: "Note".into(),
                source: None,
                path: None,
            })
            .unwrap();
        }
        assert_eq!(
            w.organization(Request::Recents)
                .unwrap()
                .as_array()
                .unwrap()
                .len(),
            1
        );
        assert_eq!(query(&w, "recent", None)["total"], 1);
    }
}
