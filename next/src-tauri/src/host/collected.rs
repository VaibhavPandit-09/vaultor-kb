//! Durable workspace proposals. The mobile routes can stage bytes and read their
//! own receipts. Only the local owner can review or dispatch a restore.
use super::*;
use crate::{
    activity::{Activity, Context},
    domain::error,
    transfers,
};
use axum::extract::Multipart;
use fs2::FileExt;
use mobile::{MobileResult, Problem};
use rusqlite::{params, Connection, OpenFlags, OptionalExtension};
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::{fs, path::Path};
use tokio::io::AsyncWriteExt;

const MAX_ARCHIVE: u64 = 64 * 1024 * 1024;
const MAX_PENDING_BYTES: u64 = 256 * 1024 * 1024;
const MAX_RECEIPTS: usize = 2048;
const PENDING_SECONDS: i64 = 2 * 86400;

#[derive(Clone, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Intent {
    host_id: Uuid,
    workspace_id: Uuid,
    generation: Uuid,
    filename: String,
    sha256: String,
    bytes: u64,
    name: String,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct Receipt {
    version: u8,
    id: Uuid,
    device_id: Uuid,
    device_name: String,
    input: Intent,
    state: String,
    created_at: String,
    created: i64,
    destination_workspace_id: Option<Uuid>,
    preview: Option<Value>,
    #[serde(default)]
    destination: Option<PathBuf>,
}

impl Receipt {
    fn pending(&self) -> bool {
        matches!(
            self.state.as_str(),
            "RECEIVING" | "AWAITING_OWNER" | "PREVIEWED" | "APPROVED"
        )
    }

    fn view(&self, owner: bool) -> Value {
        let mut value = serde_json::to_value(self).expect("valid ZIP receipt");
        let object = value.as_object_mut().unwrap();
        object.remove("created");
        if !owner {
            object.remove("deviceName");
            object.remove("destination");
            object.remove("preview");
        }
        value
    }
}

struct Queue(PathBuf);

impl Queue {
    fn open(host: &Host) -> Result<Self, String> {
        let path = host.access.join("collected-workspaces");
        fs::create_dir_all(&path).map_err(error)?;
        let canonical = path.canonicalize().map_err(error)?;
        if canonical.parent() != Some(host.access.as_path()) {
            return Err("Invalid private ZIP storage".into());
        }
        let queue = Self(canonical);
        queue.db()?;
        Ok(queue)
    }

    fn db(&self) -> Result<Connection, String> {
        let db = Connection::open(self.0.join("receipts.sqlite3")).map_err(error)?;
        db.busy_timeout(Duration::from_secs(2)).map_err(error)?;
        db.execute_batch(
            "CREATE TABLE IF NOT EXISTS receipts(id TEXT PRIMARY KEY, body TEXT NOT NULL);",
        )
        .map_err(error)?;
        Ok(db)
    }

    fn read(&self, id: Uuid) -> Result<Option<Receipt>, String> {
        let body: Option<String> = self
            .db()?
            .query_row(
                "SELECT body FROM receipts WHERE id=?1",
                [id.to_string()],
                |row| row.get(0),
            )
            .optional()
            .map_err(error)?;
        body.map(|body| serde_json::from_str(&body).map_err(error))
            .transpose()
    }

    fn list(&self) -> Result<Vec<Receipt>, String> {
        let db = self.db()?;
        let mut query = db
            .prepare("SELECT body FROM receipts LIMIT 2049")
            .map_err(error)?;
        let bodies = query
            .query_map([], |row| row.get::<_, String>(0))
            .map_err(error)?;
        bodies
            .map(|body| serde_json::from_str(&body.map_err(error)?).map_err(error))
            .collect()
    }

    fn save(&self, row: &Receipt) -> Result<(), String> {
        self.db()?.execute(
            "INSERT INTO receipts VALUES(?1,?2) ON CONFLICT(id) DO UPDATE SET body=excluded.body",
            params![row.id.to_string(), serde_json::to_string(row).map_err(error)?],
        ).map_err(error)?;
        Ok(())
    }

    fn archive(&self, id: Uuid) -> PathBuf {
        self.0.join(format!("{id}.zip"))
    }

