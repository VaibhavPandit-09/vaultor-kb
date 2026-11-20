//! Versioned Android projection of the shared saved workspace.
mod checkpoints;
pub(super) use checkpoints::Checkpoints;

use super::*;
use crate::domain::{error, Workspace};
use axum::extract::OriginalUri;
use rusqlite::params;
use serde_json::Value;
use std::path::Path;

type MobileResult<T> = Result<T, Problem>;

struct Problem(StatusCode, &'static str, &'static str);

impl IntoResponse for Problem {
    fn into_response(self) -> Response {
        (self.0, Json(json!({"code": self.1, "detail": self.2}))).into_response()
    }
}

impl From<StatusCode> for Problem {
    fn from(status: StatusCode) -> Self {
        let (code, detail) = match status {
            StatusCode::UNAUTHORIZED => (
                "DEVICE_APPROVAL_REQUIRED",
                "Device approval is missing or revoked. Pair again on the host.",
            ),
            StatusCode::FORBIDDEN => (
                "WORKSPACE_ACCESS_REVOKED",
                "Workspace access is unavailable. Ask the host to grant access.",
            ),
            StatusCode::NOT_FOUND => ("RESOURCE_NOT_FOUND", "The saved resource is unavailable."),
            StatusCode::CONFLICT => (
                "WORKSPACE_BUSY",
                "The workspace changed or is busy. Try again.",
            ),
            StatusCode::SERVICE_UNAVAILABLE => (
                "HOST_UNAVAILABLE",
                "The workspace is busy or hosting has stopped. Try again.",
            ),
            _ => (
                "REQUEST_REJECTED",
                "The host could not complete this request.",
            ),
        };
        Self(status, code, detail)
    }
}

pub(super) fn router() -> Router<Host> {
    Router::new()
        .route("/capabilities", get(capabilities))
        .route("/workspaces", get(workspace_list))
        .route("/workspaces/{id}", get(workspace_destination))
        .route("/workspace/identity", get(identity))
        .route("/settings/workspace", get(identity))
        .route("/resources", get(browse))
        .route("/resources/query", get(browse))
        .route("/resources/trash", get(browse))
        .route("/organization/pins", get(browse))
        .route("/collections", get(browse))
        .route("/collections/{id}", get(collection))
        .route("/tags/browse", get(browse))
        .route("/resources/{id}", get(resource))
        .route("/resources/{id}/summary", get(resource))
        .route("/resources/{id}/open", post(open_resource))
        .route("/resources/{id}/raw", get(original))
        .route("/resources/{id}/references", get(references))
        .route("/changes", get(events))
        .route(
            "/reviews/{operation}/{resource}",
            get(get_review).put(put_review),
        )
        .merge(checkpoints::router())
}

fn selected(host: &Host, headers: &HeaderMap) -> MobileResult<Uuid> {
    match headers.get("x-vaultor-workspace") {
        None => Ok(host.workspace),
        Some(id) => id
            .to_str()
            .ok()
            .and_then(|s| s.parse().ok())
            .ok_or_else(|| StatusCode::BAD_REQUEST.into()),
    }
}

async fn read<T>(
    host: &Host,
    headers: &HeaderMap,
    workspace: Uuid,
    action: impl FnOnce(&mut Workspace) -> Result<Value, String> + Send + 'static,
    project: impl FnOnce(Value) -> T,
    failure: StatusCode,
) -> MobileResult<T> {
    let _permit = host
        .requests
        .try_acquire()
        .map_err(|_| StatusCode::SERVICE_UNAVAILABLE)?;
    host.authorize(headers, workspace).await?;
    let generation = workspace.to_string();
    let value = host
        .storage
        .call_host(&host.root, move |ws| {
            if ws.review_generation()? != generation {
                return Err("Workspace changed".into());
            }
            action(ws)
        })
        .await
        .map_err(|_| failure)?;
    host.authorize(headers, workspace).await?;
    Ok(project(value))
}

fn workspace_info(host: &Host) -> Value {
    let name = host
        .root
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("Vaultor workspace");
    json!({"id":host.workspace,"generation":host.workspace,"name":name})
}

