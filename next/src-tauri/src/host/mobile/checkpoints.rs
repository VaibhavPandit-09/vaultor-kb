//! Short-lived, device-owned manifests over saved managed content.
use super::*;
use axum::body::Bytes;
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::{
    collections::{BTreeMap, BTreeSet, HashMap, VecDeque},
    time::Instant,
};

const MAX_RESOURCES: usize = 1_000;
const MAX_METADATA: usize = 12 * 1024 * 1024;
const MAX_FILE: u64 = 64 * 1024 * 1024;
const MAX_BYTES: u64 = 2 * 1024 * 1024 * 1024;
const TTL: Duration = Duration::from_secs(15 * 60);

#[derive(Default)]
pub(in crate::host) struct Checkpoints {
    entries: HashMap<Uuid, Arc<Checkpoint>>,
    preparing: bool,
}

struct Checkpoint {
    device: Uuid,
    selection: Selection,
    created: Instant,
    entries: Vec<Value>,
    coverage: Vec<Value>,
    payloads: HashMap<String, Bytes>,
    organization: Value,
    pin: String,
    estimate: Value,
}

impl Checkpoint {
    fn status(&self) -> Value {
        json!({"status":"READY","manifestSha256":self.pin,"resources":self.entries.len(),"bytes":self.estimate["bytes"]})
    }
}

#[derive(Deserialize, Serialize, Eq, PartialEq)]
#[serde(deny_unknown_fields)]
struct Selection {
    generation: Uuid,
    scope: Scope,
    ids: Vec<Uuid>,
    dependencies: Dependencies,
    files: Files,
}

#[derive(Deserialize, Serialize, Eq, PartialEq)]
#[serde(rename_all = "camelCase")]
enum Scope {
    Workspace,
    Collections,
    Resources,
}

#[derive(Deserialize, Serialize, Eq, PartialEq)]
#[serde(rename_all = "camelCase")]
enum Dependencies {
    None,
    Images,
    Linked,
}

#[derive(Deserialize, Serialize, Eq, PartialEq)]
#[serde(rename_all = "camelCase")]
enum Files {
    Readable,
    Originals,
}

struct Preparation(Host);

impl Drop for Preparation {
    fn drop(&mut self) {
        if let Ok(mut cache) = self.0.mobile_checkpoints.lock() {
            cache.preparing = false;
        }
    }
}

impl Checkpoints {
    fn prune(&mut self) {
        self.entries.retain(|_, c| c.created.elapsed() < TTL);
    }
}

pub(super) fn router() -> Router<Host> {
    Router::new()
        .route("/companions/estimate", post(estimate))
        .route("/companions/{id}", get(status).put(prepare).delete(remove))
        .route("/companions/{id}/inventory", get(inventory))
        .route("/companions/{id}/coverage", get(coverage))
        .route("/companions/{id}/payloads/{key}", get(payload))
}

async fn estimate(
    State(host): State<Host>,
    headers: HeaderMap,
    Json(selection): Json<Selection>,
) -> MobileResult<Json<Value>> {
    Ok(Json(capture(host, headers, None, selection).await?))
}

async fn prepare(
    State(host): State<Host>,
    RoutePath(id): RoutePath<Uuid>,
    headers: HeaderMap,
    Json(selection): Json<Selection>,
) -> MobileResult<Json<Value>> {
    Ok(Json(capture(host, headers, Some(id), selection).await?))
}

