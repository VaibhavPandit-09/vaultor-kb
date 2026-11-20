//! Saved feedback and evidence. The transport supplies authorized provenance;
//! no renderer command can submit a Review or act as a paired device.
use crate::domain::{error, Workspace};
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::collections::{HashMap, HashSet};
use uuid::Uuid;

const LIMIT: usize = 10_000;
const NOW: &str = "strftime('%Y-%m-%dT%H:%M:%fZ','now')";
const STATUSES: [Status; 3] = [Status::Open, Status::Resolved, Status::Dismissed];

#[derive(Clone, Copy, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum Status {
    Open,
    Resolved,
    Dismissed,
}

impl Status {
    fn key(self) -> &'static str {
        match self {
            Self::Open => "open",
            Self::Resolved => "resolved",
            Self::Dismissed => "dismissed",
        }
    }
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(tag = "kind", rename_all = "camelCase", deny_unknown_fields)]
pub enum Locator {
    Resource,
    Block { path: String },
    Page { page: u32 },
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Submission {
    pub id: String,
    pub resource_id: String,
    pub base_revision: i64,
    pub comment: String,
    pub quote: String,
    pub context: String,
    pub locator: Option<Locator>,
}

/// Construct after checking the current transport's submit grant and resource access.
/// The principal is used for retry ownership and is never serialized into a portable archive.
pub struct AuthorizedSubmitter<'a> {
    pub generation: &'a str,
    pub resource_id: &'a str,
    pub principal: &'a str,
    pub label: &'a str,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct Evidence {
    pub id: String,
    pub resource_id: String,
    pub target_title: String,
    pub target_type: String,
    pub base_revision: i64,
    pub comment: String,
    pub quote: String,
    pub context: String,
    pub locator: Option<Locator>,
    pub author: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct Portable {
    pub evidence: Evidence,
    pub status: Status,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Deserialize)]
#[serde(
    tag = "op",
    rename_all = "camelCase",
    rename_all_fields = "camelCase",
    deny_unknown_fields
)]
pub enum Request {
    List {
        resource_id: Option<String>,
        status: Option<Status>,
        page: u32,
        size: u32,
    },
    Status {
        id: String,
        status: Status,
        generation: String,
        revision: String,
    },
}

pub(crate) fn initialize(db: &Connection) -> Result<(), String> {
    db.execute_batch(
        "BEGIN IMMEDIATE;
         CREATE TABLE IF NOT EXISTS review_workspace(generation TEXT PRIMARY KEY);
         CREATE TABLE IF NOT EXISTS reviews(
             id TEXT PRIMARY KEY, resource_id TEXT NOT NULL,
             evidence TEXT NOT NULL CHECK(json_valid(evidence)),
             receipt TEXT, revision TEXT NOT NULL, previous_revision TEXT,
             status TEXT NOT NULL CHECK(status IN ('open','resolved','dismissed')),
             created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
             attachment TEXT NOT NULL
         );
         CREATE INDEX IF NOT EXISTS review_status ON reviews(status,created_at DESC,id);
         CREATE INDEX IF NOT EXISTS review_target ON reviews(resource_id,status,created_at DESC,id);
         COMMIT;",
    )
    .map_err(error)?;
    db.execute(
        "INSERT INTO review_workspace SELECT ?1 WHERE NOT EXISTS (SELECT 1 FROM review_workspace)",
        [Uuid::new_v4().to_string()],
    )
    .map_err(error)?;
    Ok(())
}

fn uuid(value: &str) -> Result<(), String> {
    if Uuid::parse_str(value).is_ok_and(|id| id.to_string() == value) {
        Ok(())
    } else {
        Err("Invalid Review or managed resource identity".into())
    }
}

fn bounded(value: &str, limit: usize, required: bool) -> Result<(), String> {
    if value.len() > limit * 4
        || value.encode_utf16().count() > limit
        || (required && value.trim().is_empty())
        || value
            .chars()
            .any(|c| c.is_control() && !matches!(c, '\n' | '\r' | '\t'))
    {
        return Err("Invalid Review text or length".into());
    }
    Ok(())
}

