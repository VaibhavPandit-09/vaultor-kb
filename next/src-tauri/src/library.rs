use crate::domain::{error, title, Workspace};
use rusqlite::params;
use serde::Deserialize;
use serde_json::{json, Value};
use uuid::Uuid;

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Cursor {
    before: i64,
    anchor: i64,
    scope: Option<String>,
}
impl Workspace {
    pub(crate) fn memberships(&self, id: String) -> Result<Value, String> {
        let name: String = self
            .db
            .query_row("SELECT title FROM resources WHERE id=?1", [&id], |r| {
                r.get(0)
            })
            .map_err(error)?;
        let mut stmt = self
            .db
            .prepare(
                "SELECT collection_id FROM memberships WHERE resource_id=?1 ORDER BY collection_id",
            )
            .map_err(error)?;
        let members = stmt
            .query_map([id], |r| r.get::<_, String>(0))
            .map_err(error)?
            .collect::<Result<Vec<_>, _>>()
            .map_err(error)?;
        Ok(json!({"title":name,"members":members}))
    }
    pub(crate) fn list(
        &self,
        collection: Option<String>,
        cursor: Option<Cursor>,
        limit: Option<u32>,
    ) -> Result<Value, String> {
        let limit = limit.unwrap_or(100).clamp(1, 100) as usize;
        let max: i64 = self
            .db
            .query_row("SELECT COALESCE(MAX(seq),0) FROM resources", [], |r| {
                r.get(0)
            })
            .map_err(error)?;
        let (before, anchor) = match cursor {
            Some(c) if c.scope == collection && c.before > 0 && c.anchor >= 0 => {
                (c.before, c.anchor)
            }
            Some(_) => return Err("Cursor does not belong to this collection".into()),
            None => (i64::MAX, max),
        };
        let where_clause = if collection.is_some() {
            "AND id IN (SELECT resource_id FROM memberships WHERE collection_id=?3)"
        } else {
            "AND ?3 IS NULL"
        };
        let sql=format!("SELECT seq,id,title,revision,updated_at,COALESCE((SELECT kind FROM managed_originals WHERE resource_id=resources.id),'note') FROM resources WHERE seq<?1 AND seq<=?2 {where_clause} ORDER BY seq DESC LIMIT ?4");
        let mut stmt = self.db.prepare(&sql).map_err(error)?;
        let mut rows=stmt.query_map(params![before,anchor,collection,(limit+1) as i64],|r|Ok((r.get::<_,i64>(0)?,json!({"id":r.get::<_,String>(1)?,"title":r.get::<_,String>(2)?,"revision":r.get::<_,i64>(3)?,"updatedAt":r.get::<_,String>(4)?,"kind":r.get::<_,String>(5)?})))).map_err(error)?.collect::<Result<Vec<_>,_>>().map_err(error)?;
        let has_more = rows.len() > limit;
        rows.truncate(limit);
        let next = if has_more {
            json!({"before":rows.last().unwrap().0,"anchor":anchor,"scope":collection})
        } else {
            Value::Null
        };
        let total:i64=self.db.query_row("SELECT COUNT(*) FROM resources WHERE seq<=?1 AND (?2 IS NULL OR id IN (SELECT resource_id FROM memberships WHERE collection_id=?2))",params![anchor,collection],|r|r.get(0)).map_err(error)?;
        Ok(
            json!({"items":rows.into_iter().map(|(_,v)|v).collect::<Vec<_>>(),"next":next,"total":total}),
        )
    }
    pub(crate) fn collection(
        &mut self,
        id: Option<String>,
        name: String,
        parent: Option<String>,
    ) -> Result<Value, String> {
        let name = title(&name)?;
        let tx = self.db.transaction().map_err(error)?;
        if let Some(parent) = &parent {
            let exists: bool = tx
                .query_row(
                    "SELECT EXISTS(SELECT 1 FROM collections WHERE id=?1)",
                    [parent],
                    |r| r.get(0),
                )
                .map_err(error)?;
            if !exists {
                return Err("Parent collection not found".into());
            }
            if let Some(id) = &id {
                let cycle:bool=tx.query_row("WITH RECURSIVE descendants(id) AS (SELECT id FROM collections WHERE id=?1 UNION ALL SELECT c.id FROM collections c JOIN descendants d ON c.parent_id=d.id) SELECT EXISTS(SELECT 1 FROM descendants WHERE id=?2)",params![id,parent],|r|r.get(0)).map_err(error)?;
                if cycle {
                    return Err("A collection cannot contain itself or its ancestor".into());
                }
            }
        }
        let id = if let Some(id) = id {
            if tx
                .execute(
                    "UPDATE collections SET name=?1,normalized=?2,parent_id=?3 WHERE id=?4",
                    params![name, name.to_lowercase(), parent, id],
                )
                .map_err(error)?
                != 1
            {
                return Err("Collection not found".into());
            }
            id
        } else {
            let id = Uuid::new_v4().to_string();
            tx.execute(
                "INSERT INTO collections VALUES(?1,?2,?3,?4)",
                params![id, name, name.to_lowercase(), parent],
            )
            .map_err(error)?;
            id
        };
        tx.commit().map_err(error)?;
        Ok(json!({"id":id,"name":name,"parentId":parent}))
    }
    pub(crate) fn membership(
        &mut self,
        id: String,
        add: Option<String>,
        remove: Option<String>,
    ) -> Result<Value, String> {
        self.bulk_membership(vec![id], add, remove)
    }
    pub(crate) fn bulk_membership(
        &mut self,
        ids: Vec<String>,
        add: Option<String>,
        remove: Option<String>,
    ) -> Result<Value, String> {
        if ids.is_empty() || ids.len() > 100 {
            return Err("Choose 1–100 resources from the current page".into());
        }
        let ids: std::collections::BTreeSet<_> = ids.into_iter().collect();
        if add.is_none() && remove.is_none() {
            return Err("Choose a membership operation".into());
        }
        let tx = self.db.transaction().map_err(error)?;
        for id in &ids {
            if !tx
                .query_row(
                    "SELECT EXISTS(SELECT 1 FROM resources WHERE id=?1)",
                    [id],
                    |r| r.get::<_, bool>(0),
                )
                .map_err(error)?
            {
                return Err("A selected resource no longer exists; nothing was changed".into());
            }
        }
        for collection in [&add, &remove].into_iter().flatten() {
            if !tx
                .query_row(
                    "SELECT EXISTS(SELECT 1 FROM collections WHERE id=?1)",
                    [collection],
                    |r| r.get::<_, bool>(0),
                )
                .map_err(error)?
            {
                return Err("Collection no longer exists; nothing was changed".into());
            }
        }
        let (mut added, mut removed, mut unchanged) = (0, 0, 0);
        for id in &ids {
            let mut changes = 0;
            if add != remove {
                if let Some(add) = &add {
                    let n = tx
                        .execute(
                            "INSERT OR IGNORE INTO memberships VALUES(?1,?2)",
                            params![id, add],
                        )
                        .map_err(error)?;
                    added += n;
                    changes += n;
                }
                if let Some(remove) = &remove {
                    let n = tx
                        .execute(
                            "DELETE FROM memberships WHERE resource_id=?1 AND collection_id=?2",
                            params![id, remove],
                        )
                        .map_err(error)?;
                    removed += n;
                    changes += n;
                }
            }
            if changes == 0 {
                unchanged += 1;
            }
        }
        tx.commit().map_err(error)?;
        Ok(json!({"requested":ids.len(),"added":added,"removed":removed,"unchanged":unchanged}))
    }
}
