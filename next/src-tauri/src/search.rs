use crate::domain::{error, Workspace};
use rusqlite::params;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SearchOptions {
    pub query: String,
    pub content: bool,
    pub collection: Option<String>,
    pub order: String,
}
#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SearchCursor {
    options: SearchOptions,
    generation: i64,
    seq: i64,
    key: String,
}
// Installed once for M2/M3 workspaces. Triggers own index/generation atomically with saves.
pub(crate) fn initialize(db: &mut rusqlite::Connection) -> Result<(), String> {
    let exists: bool = db
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE name='note_search')",
            [],
            |r| r.get(0),
        )
        .map_err(error)?;
    if exists {
        return Ok(());
    }
    let tx = db.transaction().map_err(error)?;
    tx.execute_batch("CREATE VIRTUAL TABLE note_search USING fts5(title,body,tokenize='unicode61 remove_diacritics 2',prefix='2 3');
      CREATE TABLE search_generation(value INTEGER NOT NULL); INSERT INTO search_generation VALUES(0);
      CREATE INDEX resource_title_sort ON resources(lower(title),seq);
      CREATE INDEX resource_updated_sort ON resources(updated_at DESC,seq DESC);
      INSERT INTO note_search(rowid,title,body) SELECT seq,title,COALESCE((SELECT group_concat(value,' ') FROM json_tree(resources.content) WHERE key='text' AND type='text'),'') FROM resources;
      CREATE TRIGGER search_insert AFTER INSERT ON resources BEGIN
        INSERT INTO note_search(rowid,title,body) VALUES(new.seq,new.title,COALESCE((SELECT group_concat(value,' ') FROM json_tree(new.content) WHERE key='text' AND type='text'),''));
        UPDATE search_generation SET value=value+1; END;
      CREATE TRIGGER search_update AFTER UPDATE OF title,content ON resources BEGIN
        DELETE FROM note_search WHERE rowid=old.seq;
        INSERT INTO note_search(rowid,title,body) VALUES(new.seq,new.title,COALESCE((SELECT group_concat(value,' ') FROM json_tree(new.content) WHERE key='text' AND type='text'),''));
        UPDATE search_generation SET value=value+1; END;
      CREATE TRIGGER search_delete AFTER DELETE ON resources BEGIN DELETE FROM note_search WHERE rowid=old.seq; UPDATE search_generation SET value=value+1; END;
      CREATE TRIGGER search_member_insert AFTER INSERT ON memberships BEGIN UPDATE search_generation SET value=value+1; END;
      CREATE TRIGGER search_member_delete AFTER DELETE ON memberships BEGIN UPDATE search_generation SET value=value+1; END;") .map_err(error)?;
    tx.commit().map_err(error)
}
impl Workspace {
    pub(crate) fn search(
        &self,
        options: SearchOptions,
        cursor: Option<SearchCursor>,
        limit: Option<u32>,
    ) -> Result<Value, String> {
        if options.query.chars().count() > 256 {
            return Err("Search is limited to 256 characters".into());
        }
        let tokens: Vec<_> = options
            .query
            .split(|c: char| !c.is_alphanumeric())
            .filter(|s| !s.is_empty())
            .collect();
        if tokens.len() > 12 {
            return Err("Use up to 12 search words".into());
        }
        let expression = tokens
            .iter()
            .map(|t| format!("\"{}\"*", t.replace('"', "\"\"")))
            .collect::<Vec<_>>()
            .join(" AND ");
        let expression = if options.content {
            expression
        } else {
            format!("title: ({expression})")
        };
        let generation: i64 = self
            .db
            .query_row("SELECT value FROM search_generation", [], |r| r.get(0))
            .map_err(error)?;
        if let Some(c) = &cursor {
            if c.options != options || c.generation != generation {
                return Err("Search changed; refresh results to continue paging".into());
            }
        }
        let (key, sort, comparison) = match options.order.as_str() {
            "created" => ("r.seq", "r.seq DESC", "r.seq < ?4"),
            "updated" => (
                "r.updated_at",
                "r.updated_at DESC,r.seq DESC",
                "(r.updated_at < ?4 OR (r.updated_at = ?4 AND r.seq < ?5))",
            ),
            "title" => (
                "lower(r.title)",
                "lower(r.title),r.seq",
                "(lower(r.title) > ?4 OR (lower(r.title) = ?4 AND r.seq > ?5))",
            ),
            _ => return Err("Unsupported search order".into()),
        };
        let filtered = !options.query.trim().is_empty();
        if filtered && tokens.is_empty() {
            return Ok(json!({"items":[],"next":null,"total":0}));
        }
        let predicate=format!("(?1 IS NULL OR r.id IN (SELECT resource_id FROM memberships WHERE collection_id=?1)) AND {}",if filtered {"r.seq IN (SELECT rowid FROM note_search WHERE note_search MATCH ?2)"}else{"?2 IS NULL"});
        let expr = if filtered { Some(expression) } else { None };
        let total: i64 = self
            .db
            .query_row(
                &format!("SELECT count(*) FROM resources r WHERE {predicate}"),
                params![options.collection, expr],
                |r| r.get(0),
            )
            .map_err(error)?;
        let limit = limit.unwrap_or(100).clamp(1, 100) as usize;
        let sql=format!("SELECT r.seq,r.id,r.title,r.revision,r.updated_at,{key} FROM resources r WHERE {predicate} AND (?3=0 OR {comparison}) ORDER BY {sort} LIMIT ?6");
        let seq = cursor.as_ref().map_or(0, |c| c.seq);
        // Created uses integer comparison, other sorts compare text keys.
        let pivot = if options.order == "created" {
            rusqlite::types::Value::Integer(seq)
        } else {
            rusqlite::types::Value::Text(cursor.as_ref().map_or(String::new(), |c| c.key.clone()))
        };
        let mut stmt = self.db.prepare(&sql).map_err(error)?;
        let mut rows=stmt.query_map(params![options.collection,expr,cursor.is_some(),pivot,seq,(limit+1) as i64],|r|{
            let key=if options.order=="created" {r.get::<_,i64>(0)?.to_string()}else{r.get::<_,String>(5)?};
            Ok((r.get::<_,i64>(0)?,key,json!({"id":r.get::<_,String>(1)?,"title":r.get::<_,String>(2)?,"revision":r.get::<_,i64>(3)?,"updatedAt":r.get::<_,String>(4)?})))
        }).map_err(error)?.collect::<Result<Vec<_>,_>>().map_err(error)?;
        let more = rows.len() > limit;
        rows.truncate(limit);
        let next = if more {
            let row = rows.last().unwrap();
            json!(SearchCursor {
                options: options.clone(),
                generation,
                seq: row.0,
                key: row.1.clone()
            })
        } else {
            Value::Null
        };
        Ok(
            json!({"items":rows.into_iter().map(|r|r.2).collect::<Vec<_>>(),"next":next,"total":total}),
        )
    }
}