async fn capabilities(State(host): State<Host>, headers: HeaderMap) -> MobileResult<Json<Value>> {
    host.grant(&headers).await?;
    if headers.contains_key("x-vaultor-workspace") {
        host.authorize(&headers, selected(&host, &headers)?).await?;
    }
    Ok(Json(json!({
        "apiProtocolVersion":3,"minimumClientProtocolVersion":3,
        "multiWorkspace":true,"companionSnapshots":1,"reviews":1,"nextMobile":1
    })))
}

async fn workspace_list(State(host): State<Host>, headers: HeaderMap) -> MobileResult<Json<Value>> {
    let grant = host.grant(&headers).await?;
    Ok(Json(if grant.workspaces.contains(&host.workspace) {
        json!([workspace_info(&host)])
    } else {
        json!([])
    }))
}

async fn workspace_destination(
    State(host): State<Host>,
    RoutePath(id): RoutePath<Uuid>,
    headers: HeaderMap,
) -> MobileResult<Json<Value>> {
    host.authorize(&headers, id).await?;
    Ok(Json(workspace_info(&host)))
}

async fn identity(State(host): State<Host>, headers: HeaderMap) -> MobileResult<Json<Value>> {
    let workspace = selected(&host, &headers)?;
    host.authorize(&headers, workspace).await?;
    Ok(Json(workspace_info(&host)))
}

fn mime(name: &str) -> &'static str {
    match Path::new(name)
        .extension()
        .and_then(|ext| ext.to_str())
        .unwrap_or("")
        .to_ascii_lowercase()
        .as_str()
    {
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "bmp" => "image/bmp",
        "pdf" => "application/pdf",
        "txt" | "log" => "text/plain",
        "md" => "text/markdown",
        "csv" => "text/csv",
        "json" => "text/plain",
        "mp3" => "audio/mpeg",
        "wav" => "audio/wav",
        "ogg" => "audio/ogg",
        "m4a" => "audio/mp4",
        "mp4" => "video/mp4",
        "webm" => "video/webm",
        "mov" => "video/quicktime",
        "flac" => "audio/flac",
        _ => "application/octet-stream",
    }
}

fn summary(workspace: &mut Workspace, id: &str, trashed: bool) -> Result<Value, String> {
    let mut item = workspace.db.query_row(
        "SELECT r.title,r.revision,r.updated_at,o.kind,o.name,o.bytes,
          COALESCE(s.pinned,0),datetime(NULLIF(s.opened,0),'unixepoch'),COALESCE(s.trashed,0)
         FROM resources r LEFT JOIN managed_originals o ON o.resource_id=r.id
         LEFT JOIN resource_state s ON s.resource_id=r.id
         WHERE r.id=?1 AND r.id NOT LIKE 'linked:%' AND (?2 OR COALESCE(s.trashed,0)=0)",
        params![id,trashed], |row| {
            let kind = row.get::<_,Option<String>>(3)?.unwrap_or_else(|| "note".into());
            let name = row.get::<_,Option<String>>(4)?;
            Ok(json!({
                "id":id,"title":row.get::<_,String>(0)?,"revision":row.get::<_,i64>(1)?.to_string(),
                "updatedAt":row.get::<_,String>(2)?,"type":kind,
                "mimeType":name.as_deref().map(mime),"originalName":name,"originalSize":row.get::<_,Option<u64>>(5)?,
                "favorite":row.get::<_,bool>(6)?,"lastOpenedAt":row.get::<_,Option<String>>(7)?,
                "trashedAt":row.get::<_,bool>(8)?.then(|| row.get::<_,String>(2)).transpose()?
            }))
        }).map_err(error)?;
    let presentation = workspace.media(json!({"op":"presentation","ids":[id]}))?;
    item["tags"] = presentation[0]["tags"].clone();
    item["collections"] = presentation[0]["collections"].clone();
    Ok(item)
}

async fn resource(
    State(host): State<Host>,
    RoutePath(id): RoutePath<Uuid>,
    OriginalUri(uri): OriginalUri,
    headers: HeaderMap,
) -> MobileResult<Json<Value>> {
    let workspace = selected(&host, &headers)?;
    let summary_only = uri.path().ends_with("/summary");
    read(
        &host,
        &headers,
        workspace,
        move |ws| {
            let id = id.to_string();
            let mut item = summary(ws, &id, false)?;
            if !summary_only && item["type"] == "note" {
                item["content"] = ws.execute(Request::Read { id })?["content"].clone();
            }
            Ok(item)
        },
        Json,
        StatusCode::NOT_FOUND,
    )
    .await
}