    fn verify_upload(&self, row: &Receipt) -> Result<(), String> {
        let digest = transfers::copy_hash(
            transfers::plain_file_with_limit(&self.archive(row.id), MAX_ARCHIVE)?,
            io::sink(), MAX_ARCHIVE, |_| Ok(()),
        )?;
        if digest != (row.input.bytes, row.input.sha256.clone()) {
            return Err("Staged ZIP differs from the submitted backup".into());
        }
        Ok(())
    }

    fn finish(&self, row: &mut Receipt, state: &str) -> Result<(), String> {
        row.state = state.into();
        if state == "SUCCEEDED" {
            row.destination_workspace_id = Some(row.id);
        }
        self.save(row)?;
        let _ = fs::remove_file(self.archive(row.id));
        Ok(())
    }

    fn reconcile(&self, row: &mut Receipt) -> Result<(), String> {
        if row.state == "APPROVED"
            && row
                .destination
                .as_deref()
                .is_some_and(|p| published(p, row.id))
        {
            self.finish(row, "SUCCEEDED")?;
        }
        if matches!(
            row.state.as_str(),
            "RECEIVING" | "AWAITING_OWNER" | "PREVIEWED"
        ) && now() - row.created >= PENDING_SECONDS
        {
            self.finish(row, "EXPIRED")?;
        }
        Ok(())
    }
}

fn now() -> i64 {
    time::OffsetDateTime::now_utc().unix_timestamp()
}

fn published(destination: &Path, id: Uuid) -> bool {
    let database = destination.join("workspace.sqlite3");
    let Ok(file) = fs::symlink_metadata(&database) else {
        return false;
    };
    if !file.is_file() || transfers::reparse(&file) {
        return false;
    }
    Connection::open_with_flags(database, OpenFlags::SQLITE_OPEN_READ_ONLY)
        .and_then(|db| {
            db.query_row("SELECT generation FROM review_workspace", [], |row| {
                row.get::<_, String>(0)
            })
        })
        .is_ok_and(|generation| generation == id.to_string())
}

pub(super) fn router() -> Router<Host> {
    Router::new().route(
        "/collected-zips/{id}",
        get(receipt)
            .put(upload)
            .delete(cancel)
            .layer(DefaultBodyLimit::max(MAX_ARCHIVE as usize + 16 * 1024)),
    )
}

fn unavailable(_: impl std::fmt::Display) -> StatusCode {
    StatusCode::SERVICE_UNAVAILABLE
}

async fn receipt(
    State(host): State<Host>,
    RoutePath(id): RoutePath<Uuid>,
    headers: HeaderMap,
) -> MobileResult<Json<Value>> {
    device_decision(host, id, headers, false).await
}

async fn cancel(
    State(host): State<Host>,
    RoutePath(id): RoutePath<Uuid>,
    headers: HeaderMap,
) -> MobileResult<Json<Value>> {
    device_decision(host, id, headers, true).await
}

async fn device_decision(
    host: Host,
    id: Uuid,
    headers: HeaderMap,
    cancel: bool,
) -> MobileResult<Json<Value>> {
    let scope = mobile::selected(&host, &headers)?;
    let grant = host.authorize(&headers, scope).await?;
    tokio::task::spawn_blocking(move || {
        let _gate = host.enrollment.lock().map_err(unavailable)?;
        if !grant.current_sync(&host.access, scope) || host.stop.is_cancelled() {
            return Err(StatusCode::FORBIDDEN.into());
        }
        let queue = Queue::open(&host).map_err(unavailable)?;
        let mut row = queue
            .read(id)
            .map_err(unavailable)?
            .ok_or(StatusCode::NOT_FOUND)?;
        if row.device_id != grant.device || row.input.workspace_id != scope {
            return Err(StatusCode::NOT_FOUND.into());
        }
        queue.reconcile(&mut row).map_err(unavailable)?;
        if cancel && row.pending() {
            if row.state == "APPROVED" {
                return Err(StatusCode::CONFLICT.into());
            }
            queue.finish(&mut row, "CANCELLED").map_err(unavailable)?;
        }
        Ok(Json(row.view(false)))
    })
    .await
    .map_err(unavailable)?
}

