use crate::{activity::Context, domain::error, transfers, worker::Storage};
use rusqlite::{params, Connection};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::{io::Read, path::Path};

const MAX_BYTES: u64 = 4 * 1024 * 1024;

pub fn initialize(db: &Connection) -> Result<(), String> {
    db.execute_batch(
        "CREATE TABLE IF NOT EXISTS managed_text_receipts(
        resource_id TEXT PRIMARY KEY REFERENCES resources(id) ON DELETE CASCADE,
        hash TEXT NOT NULL, state TEXT NOT NULL);
",
    )
    .map_err(error)?;
    let migrated: bool = db.query_row("SELECT instr(sql,'managed_text_receipts')>0 FROM sqlite_master WHERE name='search_update'",[],|r|r.get(0)).map_err(error)?;
    if !migrated {
        db.execute_batch("SAVEPOINT keep_managed_file_index;
          DROP TRIGGER search_update;
          CREATE TRIGGER search_update AFTER UPDATE OF title,content ON resources BEGIN
            UPDATE note_search SET title=new.title WHERE rowid=new.seq AND EXISTS(
                SELECT 1 FROM managed_text_receipts f WHERE f.resource_id=new.id AND f.state='indexed');
            UPDATE note_search SET title=new.title,body=COALESCE((SELECT group_concat(value,' ') FROM json_tree(new.content) WHERE key='text' AND type='text'),'')
              WHERE rowid=new.seq AND NOT EXISTS(SELECT 1 FROM managed_text_receipts f WHERE f.resource_id=new.id AND f.state='indexed');
            UPDATE search_generation SET value=value+1;
          END;
          RELEASE keep_managed_file_index;").map_err(error)?;
    }
    Ok(())
}

pub fn extract(path: &Path, name: &str, hash: &str, size: u64) -> (&'static str, Option<String>) {
    let ext = Path::new(name)
        .extension()
        .and_then(|ext| ext.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    if ![
        "txt", "md", "markdown", "csv", "tsv", "json", "xml", "html", "htm", "css", "js", "ts",
        "log", "yaml", "yml", "rs", "py", "java", "toml",
    ]
    .contains(&ext.as_str())
    {
        return ("unsupported", None);
    }
    if size > MAX_BYTES {
        return ("limit", None);
    }
    let mut bytes = Vec::new();
    let result = transfers::plain_file(path).and_then(|file| {
        file.take(MAX_BYTES + 1)
            .read_to_end(&mut bytes)
            .map_err(error)
    });
    if result.is_err()
        || bytes.len() as u64 != size
        || format!("{:x}", Sha256::digest(&bytes)) != hash
    {
        return ("unavailable", None);
    }
    let Ok(text) = String::from_utf8(bytes) else {
        return ("invalid", None);
    };
    if text.contains('\0') {
        return ("invalid", None);
    }
    let text = text.trim_start_matches('\u{feff}');
    if text.trim().is_empty() {
        return ("empty", None);
    }
    let mut units = 0;
    let text = text
        .chars()
        .take_while(|ch| {
            units += ch.len_utf16();
            units <= 500_000
        })
        .collect();
    ("indexed", Some(text))
}

pub fn save(
    db: &Connection,
    id: &str,
    hash: &str,
    state: &str,
    body: Option<&str>,
) -> Result<(), String> {
    db.execute(
        "INSERT INTO managed_text_receipts VALUES(?1,?2,?3)
        ON CONFLICT(resource_id) DO UPDATE SET hash=excluded.hash,state=excluded.state",
        params![id, hash, state],
    )
    .map_err(error)?;
    db.execute(
        "UPDATE note_search SET body=?2 WHERE rowid=(SELECT seq FROM resources WHERE id=?1)",
        params![id, body.unwrap_or("")],
    )
    .map_err(error)?;
    db.execute("UPDATE search_generation SET value=value+1", [])
        .map_err(error)?;
    Ok(())
}

pub fn rebuild(storage: &Storage, workspace: &str, ctx: &mut Context<'_>) -> Result<Value, String> {
    let mut after = 0i64;
    let mut processed = 0;
    loop {
        ctx.check()?;
        let rows=storage.call(workspace,move |w|{
            let mut q=w.db.prepare("SELECT r.seq,o.resource_id,o.name,o.hash,o.bytes FROM managed_originals o JOIN resources r ON r.id=o.resource_id
                WHERE o.kind='file' AND r.seq>?1 ORDER BY r.seq LIMIT 64").map_err(error)?;
            let rows=q.query_map([after],|r|Ok((r.get::<_,i64>(0)?,r.get::<_,String>(1)?,r.get::<_,String>(2)?,r.get::<_,String>(3)?,r.get::<_,u64>(4)?)))
                .map_err(error)?.collect::<Result<Vec<_>,_>>().map_err(error)?;
            Ok(json!(rows))
        })?;
        let rows: Vec<(i64, String, String, String, u64)> =
            serde_json::from_value(rows).map_err(error)?;
        if rows.is_empty() {
            break;
        }
        for (seq, id, name, hash, bytes) in rows {
            ctx.check()?;
            let path = transfers::original_path(Path::new(workspace), &id)?;
            let (state, body) = extract(&path, &name, &hash, bytes);
            storage.call(workspace,move |w|{
                let tx=w.db.transaction().map_err(error)?;
                let unchanged:bool=tx.query_row("SELECT EXISTS(SELECT 1 FROM managed_originals WHERE resource_id=?1 AND hash=?2 AND kind='file')",params![id,hash],|r|r.get(0)).map_err(error)?;
                if unchanged { save(&tx,&id,&hash,state,body.as_deref())?; }
                tx.commit().map_err(error)?;
                Ok(Value::Null)
            })?;
            processed += 1;
            after = seq;
        }
        ctx.progress("Rebuilding managed file text", processed, None, 0, None);
    }
    Ok(json!({"processed":processed}))
}