async fn open_resource(
    State(host): State<Host>,
    RoutePath(id): RoutePath<Uuid>,
    headers: HeaderMap,
) -> MobileResult<Json<Value>> {
    // Recency is presentation metadata; keep it on the same workspace owner.
    let workspace = selected(&host, &headers)?;
    read(&host, &headers, workspace, move |ws| {
        let id = id.to_string();
        summary(ws, &id, false)?;
        ws.db.execute(
            "INSERT INTO resource_state(resource_id,opened) VALUES(?1,unixepoch())
             ON CONFLICT(resource_id) DO UPDATE SET opened=excluded.opened WHERE opened<excluded.opened-15",
            [&id],
        ).map_err(error)?;
        Ok(json!({}))
    }, Json, StatusCode::NOT_FOUND).await
}

#[derive(Default, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Browse {
    #[serde(default)]
    page: u32,
    size: Option<u32>,
    #[serde(default)]
    q: String,
    kind: Option<String>,
    #[serde(rename = "type")]
    resource_type: Option<String>,
    category: Option<String>,
    collection: Option<Uuid>,
    sort: Option<String>,
    #[serde(default)]
    favorites: bool,
}

fn page(items: Vec<Value>, index: u32, size: u32, total: u64) -> Value {
    json!({"items":items,"page":index,"size":size,"totalItems":total,"totalPages":total.div_ceil(size as u64)})
}

fn collections(
    ws: &Workspace,
    query: &str,
    only_pins: bool,
    limit: u32,
    offset: u32,
) -> Result<(Vec<Value>, u64), String> {
    let filter = " FROM collections c LEFT JOIN collection_state s ON s.collection_id=c.id
        WHERE (instr(lower(c.name),lower(?1))>0 OR ?1='') AND (?4=0 OR s.pinned=1) ";
    let sql = format!(
        "SELECT c.id,c.name,c.parent_id,COALESCE(s.pinned,0),
        (SELECT count(*) FROM memberships m JOIN resources r ON r.id=m.resource_id
         LEFT JOIN resource_state rs ON rs.resource_id=r.id WHERE m.collection_id=c.id
         AND r.id NOT LIKE 'linked:%' AND COALESCE(rs.trashed,0)=0)
        {filter} ORDER BY lower(c.name),c.id LIMIT ?2 OFFSET ?3"
    );
    let mut statement = ws.db.prepare(&sql).map_err(error)?;
    let items = statement
        .query_map(params![query, limit, offset, only_pins], |row| {
            Ok(
                json!({"id":row.get::<_,String>(0)?,"name":row.get::<_,String>(1)?,
            "parentId":row.get::<_,Option<String>>(2)?,"favorite":row.get::<_,bool>(3)?,
            "resourceCount":row.get::<_,u64>(4)?,"count":row.get::<_,u64>(4)?}),
            )
        })
        .map_err(error)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(error)?;
    let total = ws.db.query_row(
        "SELECT count(*) FROM collections c LEFT JOIN collection_state s ON s.collection_id=c.id
         WHERE (instr(lower(c.name),lower(?1))>0 OR ?1='') AND (?2=0 OR s.pinned=1)",
        params![query,only_pins], |r| r.get(0)).map_err(error)?;
    Ok((items, total))
}

async fn browse(
    State(host): State<Host>,
    OriginalUri(uri): OriginalUri,
    headers: HeaderMap,
    Query(query): Query<Browse>,
) -> MobileResult<Json<Value>> {
    let workspace = selected(&host, &headers)?;
    let route = uri.path().to_owned();
    let size = query.size.unwrap_or(30);
    if !(1..=100).contains(&size) || query.page > 100_000 || query.q.chars().count() > 256 {
        return Err(StatusCode::BAD_REQUEST.into());
    }
    read(
        &host,
        &headers,
        workspace,
        move |ws| browse_saved(ws, &route, query, size),
        Json,
        StatusCode::BAD_REQUEST,
    )
    .await
}

