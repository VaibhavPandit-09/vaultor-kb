use crate::domain::{error, title, Workspace};
use rusqlite::{params, OptionalExtension};
use serde::Deserialize;
use serde_json::{json, Value};
#[derive(Debug, Deserialize)]
pub struct Proof {
    pub token: String,
    pub sequence: i64,
}
pub(crate) fn document(content: &Value) -> Result<String, String> {
    if content.get("type").and_then(Value::as_str) != Some("doc")
        || !content.get("content").is_some_and(Value::is_array)
    {
        return Err("Expected structured Tiptap document".into());
    }
    let bytes = serde_json::to_string(content).map_err(error)?;
    if bytes.len() > 8 * 1024 * 1024 {
        return Err("Note exceeds the 8 MiB limit".into());
    }
    Ok(bytes)
}
impl Workspace {
    pub(crate) fn draft(
        &mut self,
        id: String,
        base: i64,
        token: String,
        sequence: i64,
        name: String,
        content: Value,
    ) -> Result<Value, String> {
        if token.is_empty() || sequence < 1 || name.chars().count() > 240 {
            return Err("Invalid draft identity or title".into());
        }
        let content = document(&content)?;
        let tx = self.db.transaction().map_err(error)?;
        let existing: Option<(String, i64)> = tx
            .query_row(
                "SELECT token,sequence FROM drafts WHERE resource_id=?1",
                [&id],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .optional()
            .map_err(error)?;
        if let Some((old, seq)) = &existing {
            if old != &token {
                return Err("Review the existing recovered draft before editing".into());
            }
            if *seq > sequence {
                return Err("A newer protected draft already exists".into());
            }
        }
        let (count,bytes):(i64,i64)=tx.query_row("SELECT COUNT(*),COALESCE(SUM(length(CAST(content AS BLOB))),0) FROM drafts WHERE resource_id<>?1",[&id],|r|Ok((r.get(0)?,r.get(1)?))).map_err(error)?;
        if count >= 64 || bytes + content.len() as i64 > 32 * 1024 * 1024 {
            return Err("Recovery storage is full (64 notes / 32 MiB). Review existing drafts; older evidence is retained.".into());
        }
        // A repeated sequence is only an idempotent retry of the exact protected evidence.
        if existing.as_ref().is_some_and(|(_, seq)| *seq == sequence) {
            let same:bool=tx.query_row("SELECT base_revision=?2 AND title=?3 AND content=?4 FROM drafts WHERE resource_id=?1",params![id,base,name,content],|r|r.get(0)).map_err(error)?;
            return if same {
                Ok(json!({"sequence":sequence}))
            } else {
                Err("Draft sequence collision".into())
            };
        }
        tx.execute("INSERT INTO drafts(resource_id,base_revision,token,sequence,title,content) VALUES(?1,?2,?3,?4,?5,?6) ON CONFLICT(resource_id) DO UPDATE SET base_revision=excluded.base_revision,token=excluded.token,sequence=excluded.sequence,title=excluded.title,content=excluded.content,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')",params![id,base,token,sequence,name,content]).map_err(error)?;
        tx.commit().map_err(error)?;
        Ok(json!({"sequence":sequence}))
    }
    pub(crate) fn drafts(&self) -> Result<Value, String> {
        let mut stmt=self.db.prepare("SELECT resource_id,base_revision,token,sequence,title,updated_at FROM drafts ORDER BY updated_at DESC,resource_id").map_err(error)?;
        let rows=stmt.query_map([],|r|Ok(json!({"id":r.get::<_,String>(0)?,"baseRevision":r.get::<_,i64>(1)?,"token":r.get::<_,String>(2)?,"sequence":r.get::<_,i64>(3)?,"title":r.get::<_,String>(4)?,"updatedAt":r.get::<_,String>(5)?}))).map_err(error)?.collect::<Result<Vec<_>,_>>().map_err(error)?;
        Ok(json!(rows))
    }
    pub(crate) fn read_draft(&self, id: String) -> Result<Value, String> {
        self.db.query_row("SELECT base_revision,token,sequence,title,content FROM drafts WHERE resource_id=?1",[&id],|r|Ok(json!({"id":id,"baseRevision":r.get::<_,i64>(0)?,"token":r.get::<_,String>(1)?,"sequence":r.get::<_,i64>(2)?,"title":r.get::<_,String>(3)?,"content":r.get::<_,String>(4)?}))).map_err(error).and_then(|mut v|{v["content"]=serde_json::from_str(v["content"].as_str().unwrap()).map_err(error)?;Ok(v)})
    }
    pub(crate) fn discard_draft(
        &mut self,
        id: String,
        token: String,
        sequence: i64,
    ) -> Result<Value, String> {
        if self
            .db
            .execute(
                "DELETE FROM drafts WHERE resource_id=?1 AND token=?2 AND sequence=?3",
                params![id, token, sequence],
            )
            .map_err(error)?
            != 1
        {
            return Err("Recovery evidence changed; review it again".into());
        }
        Ok(Value::Null)
    }
    pub(crate) fn rebase_draft(
        &mut self,
        id: String,
        token: String,
        sequence: i64,
        revision: i64,
    ) -> Result<Value, String> {
        if self.db.execute("UPDATE drafts SET base_revision=?4 WHERE resource_id=?1 AND token=?2 AND sequence=?3 AND EXISTS(SELECT 1 FROM resources WHERE id=?1 AND revision=?4)",params![id,token,sequence,revision]).map_err(error)?!=1{return Err("Saved version or recovery evidence changed; review again".into());}
        self.read_draft(id)
    }
    pub(crate) fn save(
        &mut self,
        id: String,
        revision: i64,
        name: String,
        content: Value,
        proof: Option<Proof>,
    ) -> Result<Value, String> {
        let raw_name = name;
        let file:bool=self.db.query_row("SELECT EXISTS(SELECT 1 FROM managed_originals WHERE resource_id=?1 AND kind='file')",[&id],|r|r.get(0)).map_err(error)?;
        if file {
            return Err("Managed file bytes are immutable; use Export original".into());
        }
        let name = title(&raw_name)?;
        let content = document(&content)?;
        let tx = self.db.transaction().map_err(error)?;
        if let Some(proof) = &proof {
            let matches:bool=tx.query_row("SELECT EXISTS(SELECT 1 FROM drafts WHERE resource_id=?1 AND token=?2 AND sequence=?3 AND base_revision=?4 AND title=?5 AND content=?6)",params![id,proof.token,proof.sequence,revision,raw_name,content],|r|r.get(0)).map_err(error)?;
            if !matches {
                return Err("Protected draft does not match this save; evidence retained".into());
            }
        }
        if tx.execute("UPDATE resources SET title=?1,content=?2,revision=revision+1,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?3 AND revision=?4",params![name,content,id,revision]).map_err(error)?!=1{return Err("Note revision conflict. The saved version changed; your protected draft is retained.".into());}
        if let Some(proof) = proof {
            tx.execute(
                "DELETE FROM drafts WHERE resource_id=?1 AND token=?2 AND sequence=?3",
                params![id, proof.token, proof.sequence],
            )
            .map_err(error)?;
        }
        tx.commit().map_err(error)?;
        Ok(json!({"revision":revision+1}))
    }
}