async fn capture(
    host: Host,
    headers: HeaderMap,
    id: Option<Uuid>,
    mut selection: Selection,
) -> MobileResult<Value> {
    let workspace = selected(&host, &headers)?;
    let grant = host.authorize(&headers, workspace).await?;
    if selection.generation != workspace {
        return Err(Problem(
            StatusCode::CONFLICT,
            "COMPANION_GENERATION_CHANGED",
            "This download belongs to a former workspace.",
        ));
    }
    if selection.ids.len() > 100
        || (selection.scope == Scope::Workspace) != selection.ids.is_empty()
    {
        return Err(StatusCode::BAD_REQUEST.into());
    }
    selection.ids.sort_unstable();
    selection.ids.dedup();

    let _preparation = {
        let mut cache = host
            .mobile_checkpoints
            .lock()
            .map_err(|_| StatusCode::SERVICE_UNAVAILABLE)?;
        cache.prune();
        if let Some(existing) = id.and_then(|id| cache.entries.get(&id)) {
            if existing.device != grant.device {
                return Err(StatusCode::NOT_FOUND.into());
            }
            if existing.selection != selection {
                return Err(Problem(
                    StatusCode::CONFLICT,
                    "COMPANION_ID_CONFLICT",
                    "This download ID already has a different selection.",
                ));
            }
            return Ok(existing.status());
        }
        if cache.preparing {
            return Err(StatusCode::CONFLICT.into());
        }
        if id.is_some() && cache.entries.len() >= 4 {
            return Err(Problem(
                StatusCode::TOO_MANY_REQUESTS,
                "COMPANION_LIMIT",
                "Four downloads are already prepared. Retry after one completes or expires.",
            ));
        }
        cache.preparing = true;
        Preparation(host.clone())
    };

    let retained = id.is_some();
    let stop = host.stop.clone();
    let access = host.access.clone();
    let owner = grant.device;
    let storage = host.storage.clone();
    let root = host.root.clone();
    // Keep the preparation lease in the owner job even if the HTTP caller disconnects.
    let value = storage
        .call_host(&root, move |ws| {
            let preparation = _preparation;
            if ws.review_generation()? != workspace.to_string()
                || !grant.current_sync(&access, workspace)
                || stop.is_cancelled()
            {
                return Err("Source access changed".into());
            }
            let checkpoint = build(ws, id.unwrap_or_default(), owner, selection, retained)?;
            if !grant.current_sync(&access, workspace) || stop.is_cancelled() {
                return Err("Source access changed".into());
            }
            if let Some(id) = id {
                let value = checkpoint.status();
                preparation
                    .0
                    .mobile_checkpoints
                    .lock()
                    .map_err(error)?
                    .entries
                    .insert(id, Arc::new(checkpoint));
                Ok(value)
            } else {
                Ok(checkpoint.estimate)
            }
        })
        .await;
    host.authorize(&headers, workspace).await?;
    value.map_err(|_|Problem(StatusCode::UNPROCESSABLE_ENTITY,"COMPANION_LIMIT","The selection is unavailable or exceeds the Next download limits. Choose a smaller selection."))
}