fn browse_saved(
    ws: &mut Workspace,
    route: &str,
    query: Browse,
    size: u32,
) -> Result<Value, String> {
    let offset = query.page * size;
    let pins = route.ends_with("/pins");
    if route.ends_with("/collections") || (pins && query.kind.as_deref() == Some("collection")) {
        let (items, total) = collections(ws, &query.q, pins || query.favorites, size, offset)?;
        return Ok(page(items, query.page, size, total));
    }
    if route.ends_with("/tags/browse") {
        let mut stmt = ws.db.prepare(
            "SELECT t.id,t.name,t.color,count(*) FROM tags t JOIN resource_tags a ON a.tag_id=t.id
             JOIN resources r ON r.id=a.resource_id LEFT JOIN resource_state s ON s.resource_id=r.id
             WHERE r.id NOT LIKE 'linked:%' AND COALESCE(s.trashed,0)=0 AND instr(t.normalized,lower(?1))>0
             GROUP BY t.id ORDER BY t.normalized,t.id LIMIT ?2 OFFSET ?3"
        ).map_err(error)?;
        let items = stmt.query_map(params![query.q,size,offset],|r| Ok(json!({
            "id":r.get::<_,String>(0)?,"name":r.get::<_,String>(1)?,"color":r.get::<_,String>(2)?,
            "count":r.get::<_,u64>(3)?,"resourceCount":r.get::<_,u64>(3)?
        }))).map_err(error)?.collect::<Result<Vec<_>,_>>().map_err(error)?;
        let total = ws.db.query_row("SELECT count(DISTINCT t.id) FROM tags t JOIN resource_tags a ON a.tag_id=t.id
             JOIN resources r ON r.id=a.resource_id LEFT JOIN resource_state s ON s.resource_id=r.id
             WHERE r.id NOT LIKE 'linked:%' AND COALESCE(s.trashed,0)=0 AND instr(t.normalized,lower(?1))>0",
             [query.q],|r|r.get(0)).map_err(error)?;
        return Ok(page(items, query.page, size, total));
    }
    let content = route.ends_with("/query");
    let trash = route.ends_with("/trash");
    let recent = query.sort.as_deref() == Some("recent");
    let kind = query.category.or(query.resource_type).or(query.kind);
    if kind.as_deref().is_some_and(|k| {
        !matches!(k, "note" | "file") && !crate::file_category::CATEGORIES.contains(&k)
    }) {
        return Err("Invalid mobile resource filter".into());
    }
    // Project pinned collections before resources in the unfiltered mixed view.
    let (mut items, collection_count) = if pins && kind.is_none() {
        let (entries, count) = collections(ws, &query.q, true, size, offset)?;
        (
            entries
                .into_iter()
                .map(|mut item| {
                    item["kind"] = json!("collection");
                    item
                })
                .collect::<Vec<_>>(),
            count,
        )
    } else {
        (Vec::new(), 0)
    };
    let options = crate::search::SearchOptions {
        query: query.q,
        content,
        collection: query.collection.map(|id| id.to_string()),
        order: if query.sort.as_deref() == Some("title") {
            "title"
        } else {
            "updated"
        }
        .into(),
        view: if trash {
            "trash"
        } else if pins || query.favorites {
            "pinned"
        } else if recent {
            "recent"
        } else {
            "library"
        }
        .into(),
        tag: None,
        kind: Some(kind.unwrap_or_else(|| "managed".into())),
        tags: Vec::new(),
        any_tag: false,
    };
    let remaining = size.saturating_sub(items.len() as u32);
    let result = ws.mobile_search(
        options,
        remaining.max(1),
        offset.saturating_sub(collection_count as u32),
    )?;
    for hit in result["items"]
        .as_array()
        .into_iter()
        .flatten()
        .take(remaining as usize)
    {
        let id = hit["id"].as_str().ok_or("Missing resource ID")?;
        let item = summary(ws, id, trash)?;
        items.push(if pins {
            json!({"kind":"resource","id":id,"resource":item})
        } else if content {
            json!({"resource":item,"snippet":hit["searchSnippet"]})
        } else {
            item
        });
    }
    Ok(page(
        items,
        query.page,
        size,
        collection_count + result["total"].as_u64().unwrap_or(0),
    ))
}