async fn upload(
    State(host): State<Host>,
    RoutePath(id): RoutePath<Uuid>,
    headers: HeaderMap,
    mut form: Multipart,
) -> MobileResult<Json<Value>> {
    use StatusCode as S;
    let scope = mobile::selected(&host, &headers)?;
    let grant = host.authorize(&headers, scope).await?;
    let bad = |_| S::BAD_REQUEST;
    let mut metadata = tokio::time::timeout(Duration::from_secs(20), form.next_field())
        .await
        .map_err(|_| S::REQUEST_TIMEOUT)?
        .map_err(bad)?
        .ok_or(S::BAD_REQUEST)?;
    if metadata.name() != Some("intent") {
        return Err(S::BAD_REQUEST.into());
    }
    let mut bytes = Vec::new();
    while let Some(chunk) = tokio::time::timeout(Duration::from_secs(20), metadata.chunk())
        .await
        .map_err(|_| S::REQUEST_TIMEOUT)?
        .map_err(bad)?
    {
        if bytes.len() + chunk.len() > 4096 {
            return Err(S::BAD_REQUEST.into());
        }
        bytes.extend_from_slice(&chunk);
    }
    drop(metadata);
    let intent: Intent = serde_json::from_slice(&bytes).map_err(|_| S::BAD_REQUEST)?;
    if intent.host_id != host.host_id()
        || intent.workspace_id != scope
        || intent.generation != scope
    {
        return Err(Problem(
            S::CONFLICT,
            "IMPORT_GENERATION_CHANGED",
            "The original source is unavailable.",
        ));
    }
    if !(1..=MAX_ARCHIVE).contains(&intent.bytes)
        || intent.sha256.len() != 64
        || !intent
            .sha256
            .bytes()
            .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
        || intent.filename.len() > 180
        || !intent.filename.to_ascii_lowercase().ends_with(".zip")
        || intent
            .filename
            .chars()
            .any(|c| c.is_control() || matches!(c, '/' | '\\'))
        || intent.name.trim().is_empty()
        || intent.name.len() > 200
        || intent.name.chars().any(char::is_control)
    {
        return Err(S::BAD_REQUEST.into());
    }
    let queue = Queue::open(&host).map_err(unavailable)?;
    let lease = fs::OpenOptions::new()
        .read(true)
        .write(true)
        .create(true)
        .truncate(false)
        .open(queue.0.join("receiving.lock"))
        .map_err(unavailable)?;
    lease
        .try_lock_exclusive()
        .map_err(|_| S::TOO_MANY_REQUESTS)?;
    let mut row = {
        let _gate = host.enrollment.lock().map_err(unavailable)?;
        if host.stop.is_cancelled() || !grant.current_sync(&host.access, scope) {
            return Err(S::FORBIDDEN.into());
        }
        let previous = queue.read(id).map_err(unavailable)?;
        if let Some(mut row) = previous {
            if row.device_id != grant.device || row.input != intent {
                return Err(S::CONFLICT.into());
            }
            queue.reconcile(&mut row).map_err(unavailable)?;
            if row.state != "RECEIVING" {
                return Ok(Json(row.view(false)));
            }
            row
        } else {
            let mut rows = queue.list().map_err(unavailable)?;
            for r in &mut rows {
                queue.reconcile(r).map_err(unavailable)?;
            }
            let pending = rows.iter().filter(|r| r.pending());
            if rows.len() >= MAX_RECEIPTS
                || pending.clone().count() >= 32
                || pending.map(|r| r.input.bytes).sum::<u64>() + intent.bytes > MAX_PENDING_BYTES
            {
                return Err(S::TOO_MANY_REQUESTS.into());
            }
            let created_at = time::OffsetDateTime::now_utc()
                .format(&time::format_description::well_known::Rfc3339)
                .map_err(unavailable)?;
            let row = Receipt {
                version: 1,
                id,
                device_id: grant.device,
                device_name: grant.label.clone(),
                input: intent,
                state: "RECEIVING".into(),
                created_at,
                created: now(),
                destination_workspace_id: None,
                preview: None,
                destination: None,
            };
            queue.save(&row).map_err(unavailable)?;
            row
        }
    };
    let partial = queue.0.join("receiving.tmp");
    // Only the cross-process receiver lease owns this fixed scratch path.
    let _ = fs::remove_file(&partial);
    let file = fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&partial)
        .map_err(unavailable)?;
    let cleanup = tempfile::TempPath::try_from_path(&partial).map_err(unavailable)?;
    let mut out = tokio::fs::File::from_std(file);
    let mut field = tokio::time::timeout(Duration::from_secs(20), form.next_field())
        .await
        .map_err(|_| S::REQUEST_TIMEOUT)?
        .map_err(bad)?
        .ok_or(S::BAD_REQUEST)?;
    if field.name() != Some("file") {
        return Err(S::BAD_REQUEST.into());
    }
    let mut count = 0u64;
    let mut hash = Sha256::new();
    let mut last_check = tokio::time::Instant::now();
    while let Some(chunk) = tokio::time::timeout(Duration::from_secs(20), field.chunk())
        .await
        .map_err(|_| S::REQUEST_TIMEOUT)?
        .map_err(bad)?
    {
        if last_check.elapsed() >= Duration::from_secs(1) {
            let cancelled = queue
                .read(id)
                .map_err(unavailable)?
                .is_none_or(|r| r.state != "RECEIVING");
            if cancelled || host.stop.is_cancelled() || !grant.current(&host.access, scope).await {
                return Err(S::FORBIDDEN.into());
            }
            last_check = tokio::time::Instant::now();
        }
        count += chunk.len() as u64;
        if count > row.input.bytes {
            return Err(S::PAYLOAD_TOO_LARGE.into());
        }
        hash.update(&chunk);
        out.write_all(&chunk).await.map_err(unavailable)?;
    }
    drop(field);
    if count != row.input.bytes
        || format!("{:x}", hash.finalize()) != row.input.sha256
        || tokio::time::timeout(Duration::from_secs(20), form.next_field())
            .await
            .map_err(|_| S::REQUEST_TIMEOUT)?
            .map_err(bad)?
            .is_some()
    {
        return Err(S::BAD_REQUEST.into());
    }
    out.sync_all().await.map_err(unavailable)?;
    drop(out);
    let _gate = host.enrollment.lock().map_err(unavailable)?;
    if host.stop.is_cancelled()
        || !grant.current_sync(&host.access, scope)
        || queue
            .read(id)
            .map_err(unavailable)?
            .is_none_or(|r| r.state != "RECEIVING")
    {
        return Err(S::FORBIDDEN.into());
    }
    // A process interruption between file publication and receipt publication
    // leaves a RECEIVING record. An exact retry may discard that unapproved copy.
    cleanup.persist(queue.archive(id)).map_err(unavailable)?;
    row.state = "AWAITING_OWNER".into();
    queue.save(&row).map_err(unavailable)?;
    host.management_changed();
    Ok(Json(row.view(false)))
}