impl Evidence {
    fn validate(&self) -> Result<(), String> {
        uuid(&self.id)?;
        uuid(&self.resource_id)?;
        bounded(&self.comment, 5000, true)?;
        bounded(&self.quote, 4000, false)?;
        bounded(&self.context, 4000, false)?;
        bounded(&self.target_title, 500, true)?;
        bounded(&self.author, 100, true)?;
        if self.base_revision < 1 || !matches!(self.target_type.as_str(), "note" | "file") {
            return Err("Invalid Review target or saved revision".into());
        }
        match &self.locator {
            Some(Locator::Block { path })
                if self.target_type != "note"
                    || path.len() > 300
                    || path.split('.').count() > 64
                    || !path.split('.').all(|part| {
                        !part.is_empty()
                            && part.len() <= 5
                            && part.bytes().all(|digit| digit.is_ascii_digit())
                    }) =>
            {
                Err("Invalid Review block locator".into())
            }
            Some(Locator::Page { page })
                if self.target_type != "file" || !(1..=100_000).contains(page) =>
            {
                Err("Invalid Review page locator".into())
            }
            _ => Ok(()),
        }
    }
}

fn saved_text(node: &Value, output: &mut String) {
    if let Some(text) = node["text"].as_str() {
        output.push_str(text);
    }
    if let Some(content) = node["content"].as_array() {
        for child in content {
            saved_text(child, output);
        }
    }
    if matches!(node["type"].as_str(), Some("paragraph" | "heading")) {
        output.push('\n');
    }
}

fn attachment(evidence: &Evidence, content: &Value) -> &'static str {
    if evidence.quote.is_empty()
        && evidence.context.is_empty()
        && !matches!(evidence.locator, Some(Locator::Block { .. }))
    {
        return "resource";
    }
    if evidence.target_type != "note" || evidence.quote.is_empty() {
        return "unverified";
    }
    let mut block = content;
    if let Some(Locator::Block { path }) = &evidence.locator {
        for index in path.split('.') {
            block = &block["content"][index.parse::<usize>().expect("validated block path")];
        }
    }
    let mut text = String::new();
    saved_text(block, &mut text);
    let unique_quote = text.find(&evidence.quote).is_some_and(|index| {
        let next = index
            + evidence
                .quote
                .chars()
                .next()
                .expect("nonempty quote")
                .len_utf8();
        !text[next..].contains(&evidence.quote)
    });
    if unique_quote && (evidence.context.is_empty() || text.contains(&evidence.context)) {
        "attached"
    } else {
        "unverified"
    }
}

// Availability is projected against saved resource metadata even when the captured
// target has been renamed, trashed or purged. No foreign key can erase evidence.
const ITEM: &str = "SELECT v.evidence,v.status,v.revision,v.created_at,v.updated_at,
    v.attachment,r.title,r.revision,COALESCE(s.trashed,0),v.receipt
    FROM reviews v LEFT JOIN resources r ON r.id=v.resource_id
    LEFT JOIN resource_state s ON s.resource_id=r.id";

fn item(row: &rusqlite::Row<'_>) -> rusqlite::Result<Value> {
    let evidence = row.get::<_, String>(0)?;
    let mut value: Value = serde_json::from_str(&evidence).map_err(|e| {
        rusqlite::Error::FromSqlConversionFailure(0, rusqlite::types::Type::Text, Box::new(e))
    })?;
    let title: Option<String> = row.get(6)?;
    let current: Option<i64> = row.get(7)?;
    let trashed: bool = row.get(8)?;
    let receipt: Option<String> = row.get(9)?;
    let attachment: String = row.get(5)?;
    value["attachment"] = json!(if current.is_none() || trashed {
        "unavailable"
    } else if receipt.is_none() {
        "unverified"
    } else if current != value["baseRevision"].as_i64() {
        "changed"
    } else {
        &attachment
    });
    value["availability"] = json!(if current.is_none() {
        "missing"
    } else if trashed {
        "trashed"
    } else {
        "available"
    });
    value["currentTitle"] = json!(title);
    value["imported"] = json!(receipt.is_none());
    value["currentRevision"] = json!(current);
    value["status"] = json!(row.get::<_, String>(1)?);
    value["revision"] = json!(row.get::<_, String>(2)?);
    value["createdAt"] = json!(row.get::<_, String>(3)?);
    value["updatedAt"] = json!(row.get::<_, String>(4)?);
    Ok(value)
}