fn build(
    ws: &mut Workspace,
    id: Uuid,
    device: Uuid,
    selection: Selection,
    retain: bool,
) -> Result<Checkpoint, String> {
    let deadline = Instant::now() + Duration::from_secs(5);
    let ids = serde_json::to_string(&selection.ids).map_err(error)?;
    let mut queues=ws.db.prepare(
        "WITH RECURSIVE chosen(id) AS (
            SELECT value FROM json_each(?2)
            UNION SELECT c.id FROM collections c JOIN chosen p ON p.id=c.parent_id
         )
         SELECT DISTINCT r.id FROM resources r LEFT JOIN resource_state s ON s.resource_id=r.id
         WHERE r.id NOT LIKE 'linked:%' AND COALESCE(s.trashed,0)=0 AND
         (?1='workspace' OR (?1='resources' AND r.id IN (SELECT value FROM json_each(?2)))
            OR (?1='collections' AND EXISTS(SELECT 1 FROM memberships m WHERE m.resource_id=r.id AND m.collection_id IN chosen)))
         ORDER BY r.id LIMIT ?3"
    ).map_err(error)?;
    let scope = match selection.scope {
        Scope::Workspace => "workspace",
        Scope::Collections => "collections",
        Scope::Resources => "resources",
    };
    let seeds = queues
        .query_map(params![scope, ids, MAX_RESOURCES + 1], |r| {
            r.get::<_, String>(0)
        })
        .map_err(error)?
        .collect::<Result<BTreeSet<_>, _>>()
        .map_err(error)?;
    drop(queues);
    if seeds.len() > MAX_RESOURCES {
        return Err("Too many resources".into());
    }

    let mut scheduled = seeds.clone();
    let mut queue = seeds.iter().cloned().collect::<VecDeque<_>>();
    let mut payloads = HashMap::new();
    let mut entries = Vec::new();
    let mut covered = BTreeSet::new();
    let mut referenced = BTreeSet::new();
    let mut organization = BTreeMap::<String, Value>::new();
    let mut tags = BTreeMap::<String, Value>::new();
    let mut notes = 0;
    let mut files = 0;
    let mut omitted = 0;
    let mut total = 0;
    let mut metadata = 0;
    while let Some(rid) = queue.pop_front() {
        if Instant::now() > deadline {
            return Err("Checkpoint preparation time limit".into());
        }
        let exists=ws.db.query_row(
            "SELECT EXISTS(SELECT 1 FROM resources r LEFT JOIN resource_state s ON s.resource_id=r.id
             WHERE r.id=?1 AND COALESCE(s.trashed,0)=0)",[&rid],|r|r.get::<_,bool>(0)
        ).map_err(error)?;
        if !exists {
            referenced.insert(rid);
            continue;
        }
        let mut item = summary(ws, &rid, false)?;
        let mut references = BTreeSet::new();
        if item["type"] == "note" {
            notes += 1;
            let content = ws.execute(Request::Read { id: rid.clone() })?["content"].clone();
            let bytes = serde_json::to_vec(&content).map_err(error)?;
            if bytes.len() > 1024 * 1024 {
                return Err("Note is larger than the Android limit".into());
            }
            total += bytes.len() as u64;
            metadata += bytes.len();
            let key = format!("{rid}.json");
            item["document"] = document(&key, &bytes);
            if retain {
                payloads.insert(key, Bytes::from(bytes));
            }
            let mut edges = ws
                .db
                .prepare("SELECT target_id,kind FROM resource_links WHERE source_id=?1 LIMIT 20001")
                .map_err(error)?;
            for row in edges
                .query_map([&rid], |r| {
                    Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?))
                })
                .map_err(error)?
            {
                let (target, kind) = row.map_err(error)?;
                let Ok(uuid) = Uuid::parse_str(&target) else {
                    continue;
                };
                if uuid.to_string() != target {
                    continue;
                }
                references.insert(target.clone());
                if (selection.dependencies == Dependencies::Linked
                    || (selection.dependencies == Dependencies::Images && kind == "image"))
                    && scheduled.insert(target.clone())
                {
                    if scheduled.len() > MAX_RESOURCES {
                        return Err("Too many dependencies".into());
                    }
                    queue.push_back(target);
                }
            }
        } else {
            let mime = item["mimeType"]
                .as_str()
                .unwrap_or("application/octet-stream");
            if !seeds.contains(&rid)
                && selection.dependencies == Dependencies::Images
                && !mime.starts_with("image/")
            {
                referenced.insert(rid);
                continue;
            }
            files += 1;
            let readable = mime.starts_with("text/")
                || matches!(
                    mime,
                    "image/png" | "image/jpeg" | "image/gif" | "image/webp" | "application/pdf"
                );
            let (length, hash): (u64, String) = ws
                .db
                .query_row(
                    "SELECT bytes,hash FROM managed_originals WHERE resource_id=?1",
                    [&rid],
                    |r| Ok((r.get(0)?, r.get(1)?)),
                )
                .map_err(error)?;
            item["binary"] = if selection.files == Files::Readable && !readable {
                omitted += 1;
                json!({"state":"policy-omitted"})
            } else if length > MAX_FILE {
                omitted += 1;
                json!({"state":"too-large","bytes":length})
            } else {
                total += length;
                json!({"key":format!("{rid}.bin"),"bytes":length,"sha256":hash,"state":"available","mediaType":mime})
            };
        }
        item["references"] = json!(references);
        referenced.extend(references);
        if referenced.len() > 20_000 {
            return Err("Too many linked references".into());
        }
        for group in item["collections"].as_array().into_iter().flatten() {
            let key = group["id"].as_str().ok_or("Missing collection ID")?;
            let row = organization
                .entry(key.to_owned())
                .or_insert_with(|| json!({"id":key,"name":group["name"],"resources":[]}));
            row["resources"]
                .as_array_mut()
                .ok_or("Invalid collection membership")?
                .push(json!(rid));
        }
        for tag in item["tags"].as_array().into_iter().flatten() {
            tags.insert(
                tag["id"].as_str().ok_or("Missing tag ID")?.to_owned(),
                tag.clone(),
            );
        }
        item["state"] = json!("available");
        let entry_len = serde_json::to_vec(&item).map_err(error)?.len();
        if entry_len > 48_000 {
            return Err("Resource metadata too large".into());
        }
        metadata += entry_len;
        if metadata > MAX_METADATA || total > MAX_BYTES {
            return Err("Checkpoint budget exceeded".into());
        }
        covered.insert(rid);
        entries.push(item);
    }
    if selection.scope == Scope::Resources {
        referenced.extend(selection.ids.iter().map(Uuid::to_string));
    }
    let mut groups = ws
        .db
        .prepare(
            "WITH RECURSIVE chosen(id) AS (
            SELECT value FROM json_each(?2)
            UNION SELECT c.id FROM collections c JOIN chosen p ON p.id=c.parent_id
         )
         SELECT c.id,c.name,c.parent_id,COALESCE(s.pinned,0) FROM collections c
         LEFT JOIN collection_state s ON s.collection_id=c.id
         WHERE ?1='workspace' OR c.id IN chosen OR c.id IN (SELECT value FROM json_each(?3))
         ORDER BY c.id LIMIT ?4",
        )
        .map_err(error)?;
    let selected_collections = if selection.scope == Scope::Collections {
        ids
    } else {
        "[]".into()
    };
    let included =
        serde_json::to_string(&organization.keys().collect::<Vec<_>>()).map_err(error)?;
    let rows = groups
        .query_map(
            params![scope, selected_collections, included, MAX_RESOURCES + 1],
            |r| {
                Ok((
                    r.get::<_, String>(0)?,
                    r.get::<_, String>(1)?,
                    r.get::<_, Option<String>>(2)?,
                    r.get::<_, bool>(3)?,
                ))
            },
        )
        .map_err(error)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(error)?;
    if rows.len() > MAX_RESOURCES {
        return Err("Too many collections".into());
    }
    for (id, name, parent, pinned) in rows {
        let row = organization
            .entry(id.clone())
            .or_insert_with(|| json!({"id":id,"name":name,"resources":[]}));
        row["favorite"] = json!(pinned);
        row["parentId"] = json!(parent);
    }
    let organization=serde_json::to_vec(&json!({"collections":organization.into_values().collect::<Vec<_>>(),"tags":tags.into_values().collect::<Vec<_>>()})).map_err(error)?;
    if organization.len() > 8 * 1024 * 1024 {
        return Err("Organization exceeds Android storage format".into());
    }
    total += organization.len() as u64;
    let org = document("organization.json", &organization);
    if retain {
        payloads.insert("organization.json".into(), Bytes::from(organization));
    }

    entries.sort_by(|a, b| a["id"].as_str().cmp(&b["id"].as_str()));
    let coverage = referenced
        .difference(&covered)
        .map(|id| json!({"id":id,"reason":"unavailable-or-not-selected"}))
        .collect::<Vec<_>>();
    let manifest=serde_json::to_vec(&json!({"version":1,"id":id,"workspaceId":selection.generation,"generation":selection.generation,
        "selection":selection,"resources":entries,"excluded":coverage,"organization":org,"bytes":total})).map_err(error)?;
    total += manifest.len() as u64;
    if total > MAX_BYTES {
        return Err("Checkpoint budget exceeded".into());
    }
    let pin = format!("{:x}", Sha256::digest(&manifest));
    if retain {
        payloads.insert("manifest.json".into(), Bytes::from(manifest));
    }
    let estimate = json!({"resources":entries.len(),"notes":notes,"files":files,"bytes":total,"omittedFiles":omitted,"unavailable":coverage.len(),"exactBytes":true});
    Ok(Checkpoint {
        device,
        selection,
        created: Instant::now(),
        entries,
        coverage,
        payloads,
        organization: org,
        pin,
        estimate,
    })
}