impl Host {
    pub fn workspace_zip_owner(
        &self,
        action: &str,
        id: Option<Uuid>,
        destination: Option<PathBuf>,
    ) -> Result<Value, String> {
        let queue = Queue::open(self)?;
        let gate = self.enrollment.lock().map_err(error)?;
        if action == "list" {
            let mut rows = queue.list()?;
            rows.retain(|row| row.input.workspace_id == self.workspace);
            for row in &mut rows {
                queue.reconcile(row)?;
            }
            rows.sort_by_key(|row| (!row.pending(), std::cmp::Reverse(row.created)));
            return Ok(json!(rows
                .iter()
                .filter(|row| row.state != "RECEIVING")
                .take(100)
                .map(|row| row.view(true))
                .collect::<Vec<_>>()));
        }
        let mut row = queue
            .read(id.ok_or("Choose a ZIP request")?)?
            .filter(|row| row.input.workspace_id == self.workspace)
            .ok_or("ZIP request unavailable")?;
        queue.reconcile(&mut row)?;
        if row.state == "SUCCEEDED" {
            return Ok(row.view(true));
        }
        if action == "reject" {
            if row.state == "APPROVED" {
                return Err("The owner already authorized this restore".into());
            }
            if row.pending() {
                queue.finish(&mut row, "REJECTED")?;
            }
            self.management_changed();
            return Ok(row.view(true));
        }
        if self.stop.is_cancelled()
            || !access::device_allowed(&self.access, row.device_id, self.workspace)
        {
            return Err("The submitting device no longer has access to this workspace".into());
        }
        if action == "preview" && matches!(row.state.as_str(), "AWAITING_OWNER" | "PREVIEWED") {
            drop(gate);
            let preview = queue.verify_upload(&row).and_then(|_| transfers::archive_preview(&queue.archive(row.id)));
            let _gate = self.enrollment.lock().map_err(error)?;
            let current = queue.read(row.id)?.ok_or("ZIP request unavailable")?;
            if current.state != row.state
                || !access::device_allowed(&self.access, row.device_id, self.workspace)
            {
                return Err("ZIP request or device access changed during verification".into());
            }
            match preview {
                Ok(preview) => {
                    row.preview = Some(preview);
                    row.state = "PREVIEWED".into();
                    queue.save(&row)?;
                }
                Err(_) => queue.finish(&mut row, "FAILED")?,
            }
            self.management_changed();
            return Ok(row.view(true));
        }
        if action != "approve" || !matches!(row.state.as_str(), "PREVIEWED" | "APPROVED") {
            return Err("Review the exact ZIP before authorizing a new workspace".into());
        }
        let activity = Activity::new(queue.0.join("activity.json"), self.storage.clone(), |_| {})
            .map_err(|_| "A workspace ZIP restore is already running")?;
        if row.state == "PREVIEWED" {
            let destination = destination.ok_or("Choose a new workspace path")?;
            let name = destination
                .file_name()
                .ok_or("Choose a new workspace folder")?;
            let parent = destination
                .parent()
                .ok_or("Choose a destination parent")?
                .canonicalize()
                .map_err(error)?;
            let destination = parent.join(name);
            if destination.exists()
                || destination.starts_with(&*self.root)
                || destination.starts_with(&*self.access)
            {
                return Err("Choose a nonexistent folder outside the current workspace and private host data".into());
            }
            row.destination = Some(destination);
            row.state = "APPROVED".into();
            queue.save(&row)?;
        }
        let task = activity.submit(
            self.root.to_string_lossy().into_owned(),
            transfers::Job::CollectedRestore(CollectedRestore {
                host: self.clone(),
                queue,
                row: row.clone(),
            }),
        )?;
        // The shared Activity engine owns the task and its lifetime after the IPC reply.
        self.management_changed();
        let mut response = row.view(true);
        response["activityId"] = task["id"].clone();
        Ok(response)
    }
}