fn get(db: &Connection, id: &str) -> Result<Value, String> {
    db.query_row(&format!("{ITEM} WHERE v.id=?1"), [id], item)
        .map_err(error)
}

impl Workspace {
    pub fn review_generation(&self) -> Result<String, String> {
        self.db
            .query_row("SELECT generation FROM review_workspace", [], |row| {
                row.get(0)
            })
            .map_err(error)
    }

    pub fn review_receipt(
        &self,
        grant: &AuthorizedSubmitter<'_>,
        id: &str,
    ) -> Result<Value, String> {
        if self.review_generation()? != grant.generation {
            return Err("Workspace generation changed".into());
        }
        uuid(id)?;
        let receipt: Option<String> = self
            .db
            .query_row(
                "SELECT receipt FROM reviews WHERE id=?1 AND resource_id=?2",
                params![id, grant.resource_id],
                |row| row.get(0),
            )
            .optional()
            .map_err(error)?
            .flatten();
        if !receipt.is_some_and(|receipt| {
            receipt.starts_with(&format!("{}:", principal_hash(grant.principal)))
        }) {
            return Err("Review receipt is unavailable for this submitter".into());
        }
        get(&self.db, id)
    }

    pub fn submit_review(
        &mut self,
        grant: &AuthorizedSubmitter<'_>,
        input: Submission,
    ) -> Result<Value, String> {
        if self.review_generation()? != grant.generation || input.resource_id != grant.resource_id {
            return Err("Review target is outside the authorized workspace or resource".into());
        }
        bounded(grant.principal, 256, true)?;
        bounded(grant.label, 100, true)?;
        uuid(&input.id)?;
        uuid(&input.resource_id)?;
        // Bound unchecked request fields before serialization and fingerprinting.
        bounded(&input.comment, 5000, true)?;
        bounded(&input.quote, 4000, false)?;
        bounded(&input.context, 4000, false)?;
        if matches!(&input.locator, Some(Locator::Block {path}) if path.len() > 300) {
            return Err("Invalid Review block locator".into());
        }
        let receipt = format!(
            "{}:{:x}",
            principal_hash(grant.principal),
            Sha256::digest(serde_json::to_vec(&input).map_err(error)?)
        );
        let tx = self.db.transaction().map_err(error)?;
        let existing: Option<Option<String>> = tx
            .query_row(
                "SELECT receipt FROM reviews WHERE id=?1",
                [&input.id],
                |row| row.get(0),
            )
            .optional()
            .map_err(error)?;
        if let Some(existing) = existing {
            if existing.as_ref() != Some(&receipt) {
                return Err("Review identity already has different evidence or provenance".into());
            }
            return get(&tx, &input.id);
        }
        let (title, revision, kind, name): (String, i64, String, Option<String>) = tx.query_row(
            "SELECT r.title,r.revision,COALESCE(o.kind,'note'),o.name
             FROM resources r LEFT JOIN managed_originals o ON o.resource_id=r.id
             WHERE r.id=?1 AND NOT EXISTS(SELECT 1 FROM resource_state s WHERE s.resource_id=r.id AND s.trashed=1)",
            [&input.resource_id], |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
        ).optional().map_err(error)?.ok_or("Managed Review target is unavailable")?;
        let evidence = Evidence {
            id: input.id,
            resource_id: input.resource_id,
            target_title: title,
            target_type: kind,
            base_revision: input.base_revision,
            comment: input.comment,
            quote: input.quote,
            context: input.context,
            locator: input.locator,
            author: grant.label.into(),
        };
        evidence.validate()?;
        if evidence.base_revision > revision {
            return Err("Captured Review revision is newer than the saved target".into());
        }
        if matches!(evidence.locator, Some(Locator::Page { .. }))
            && !name.is_some_and(|name| name.to_ascii_lowercase().ends_with(".pdf"))
        {
            return Err("Page evidence requires a managed PDF".into());
        }
        ensure_capacity(&tx, 1)?;
        let verification = if evidence.base_revision == revision && evidence.target_type == "note" {
            let content: String = tx
                .query_row(
                    "SELECT content FROM resources WHERE id=?1",
                    [&evidence.resource_id],
                    |row| row.get(0),
                )
                .map_err(error)?;
            attachment(&evidence, &serde_json::from_str(&content).map_err(error)?)
        } else if evidence.quote.is_empty()
            && evidence.context.is_empty()
            && !matches!(evidence.locator, Some(Locator::Block { .. }))
        {
            "resource"
        } else {
            "unverified"
        };
        tx.execute(
            &format!("INSERT INTO reviews VALUES(?1,?2,?3,?4,?5,NULL,'open',{NOW},{NOW},?6)"),
            params![
                evidence.id,
                evidence.resource_id,
                serde_json::to_string(&evidence).map_err(error)?,
                receipt,
                Uuid::new_v4().to_string(),
                verification
            ],
        )
        .map_err(error)?;
        let item = get(&tx, &evidence.id)?;
        tx.commit().map_err(error)?;
        Ok(item)
    }