fn document(key: &str, bytes: &[u8]) -> Value {
    json!({"key":key,"bytes":bytes.len(),"sha256":format!("{:x}",Sha256::digest(bytes)),"state":"available","mediaType":"application/json"})
}

async fn lookup(
    host: &Host,
    headers: &HeaderMap,
    id: Uuid,
    pin: bool,
) -> MobileResult<(Arc<Checkpoint>, Uuid)> {
    let workspace = selected(host, headers)?;
    let grant = host.authorize(headers, workspace).await?;
    let mut cache = host
        .mobile_checkpoints
        .lock()
        .map_err(|_| StatusCode::SERVICE_UNAVAILABLE)?;
    cache.prune();
    let value = cache
        .entries
        .get(&id)
        .filter(|c| c.device == grant.device && c.selection.generation == workspace)
        .ok_or_else(|| {
            Problem(
                StatusCode::NOT_FOUND,
                "COMPANION_EXPIRED",
                "Checkpoint unavailable or expired. Prepare it again.",
            )
        })?;
    if pin
        && !headers
            .get(header::IF_MATCH)
            .is_some_and(|v| v.as_bytes() == format!("\"{}\"", value.pin).as_bytes())
    {
        return Err(Problem(
            StatusCode::PRECONDITION_FAILED,
            "COMPANION_EXPIRED",
            "Checkpoint changed. Prepare it again.",
        ));
    }
    Ok((value.clone(), workspace))
}

