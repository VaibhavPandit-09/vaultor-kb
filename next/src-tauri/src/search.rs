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
    #[serde(default)]
    pub view: String,
    #[serde(default)]
    pub tag: Option<String>,
    #[serde(default)]
    pub kind: Option<String>,
    #[serde(default)]
    pub tags: Vec<String>,
    #[serde(default)]
    pub any_tag: bool,
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
// Position ranges use UTF-16 offsets because the renderer passes them to String.slice.
fn search_snippet(raw: &str) -> Option<Value> {
    let mut text = String::new();
    let mut highlights = Vec::new();
    let mut position = 0;
    let mut start = None;
    for ch in raw.chars() {
        match ch {
            '\u{1}' => { start = Some(position); }
            '\u{2}' => {
                if let Some(from)=start.take().filter(|from|*from<position) {
                    highlights.push(json!({"start":from,"end":position}));
                }
            }
            _ => {
                if position + ch.len_utf16() > 400 { break; }
                text.push(ch);
                position += ch.len_utf16();
            }
        }
    }
    (!text.trim().is_empty()).then(|| json!({"text":text,"highlights":highlights}))
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
        if options.tags.len()>12 || options.tags.iter().any(|tag|tag.len()>128) { return Err("Choose up to 12 tags".into()); }
        let tag_list = serde_json::to_string(&options.tags).map_err(error)?;
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
        let rank_key = "printf('%d',CASE WHEN lower(r.title)=lower(trim(?12)) THEN 0 WHEN instr(lower(r.title),lower(trim(?12)))>0 THEN 1 ELSE 2 END)||lower(r.title)";
        let (key, sort, comparison) = if options.view == "recent" {
            let k =
                "printf('%020d',(SELECT opened FROM resource_state s WHERE s.resource_id=r.id))";
            (k,"(SELECT opened FROM resource_state s WHERE s.resource_id=r.id) DESC,r.seq DESC","(printf('%020d',(SELECT opened FROM resource_state s WHERE s.resource_id=r.id)) < ?4 OR (printf('%020d',(SELECT opened FROM resource_state s WHERE s.resource_id=r.id)) = ?4 AND r.seq < ?5))")
        } else {
            match options.order.as_str() {
                "match" => (rank_key, "6,r.seq", ""),
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
            }
        };
        let comparison = if options.order=="match" && options.view!="recent" {
            format!("(({rank_key}) > ?4 OR (({rank_key}) = ?4 AND r.seq > ?5))")
        } else { comparison.to_string() };
        let filtered = !options.query.trim().is_empty();
        if filtered && tokens.is_empty() {
            return Ok(json!({"items":[],"next":null,"total":0}));
        }
        if !matches!(
            options.view.as_str(),
            "" | "library" | "pinned" | "recent" | "trash"
        ) && !options.view.strip_prefix("source:").is_some_and(|id| uuid::Uuid::parse_str(id).is_ok()) {
            return Err("Unknown resource scope".into());
        }
        let kind=options.kind.as_deref().unwrap_or("all");
        let kind_predicate=match kind {"all"=>"1".to_owned(),"linked"=>"r.id LIKE 'linked:%'".into(),"managed"=>"r.id NOT LIKE 'linked:%'".into(),"note"=>"r.id NOT LIKE 'linked:%' AND NOT EXISTS(SELECT 1 FROM managed_originals o WHERE o.resource_id=r.id AND o.kind='file')".into(),"file"=>"EXISTS(SELECT 1 FROM managed_originals o WHERE o.resource_id=r.id AND o.kind='file')".into(),k if crate::file_category::CATEGORIES.contains(&k)=>format!("{}='{k}'",crate::file_category::for_resource("r.id")),_=>return Err("Unsupported resource type".into())};
        let predicate=format!("(?1 IS NULL OR r.id IN (SELECT resource_id FROM memberships WHERE collection_id=?1)) AND COALESCE((SELECT trashed FROM resource_state s WHERE s.resource_id=r.id),0)=?7 AND (?8 IS NULL OR r.id IN (SELECT resource_id FROM resource_tags WHERE tag_id=?8)) AND (?9!='pinned' OR r.id IN (SELECT resource_id FROM resource_state WHERE pinned=1)) AND (?9!='recent' OR r.id IN (SELECT resource_id FROM resource_state WHERE opened>0)) AND (substr(?9,1,7)!='source:' OR r.id IN (SELECT i.resource_id FROM linked_inventory i JOIN linked_documents d ON d.id=i.document_id WHERE d.source_id=substr(?9,8))) AND (json_array_length(?10)=0 OR (?11 AND EXISTS(SELECT 1 FROM resource_tags t JOIN json_each(?10) j ON j.value=t.tag_id WHERE t.resource_id=r.id)) OR (NOT ?11 AND NOT EXISTS(SELECT 1 FROM json_each(?10) j WHERE NOT EXISTS(SELECT 1 FROM resource_tags t WHERE t.resource_id=r.id AND t.tag_id=j.value)))) AND ?12 IS NOT NULL AND {kind_predicate} AND {}",if filtered {"r.seq IN (SELECT rowid FROM note_search WHERE note_search MATCH ?2)"}else{"?2 IS NULL"});
        let expr = if filtered { Some(expression) } else { None };
        let total: i64 = self
            .db
            .query_row(
                &format!("SELECT count(*) FROM visible_resources r WHERE {predicate}"),
                params![
                    options.collection,
                    expr,
                    rusqlite::types::Value::Null,
                    rusqlite::types::Value::Null,
                    rusqlite::types::Value::Null,
                    rusqlite::types::Value::Null,
                    options.view == "trash",
                    options.tag,
                    options.view,
                    tag_list,
                    options.any_tag,
                    options.query
                ],
                |r| r.get(0),
            )
            .map_err(error)?;
        let limit = limit.unwrap_or(100).clamp(1, 100) as usize;
        let category=crate::file_category::for_resource("r.id");
        let excerpt = if options.content && filtered {
            "(SELECT snippet(note_search,1,char(1),char(2),' ... ',24) FROM note_search WHERE rowid=r.seq AND note_search MATCH ?2)"
        } else { "NULL" };
        let sql=format!("SELECT r.seq,r.id,r.title,r.revision,r.updated_at,{key},CASE WHEN r.id LIKE 'linked:%' THEN 'linked' ELSE COALESCE((SELECT kind FROM managed_originals WHERE resource_id=r.id),'note') END,{category},{excerpt},(SELECT d.path FROM linked_documents d WHERE d.id=substr(r.id,8) AND r.id LIKE 'linked:%') FROM visible_resources r WHERE {predicate} AND (?3=0 OR {comparison}) ORDER BY {sort} LIMIT ?6");
        let seq = cursor.as_ref().map_or(0, |c| c.seq);
        // Created uses integer comparison, other sorts compare text keys.
        let pivot = if options.order == "created" && options.view != "recent" {
            rusqlite::types::Value::Integer(seq)
        } else {
            rusqlite::types::Value::Text(cursor.as_ref().map_or(String::new(), |c| c.key.clone()))
        };
        let mut stmt = self.db.prepare(&sql).map_err(error)?;
        let mut rows=stmt.query_map(params![options.collection,expr,cursor.is_some(),pivot,seq,(limit+1) as i64,options.view=="trash",options.tag,options.view,tag_list,options.any_tag,options.query],|r|{
            let key=if options.order=="created" && options.view!="recent" {r.get::<_,i64>(0)?.to_string()}else{r.get::<_,String>(5)?};
            Ok((r.get::<_,i64>(0)?,key,json!({"id":r.get::<_,String>(1)?,"title":r.get::<_,String>(2)?,"revision":r.get::<_,i64>(3)?,"updatedAt":r.get::<_,String>(4)?,"kind":r.get::<_,String>(6)?,"fileCategory":r.get::<_,String>(7)?,"searchSnippet":r.get::<_,Option<String>>(8)?.as_deref().and_then(search_snippet),"sourcePath":r.get::<_,Option<String>>(9)?})))
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
