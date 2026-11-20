use super::*;
use rusqlite::OptionalExtension;

#[derive(Serialize, Deserialize)]
struct Source {
    from: String,
    to: String,
    revision: i64,
    original: Option<Original>,
}

fn revision(db: &rusqlite::Connection, id: &str) -> Result<i64, String> {
    db.query_row(
        "SELECT revision FROM resources WHERE id=?1
         AND NOT EXISTS (SELECT 1 FROM resource_state WHERE resource_id=?1 AND trashed=1)
         AND NOT EXISTS (SELECT 1 FROM drafts WHERE resource_id=?1)",
        [id],
        |row| row.get(0),
    )
    .optional()
    .map_err(error)?
    .ok_or("A managed resource is unavailable or has a protected draft".into())
}

fn duplicate_title(db: &rusqlite::Connection, title: &str) -> Result<String, String> {
    let mut exists = db
        .prepare("SELECT EXISTS(SELECT 1 FROM resources WHERE title=?1 COLLATE NOCASE)")
        .map_err(error)?;
    for index in 1..=1000 {
        let suffix = if index == 1 {
            " (copy)".to_owned()
        } else {
            format!(" (copy {index})")
        };
        let base: String = title.chars().take(240 - suffix.len()).collect();
        let candidate = format!("{}{suffix}", base.trim_end());
        if !exists
            .query_row([&candidate], |row| row.get::<_, bool>(0))
            .map_err(error)?
        {
            return Ok(candidate);
        }
    }
    Err("Choose a distinct title before duplicating this resource".into())
}

pub(super) fn duplicate(
    storage: &Storage,
    root: &str,
    ids: Vec<String>,
    ctx: &mut Context,
) -> Result<Value, String> {
    if ids.is_empty() || ids.len() > 100 || ids.iter().collect::<HashSet<_>>().len() != ids.len() {
        return Err("Choose 1–100 different managed resources".into());
    }
    let data = storage.call(root, move |w| {
        let mut sources = Vec::with_capacity(ids.len());
        for from in ids {
            Uuid::parse_str(&from).map_err(|_| "Only managed resources can be duplicated".to_string())?;
            let to = Uuid::new_v4().to_string();
            let original = w.db.query_row(
                "SELECT name,hash,bytes,kind,provenance FROM managed_originals WHERE resource_id=?1",
                [&from], |row| Ok(Original {id:to.clone(),name:row.get(0)?,hash:row.get(1)?,
                    bytes:row.get(2)?,kind:row.get(3)?,provenance:row.get(4)?}),
            ).optional().map_err(error)?;
            sources.push(Source {revision:revision(&w.db, &from)?,from,to,original});
        }
        serde_json::to_value(sources).map_err(error)
    })?;
    let sources: Vec<Source> = serde_json::from_value(data).map_err(error)?;
    portable::reserve_originals(
        storage,
        root,
        sources
            .iter()
            .filter_map(|source| {
                source
                    .original
                    .as_ref()
                    .map(|file| (file.id.clone(), file.hash.clone()))
            })
            .collect(),
    )?;
    let total = sources.len() as u64;
    let total_bytes = sources
        .iter()
        .filter_map(|source| source.original.as_ref().map(|file| file.bytes))
        .sum();
    let mut done_bytes = 0;
    for (index, source) in sources.iter().enumerate() {
        ctx.check()?;
        if let Some(file) = &source.original {
            let old = original_path(Path::new(root), &source.from)?;
            let new = original_path(Path::new(root), &source.to)?;
            let (size, hash) = copy_hash(plain_file(&old)?, std::io::sink(), file.bytes, |done| {
                ctx.check()?;
                ctx.progress(
                    "Verifying immutable bytes",
                    index as u64,
                    Some(total),
                    done_bytes + done,
                    Some(total_bytes),
                );
                Ok(())
            })?;
            if size != file.bytes || hash != file.hash {
                return Err("Managed original integrity mismatch".into());
            }
            // Both names are private managed UUID paths on the same volume. Unlinking
            // either logical resource cannot delete the other resource's directory entry.
            fs::hard_link(old, new)
                .map_err(|e| format!("Could not share immutable data on this volume: {e}"))?;
            done_bytes += size;
        }
        ctx.progress(
            "Preparing duplicates",
            index as u64 + 1,
            Some(total),
            done_bytes,
            Some(total_bytes),
        );
    }
    ctx.check()?;
    ctx.committing();
    storage.call(root, move |w| {
        let tx = w.db.transaction().map_err(error)?;
        let mut copies = Vec::with_capacity(sources.len());
        for source in sources {
            if revision(&tx, &source.from)? != source.revision {
                return Err("The saved source changed during duplication. Try again.".into());
            }
            let title: String = tx.query_row("SELECT title FROM resources WHERE id=?1", [&source.from], |row| row.get(0)).map_err(error)?;
            let title = duplicate_title(&tx, &title)?;
            tx.execute(
                "INSERT INTO resources(id,title,content) SELECT ?2,?3,content FROM resources WHERE id=?1",
                params![source.from,source.to,title],
            ).map_err(error)?;
            tx.execute("INSERT INTO memberships SELECT ?2,collection_id FROM memberships WHERE resource_id=?1",params![source.from,source.to]).map_err(error)?;
            tx.execute("INSERT INTO resource_tags SELECT ?2,tag_id FROM resource_tags WHERE resource_id=?1",params![source.from,source.to]).map_err(error)?;
            if let Some(file) = source.original {
                insert_original(&tx, &file)?;
                portable::release_original(&tx, &file.id)?;
                if file.kind == "file" {
                    tx.execute("INSERT INTO managed_text_receipts SELECT ?2,hash,state FROM managed_text_receipts WHERE resource_id=?1",params![source.from,source.to]).map_err(error)?;
                    tx.execute("UPDATE note_search SET body=(SELECT body FROM note_search WHERE rowid=(SELECT seq FROM resources WHERE id=?1))
                        WHERE rowid=(SELECT seq FROM resources WHERE id=?2)
                        AND EXISTS(SELECT 1 FROM managed_text_receipts WHERE resource_id=?2 AND state='indexed')",
                        params![source.from,source.to]).map_err(error)?;
                }
            }
            copies.push(json!({"id":source.to,"title":title}));
        }
        tx.commit().map_err(error)?;
        Ok(json!({"copies":copies,"bytesVerified":done_bytes}))
    })
}