pub struct CollectedRestore {
    host: Host,
    queue: Queue,
    row: Receipt,
}

impl CollectedRestore {
    pub(crate) fn run(mut self, ctx: &mut Context) -> Result<Value, String> {
        let destination = self
            .row
            .destination
            .as_deref()
            .ok_or("Missing owner destination")?;
        let hash = self
            .row
            .preview
            .as_ref()
            .and_then(|p| p["manifestHash"].as_str())
            .ok_or("Missing verified archive")?;
        let source = self.queue.archive(self.row.id);
        let restored = self.queue.verify_upload(&self.row).and_then(|_| transfers::restore(
            source.to_str().ok_or("Unsupported staging path")?,
            destination.to_str().ok_or("Unsupported destination path")?,
            hash,
            Some(self.row.id),
            ctx,
            |staged, destination| {
                let _gate = self.host.enrollment.lock().map_err(error)?;
                if self.host.stop.is_cancelled()
                    || !access::device_allowed(
                        &self.host.access,
                        self.row.device_id,
                        self.host.workspace,
                    )
                {
                    return Err("The submitting device no longer has access".into());
                }
                transfers::publish_directory(staged, destination)
            },
        ));
        let _gate = self.host.enrollment.lock().map_err(error)?;
        if restored.is_ok() || published(destination, self.row.id) {
            self.queue.finish(&mut self.row, "SUCCEEDED")?;
        } else if !self.host.stop.is_cancelled() {
            self.queue.finish(&mut self.row, "FAILED")?;
        }
        self.host.management_changed();
        restored
    }
}