async fn collection(
    State(host): State<Host>,
    RoutePath(id): RoutePath<Uuid>,
    headers: HeaderMap,
) -> MobileResult<Json<Value>> {
    let workspace = selected(&host, &headers)?;
    read(&host,&headers,workspace,move |ws| ws.db.query_row(
        "SELECT id,name,parent_id FROM collections WHERE id=?1",[id.to_string()],
        |r|Ok(json!({"id":r.get::<_,String>(0)?,"name":r.get::<_,String>(1)?,"parentId":r.get::<_,Option<String>>(2)?}))
    ).map_err(error),Json,StatusCode::NOT_FOUND).await
}

#[derive(Deserialize)]
struct ReferenceQuery {
    direction: String,
    page: u32,
}

async fn references(
    State(host): State<Host>,
    RoutePath(id): RoutePath<Uuid>,
    headers: HeaderMap,
    Query(query): Query<ReferenceQuery>,
) -> MobileResult<Json<Value>> {
    let workspace = selected(&host, &headers)?;
    if query.page > 10_000 || !matches!(query.direction.as_str(), "outgoing" | "incoming") {
        return Err(StatusCode::BAD_REQUEST.into());
    }
    read(
        &host,
        &headers,
        workspace,
        move |ws| {
            let id = id.to_string();
            summary(ws, &id, false)?;
            ws.reference_page_for(&id, &query.direction, query.page.into(), true)
        },
        Json,
        StatusCode::NOT_FOUND,
    )
    .await
}

async fn original(
    State(host): State<Host>,
    RoutePath(id): RoutePath<Uuid>,
    headers: HeaderMap,
) -> MobileResult<Response> {
    let workspace = selected(&host, &headers)?;
    Ok(file(State(host), RoutePath((workspace, id.to_string())), headers).await?)
}

async fn events(State(host): State<Host>, headers: HeaderMap) -> MobileResult<Response> {
    let workspace = selected(&host, &headers)?;
    Ok(change_stream(host, workspace, headers, true).await?)
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ReviewInput {
    generation: Uuid,
    resource_id: Uuid,
    base_revision: String,
    comment: String,
    quote: String,
    context: String,
    locator: crate::reviews::Locator,
}

async fn put_review(
    State(host): State<Host>,
    RoutePath((operation, resource)): RoutePath<(Uuid, Uuid)>,
    headers: HeaderMap,
    Json(input): Json<ReviewInput>,
) -> MobileResult<Json<Value>> {
    let workspace = selected(&host, &headers)?;
    host.authorize(&headers, workspace).await?;
    if input.generation != workspace {
        return Err(Problem(
            StatusCode::CONFLICT,
            "REVIEW_GENERATION_CHANGED",
            "This Review belongs to a former workspace.",
        ));
    }
    let revision = input
        .base_revision
        .parse::<i64>()
        .map_err(|_| StatusCode::BAD_REQUEST)?;
    if input.resource_id != resource || revision <= 0 {
        return Err(StatusCode::BAD_REQUEST.into());
    }
    let input = crate::reviews::Submission {
        id: operation.to_string(),
        resource_id: resource.to_string(),
        base_revision: revision,
        comment: input.comment,
        quote: input.quote,
        context: input.context,
        locator: Some(input.locator),
    };
    match review(host, workspace, resource, operation, headers, Some(input)).await {
        Err(StatusCode::CONFLICT) => Err(Problem(
            StatusCode::CONFLICT,
            "REVIEW_CONFLICT",
            "The host refused this evidence or already has different evidence for this operation.",
        )),
        result => Ok(result?),
    }
}

async fn get_review(
    State(host): State<Host>,
    RoutePath((operation, resource)): RoutePath<(Uuid, Uuid)>,
    headers: HeaderMap,
) -> MobileResult<Json<Value>> {
    let workspace = selected(&host, &headers)?;
    match review(host, workspace, resource, operation, headers, None).await {
        Err(StatusCode::CONFLICT) => Err(Problem(
            StatusCode::NOT_FOUND,
            "REVIEW_NOT_FOUND",
            "The Review receipt is unavailable.",
        )),
        result => Ok(result?),
    }
}