async fn status(
    State(host): State<Host>,
    RoutePath(id): RoutePath<Uuid>,
    headers: HeaderMap,
) -> MobileResult<Json<Value>> {
    Ok(Json(lookup(&host, &headers, id, false).await?.0.status()))
}

async fn remove(
    State(host): State<Host>,
    RoutePath(id): RoutePath<Uuid>,
    headers: HeaderMap,
) -> MobileResult<Json<Value>> {
    let (checkpoint, _) = lookup(&host, &headers, id, false).await?;
    let mut cache = host
        .mobile_checkpoints
        .lock()
        .map_err(|_| StatusCode::SERVICE_UNAVAILABLE)?;
    if cache
        .entries
        .get(&id)
        .is_some_and(|current| Arc::ptr_eq(&checkpoint, current))
    {
        cache.entries.remove(&id);
    }
    Ok(Json(json!({})))
}

#[derive(Deserialize)]
struct Page {
    page: u32,
    size: u32,
}

fn slice(items: &[Value], query: Page) -> MobileResult<Value> {
    if !(1..=100).contains(&query.size) || query.page > 10000 {
        return Err(StatusCode::BAD_REQUEST.into());
    }
    let offset = (query.page * query.size) as usize;
    Ok(page(
        items
            .iter()
            .skip(offset)
            .take(query.size as usize)
            .cloned()
            .collect(),
        query.page,
        query.size,
        items.len() as u64,
    ))
}

async fn inventory(
    State(host): State<Host>,
    RoutePath(id): RoutePath<Uuid>,
    headers: HeaderMap,
    Query(query): Query<Page>,
) -> MobileResult<Json<Value>> {
    let (checkpoint, workspace) = lookup(&host, &headers, id, true).await?;
    if query.size > 25 {
        return Err(StatusCode::BAD_REQUEST.into());
    }
    let mut result = slice(&checkpoint.entries, query)?;
    result["snapshot"] = json!(id);
    result["generation"] = json!(workspace);
    result["organization"] = checkpoint.organization.clone();
    result["manifestSha256"] = json!(checkpoint.pin);
    Ok(Json(result))
}

async fn coverage(
    State(host): State<Host>,
    RoutePath(id): RoutePath<Uuid>,
    headers: HeaderMap,
    Query(query): Query<Page>,
) -> MobileResult<Json<Value>> {
    let (checkpoint, _) = lookup(&host, &headers, id, true).await?;
    let mut result = slice(&checkpoint.coverage, query)?;
    result["snapshot"] = json!(id);
    Ok(Json(result))
}

async fn payload(
    State(host): State<Host>,
    RoutePath((id, key)): RoutePath<(Uuid, String)>,
    mut headers: HeaderMap,
) -> MobileResult<Response> {
    let (checkpoint, workspace) = lookup(&host, &headers, id, true).await?;
    if let Some(resource) = key.strip_suffix(".bin") {
        let entry = checkpoint
            .entries
            .binary_search_by(|item| item["id"].as_str().unwrap_or("").cmp(resource))
            .ok()
            .and_then(|i| checkpoint.entries.get(i))
            .ok_or(StatusCode::NOT_FOUND)?;
        let hash = entry["binary"]["sha256"]
            .as_str()
            .ok_or(StatusCode::NOT_FOUND)?;
        headers.insert(
            "x-vaultor-payload-sha256",
            hash.parse()
                .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?,
        );
        return Ok(file(
            State(host),
            RoutePath((workspace, resource.to_owned())),
            headers,
        )
        .await?);
    }
    let bytes = checkpoint.payloads.get(&key).ok_or(StatusCode::NOT_FOUND)?;
    let (start, len, partial) =
        file_range(&headers, bytes.len() as u64).ok_or(StatusCode::RANGE_NOT_SATISFIABLE)?;
    let sha = if key == "manifest.json" {
        checkpoint.pin.clone()
    } else {
        format!("{:x}", Sha256::digest(bytes))
    };
    let mut response = Response::builder()
        .status(if partial {
            StatusCode::PARTIAL_CONTENT
        } else {
            StatusCode::OK
        })
        .header(header::CONTENT_TYPE, "application/json")
        .header(header::CONTENT_LENGTH, len)
        .header(header::ACCEPT_RANGES, "bytes")
        .header("x-vaultor-sha256", sha);
    if partial {
        response = response.header(
            header::CONTENT_RANGE,
            format!("bytes {start}-{}/{}", start + len - 1, bytes.len()),
        );
    }
    response
        .body(Body::from(
            bytes.slice(start as usize..(start + len) as usize),
        ))
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR.into())
}
