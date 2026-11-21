//! Companion intake uses the managed-original reservation, converter, and resource transaction.
use super::*;
use serde::Deserialize;

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct Intent {
    pub generation: Uuid,
    pub filename: String,
    pub mime: String,
    pub sha256: String,
    pub bytes: u64,
    pub mode: String,
    pub collection_id: Option<Uuid>,
}

impl Intent {
    pub fn validate(&self) -> Result<(), String> {
        component(&self.filename)?;
        if self.filename.len() > 240
            || self.mime.len() > 128
            || self.mime.chars().any(char::is_control)
            || !matches!(self.mode.as_str(), "original" | "text" | "markdown")
            || self.sha256.len() != 64
            || !self
                .sha256
                .bytes()
                .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
        {
            return Err("Invalid import intent".into());
        }
        Ok(())
    }

    fn fingerprint(&self) -> String {
        let canonical = [
            self.generation.to_string(),
            self.filename.clone(),
            self.mime.clone(),
            self.sha256.clone(),
            self.bytes.to_string(),
            self.mode.clone(),
            self.collection_id
                .map(|id| id.to_string())
                .unwrap_or_default(),
        ]
        .join("\0");
        format!("{:x}", Sha256::digest(canonical.as_bytes()))
    }

    pub fn prepare(&self, path: &Path) -> Result<(Value, &'static str), &'static str> {
        if self.mode == "original" {
            return Ok((
                json!({"type":"doc","content":[{"type":"paragraph"}]}),
                "file",
            ));
        }
        if self.bytes > 256 * 1024 {
            return Err("IMPORT_CONVERSION_LIMIT");
        }
        let name = if self.mode == "text" {
            "input.txt"
        } else {
            "input.md"
        }
        .to_owned();
        let input = Input {
            path: path.to_owned(),
            relative: vec![name.clone()],
            name,
            bytes: self.bytes,
            hash: self.sha256.clone(),
            duplicate: false,
            source_key: String::new(),
            decision: None,
        };
        let content = conversion::convert(
            path,
            &input,
            &input.name,
            &Default::default(),
            &Default::default(),
            &Default::default(),
        )
        .map_err(|_| "IMPORT_ENCODING_UNSUPPORTED")?;
        Ok((content, "note"))
    }
}

pub(crate) fn initialize(db: &rusqlite::Connection) -> Result<(), String> {
    db.execute_batch("CREATE TABLE IF NOT EXISTS companion_imports(
        id TEXT PRIMARY KEY, device TEXT NOT NULL, fingerprint TEXT NOT NULL, receipt TEXT NOT NULL)")
        .map_err(error)
}

fn receipt(
    w: &Workspace,
    id: &str,
    device: Uuid,
    fingerprint: Option<&str>,
) -> Result<Option<Value>, String> {
    let row: Option<(String, String, String)> =
        w.db.query_row(
            "SELECT device,fingerprint,receipt FROM companion_imports WHERE id=?1",
            [id],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
        )
        .optional()
        .map_err(error)?;
    match row {
        Some((owner, _, _)) if owner != device.to_string() => Err("IMPORT_NOT_FOUND".into()),
        Some((_, recorded, _)) if fingerprint.is_some_and(|value| value != recorded) => {
            Err("IMPORT_ID_REUSED".into())
        }
        Some((_, _, receipt)) => serde_json::from_str(&receipt).map(Some).map_err(error),
        None => Ok(None),
    }
}

pub(crate) fn import_receipt(w: &Workspace, id: Uuid, device: Uuid) -> Result<Value, String> {
    receipt(w, &id.to_string(), device, None)?.ok_or_else(|| "IMPORT_NOT_FOUND".into())
}

pub(crate) fn import(
    w: &mut Workspace,
    id: Uuid,
    device: Uuid,
    input: Intent,
    stage: &Path,
    prepared: Result<(Value, &'static str), &'static str>,
    extracted: Option<(String, Option<String>)>,
) -> Result<Value, String> {
    let id = id.to_string();
    let fingerprint = input.fingerprint();
    if let Some(prior) = receipt(w, &id, device, Some(&fingerprint))? {
        return Ok(prior);
    }
    let count: u32 =
        w.db.query_row("SELECT count(*) FROM companion_imports", [], |r| r.get(0))
            .map_err(error)?;
    if count >= 10_000 {
        return Err("IMPORT_RECEIPT_LIMIT".into());
    }
    let collection = input.collection_id.map(|c| c.to_string());
    let collection_exists = match &collection {
        Some(id) => {
            w.db.query_row(
                "SELECT EXISTS(SELECT 1 FROM collections WHERE id=?1)",
                [id],
                |r| r.get::<_, bool>(0),
            )
            .map_err(error)?
        }
        None => true,
    };
    let prepared = if collection_exists {
        prepared
    } else {
        Err("IMPORT_COLLECTION_UNAVAILABLE")
    };
    let (content, kind) = match prepared {
        Ok(value) => value,
        Err(code) => {
            let failure = json!({"code":code});
            w.db.execute(
                "INSERT INTO companion_imports VALUES (?1,?2,?3,?4)",
                params![id, device.to_string(), fingerprint, failure.to_string()],
            )
            .map_err(error)?;
            return Ok(failure);
        }
    };
    let occupied: bool =
        w.db.query_row(
            "SELECT EXISTS(SELECT 1 FROM resources WHERE id=?1)",
            [&id],
            |r| r.get(0),
        )
        .map_err(error)?;
    if occupied {
        return Err("IMPORT_ID_REUSED".into());
    }
    let path = original_path(&w.root, &id)?;
    let directory = path.parent().ok_or("Missing originals directory")?;
    fs::create_dir_all(directory).map_err(error)?;
    plain_directory(directory)?;
    let reservation = w.db.transaction().map_err(error)?;
    portable::reserve_original(&reservation, &id, &input.sha256)?;
    reservation.commit().map_err(error)?;
    if !portable::verified_orphan(&path, &input.sha256)? {
        publish_file(stage, &path)?;
    }
    let original = Original {
        id: id.clone(),
        name: input.filename.clone(),
        hash: input.sha256.clone(),
        bytes: input.bytes,
        kind: kind.into(),
        provenance: "Android collected import".into(),
    };
    let tx = w.db.transaction().map_err(error)?;
    tx.execute(
        "INSERT INTO resources(id,title,content) VALUES (?1,?2,?3)",
        params![id, input.filename, content.to_string()],
    )
    .map_err(error)?;
    insert_original(&tx, &original)?;
    if let Some((state, body)) = extracted {
        crate::file_text::save(&tx, &id, &input.sha256, &state, body.as_deref())?;
    }
    if let Some(collection) = &collection {
        tx.execute(
            "INSERT INTO memberships VALUES (?1,?2)",
            params![id, collection],
        )
        .map_err(error)?;
    }
    let result = json!({"version":1,"id":id,"workspaceId":input.generation,"generation":input.generation,
        "sha256":input.sha256,"fingerprint":fingerprint,"resourceId":id,"kind":kind,"collectionId":collection,
        "filename":input.filename,"bytes":input.bytes,"warnings":[],"createdAt":time::OffsetDateTime::now_utc()
            .format(&time::format_description::well_known::Rfc3339).map_err(error)?});
    tx.execute(
        "INSERT INTO companion_imports VALUES (?1,?2,?3,?4)",
        params![id, device.to_string(), fingerprint, result.to_string()],
    )
    .map_err(error)?;
    portable::release_original(&tx, &id)?;
    tx.commit().map_err(error)?;
    Ok(result)
}