    pub fn reviews(&mut self, request: Request) -> Result<Value, String> {
        let current_generation = self.review_generation()?;
        match request {
            Request::List {
                resource_id,
                status,
                page,
                size,
            } => {
                if size > 100 || page > 100_000 || (size == 0 && page != 0) {
                    return Err("Invalid Review page or page size".into());
                }
                if let Some(id) = &resource_id {
                    uuid(id)?;
                }
                let mut counts = json!({});
                for status in STATUSES {
                    counts[status.key()] = json!(self.db.query_row(
                        "SELECT count(*) FROM reviews WHERE status=?1 AND (?2 IS NULL OR resource_id=?2)",
                        params![status.key(),resource_id], |row| row.get::<_,u32>(0),
                    ).map_err(error)?);
                }
                let total = status.map_or_else(
                    || {
                        STATUSES
                            .iter()
                            .map(|s| counts[s.key()].as_u64().unwrap())
                            .sum()
                    },
                    |s| counts[s.key()].as_u64().unwrap(),
                );
                let mut query = self.db.prepare(&format!("{ITEM} WHERE (?1 IS NULL OR v.resource_id=?1)
                    AND (?2 IS NULL OR v.status=?2) ORDER BY v.created_at DESC,v.id LIMIT ?3 OFFSET ?4")).map_err(error)?;
                let items = query
                    .query_map(
                        params![
                            resource_id,
                            status.map(Status::key),
                            size,
                            u64::from(page) * u64::from(size)
                        ],
                        item,
                    )
                    .map_err(error)?
                    .collect::<Result<Vec<_>, _>>()
                    .map_err(error)?;
                Ok(
                    json!({"items":items,"page":page,"size":size,"totalItems":total,
                    "totalPages":if size==0 {0} else {total.div_ceil(size.into())},"counts":counts,"generation":current_generation}),
                )
            }
            Request::Status {
                id,
                status,
                generation,
                revision,
            } => {
                if generation != current_generation {
                    return Err("Workspace generation changed".into());
                }
                uuid(&id)?;
                uuid(&revision)?;
                let tx = self.db.transaction().map_err(error)?;
                let (state, current, previous): (String, String, Option<String>) = tx
                    .query_row(
                        "SELECT status,revision,previous_revision FROM reviews WHERE id=?1",
                        [&id],
                        |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
                    )
                    .optional()
                    .map_err(error)?
                    .ok_or("Review is unavailable")?;
                if state == status.key()
                    && (current == revision || previous.as_ref() == Some(&revision))
                {
                    return get(&tx, &id);
                }
                if current != revision {
                    return Err("Review status changed. Refresh before choosing a status.".into());
                }
                tx.execute(
                    &format!(
                        "UPDATE reviews SET status=?2,previous_revision=revision,
                    revision=?3,updated_at={NOW} WHERE id=?1"
                    ),
                    params![id, status.key(), Uuid::new_v4().to_string()],
                )
                .map_err(error)?;
                let item = get(&tx, &id)?;
                tx.commit().map_err(error)?;
                Ok(item)
            }
        }
    }
}

fn principal_hash(principal: &str) -> String {
    format!("{:x}", Sha256::digest(principal.as_bytes()))
}

fn ensure_capacity(db: &Connection, incoming: usize) -> Result<(), String> {
    let count = db
        .query_row("SELECT count(*) FROM reviews", [], |row| {
            row.get::<_, usize>(0)
        })
        .map_err(error)?;
    if count + incoming > LIMIT {
        return Err("Workspace Review limit reached (10,000)".into());
    }
    Ok(())
}

pub(crate) fn snapshot(
    db: &Connection,
    ids: Option<&HashSet<&str>>,
) -> Result<Vec<Portable>, String> {
    let mut query = db
        .prepare(
            "SELECT resource_id,evidence,status,created_at,updated_at
        FROM reviews ORDER BY created_at,id",
        )
        .map_err(error)?;
    let mut rows = query.query([]).map_err(error)?;
    let mut result = Vec::new();
    let mut bytes = 0;
    while let Some(row) = rows.next().map_err(error)? {
        let target = row
            .get_ref(0)
            .and_then(|value| value.as_str().map_err(Into::into))
            .map_err(error)?;
        if ids.is_some_and(|ids| !ids.contains(target)) {
            continue;
        }
        let evidence: String = row.get(1).map_err(error)?;
        bytes += evidence.len();
        if bytes > 32 * 1024 * 1024 {
            return Err("Review evidence exceeds the portable manifest limit".into());
        }
        let status: String = row.get(2).map_err(error)?;
        result.push(Portable {
            evidence: serde_json::from_str(&evidence).map_err(error)?,
            status: serde_json::from_value(json!(status)).map_err(error)?,
            created_at: row.get(3).map_err(error)?,
            updated_at: row.get(4).map_err(error)?,
        });
    }
    Ok(result)
}

fn timestamp(value: &str) -> bool {
    let bytes = value.as_bytes();
    bytes.len() == 24
        && bytes.iter().enumerate().all(|(index, &byte)| match index {
            4 | 7 => byte == b'-',
            10 => byte == b'T',
            13 | 16 => byte == b':',
            19 => byte == b'.',
            23 => byte == b'Z',
            _ => byte.is_ascii_digit(),
        })
}

pub(crate) fn validate_archive(
    reviews: &[Portable],
    targets: &HashSet<String>,
    files: &HashSet<&str>,
    partial: bool,
) -> Result<(), String> {
    if reviews.len() > LIMIT {
        return Err("Portable Review limit exceeded".into());
    }
    let mut ids = HashSet::new();
    for review in reviews {
        let evidence = &review.evidence;
        evidence.validate()?;
        let included = targets.contains(&evidence.resource_id);
        if !ids.insert(&evidence.id)
            || !timestamp(&review.created_at)
            || !timestamp(&review.updated_at)
            || (partial && !included)
            || (included
                && (evidence.target_type == "file")
                    != files.contains(evidence.resource_id.as_str()))
        {
            return Err("Invalid portable Review evidence or target scope".into());
        }
    }
    Ok(())
}

pub(crate) fn restore(
    db: &Connection,
    reviews: &[Portable],
    mut remap: Option<&mut HashMap<String, String>>,
) -> Result<(), String> {
    if reviews.is_empty() {
        return Ok(());
    }
    ensure_capacity(db, reviews.len())?;
    let mut insert = db
        .prepare("INSERT INTO reviews VALUES(?1,?2,?3,NULL,?4,NULL,?5,?6,?7,'unverified')")
        .map_err(error)?;
    for review in reviews {
        let mut evidence = review.evidence.clone();
        if let Some(ids) = remap.as_deref_mut() {
            evidence.id = Uuid::new_v4().to_string();
            evidence.resource_id = ids
                .entry(evidence.resource_id)
                .or_insert_with(|| Uuid::new_v4().to_string())
                .clone();
        }
        insert
            .execute(params![
                evidence.id,
                evidence.resource_id,
                serde_json::to_string(&evidence).map_err(error)?,
                Uuid::new_v4().to_string(),
                review.status.key(),
                review.created_at,
                review.updated_at
            ])
            .map_err(error)?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::Request as Domain;

    fn text(value: &str) -> Value {
        json!({"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":value}]}]})
    }

    #[test]
    fn stale_evidence_remains_readable_and_idempotent_triage_preserves_drafts() {
        let root = tempfile::tempdir().unwrap();
        let mut workspace = Workspace::open(root.path()).unwrap();
        let note = workspace
            .execute(Domain::CreateNote {
                title: "Original".into(),
                collection: None,
            })
            .unwrap();
        let resource_id = note["id"].as_str().unwrap().to_owned();
        let save = workspace
            .execute(Domain::Save {
                id: resource_id.clone(),
                revision: 1,
                title: "Original".into(),
                content: text("The original occurrence."),
                proof: None,
            })
            .unwrap();
        let revision = save["revision"].as_i64().unwrap();
        let generation = workspace.review_generation().unwrap();
        let grant = AuthorizedSubmitter {
            generation: &generation,
            resource_id: &resource_id,
            principal: "test-principal",
            label: "Fixture reviewer",
        };
        let id = Uuid::new_v4().to_string();
        let submit = || Submission {
            id: id.clone(),
            resource_id: resource_id.clone(),
            base_revision: revision,
            comment: "Check this statement.".into(),
            quote: "occurrence".into(),
            context: "original occurrence".into(),
            locator: Some(Locator::Block { path: "0".into() }),
        };
        let created = workspace.submit_review(&grant, submit()).unwrap();
        assert_eq!(created["attachment"], "attached");
        assert_eq!(workspace.submit_review(&grant, submit()).unwrap(), created);
        let mut changed = submit();
        changed.comment = "Another request".into();
        assert!(workspace.submit_review(&grant, changed).is_err());
        let wrong = AuthorizedSubmitter {
            principal: "different",
            ..grant
        };
        assert!(workspace.review_receipt(&wrong, &id).is_err());
        assert!(workspace.submit_review(&wrong, submit()).is_err());
        let rebased = workspace
            .execute(Domain::Save {
                id: resource_id.clone(),
                revision,
                title: "Renamed".into(),
                content: text("Different saved evidence"),
                proof: None,
            })
            .unwrap();
        let rebased_revision = rebased["revision"].as_i64().unwrap();
        workspace
            .execute(Domain::Draft {
                id: resource_id.clone(),
                base_revision: rebased_revision,
                token: "draft-token".into(),
                sequence: 1,
                title: "Dirty draft".into(),
                content: text("Unsaved draft"),
            })
            .unwrap();
        let draft = workspace
            .execute(Domain::ReadDraft {
                id: resource_id.clone(),
            })
            .unwrap();
        let current = workspace.review_receipt(&grant, &id).unwrap();
        assert_eq!(current["attachment"], "changed");
        assert_eq!(current["targetTitle"], "Original");
        assert_eq!(current["currentTitle"], "Renamed");
        assert_eq!(current["quote"], "occurrence");
        let status = |status| Request::Status {
            id: id.clone(),
            status,
            generation: generation.clone(),
            revision: created["revision"].as_str().unwrap().into(),
        };
        let resolved = workspace.reviews(status(Status::Resolved)).unwrap();
        assert_eq!(
            workspace.reviews(status(Status::Resolved)).unwrap(),
            resolved
        );
        assert!(workspace.reviews(status(Status::Dismissed)).is_err());
        assert_eq!(
            workspace
                .execute(Domain::ReadDraft {
                    id: resource_id.clone()
                })
                .unwrap(),
            draft
        );
        assert_eq!(
            workspace
                .execute(Domain::Read {
                    id: resource_id.clone()
                })
                .unwrap()["revision"],
            rebased_revision
        );
        drop(workspace);
        let mut workspace = Workspace::open(root.path()).unwrap();
        assert_eq!(
            workspace.review_receipt(&grant, &id).unwrap()["status"],
            "resolved"
        );
        let list = workspace
            .reviews(Request::List {
                resource_id: Some(resource_id.clone()),
                status: Some(Status::Open),
                page: 0,
                size: 50,
            })
            .unwrap();
        assert_eq!(list["items"], json!([]));
        assert_eq!(list["counts"]["resolved"], 1);
        let other = tempfile::tempdir().unwrap();
        let mut other = Workspace::open(other.path()).unwrap();
        assert!(other.reviews(status(Status::Resolved)).is_err());
    }

    #[test]
    fn rejects_invalid_targets_and_portable_provenance_cannot_be_replayed() {
        let root = tempfile::tempdir().unwrap();
        let mut workspace = Workspace::open(root.path()).unwrap();
        let resource_id = workspace
            .execute(Domain::CreateNote {
                title: "Fixture".into(),
                collection: None,
            })
            .unwrap()["id"]
            .as_str()
            .unwrap()
            .to_owned();
        let generation = workspace.review_generation().unwrap();
        let grant = AuthorizedSubmitter {
            generation: &generation,
            resource_id: &resource_id,
            principal: "nonportable-principal",
            label: "Reader",
        };
        let id = Uuid::new_v4().to_string();
        let submit = |comment: &str, locator| Submission {
            id: id.clone(),
            resource_id: resource_id.clone(),
            base_revision: 1,
            comment: comment.into(),
            quote: String::new(),
            context: String::new(),
            locator,
        };
        assert!(workspace
            .submit_review(&grant, submit("   ", None))
            .is_err());
        assert!(workspace
            .submit_review(&grant, submit("Review", Some(Locator::Page { page: 1 })))
            .is_err());
        workspace
            .submit_review(&grant, submit("Review", None))
            .unwrap();
        workspace
            .db
            .execute("DELETE FROM resources WHERE id=?1", [&resource_id])
            .unwrap();
        assert_eq!(
            workspace.review_receipt(&grant, &id).unwrap()["availability"],
            "missing"
        );
        let records = snapshot(&workspace.db, None).unwrap();
        let data = serde_json::to_string(&records).unwrap();
        assert!(!data.contains("nonportable-principal"));
        assert!(!data.contains(&generation));
        let target = tempfile::tempdir().unwrap();
        let target = Workspace::open(target.path()).unwrap();
        let mut remap = HashMap::new();
        restore(&target.db, &records, Some(&mut remap)).unwrap();
        let remapped = snapshot(&target.db, None).unwrap();
        assert_ne!(remapped[0].evidence.id, id);
        assert_ne!(remapped[0].evidence.resource_id, resource_id);
        assert_eq!(remapped[0].evidence.author, "Reader");
        assert_eq!(
            get(&target.db, &remapped[0].evidence.id).unwrap()["imported"],
            true
        );
    }
}
