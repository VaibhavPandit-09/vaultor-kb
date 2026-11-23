//! Browser collection and tag operations under the existing browser-only middleware.
use super::*;
use crate::{
    domain::{error, title, Workspace},
    organization::Request as Org,
};
use rusqlite::OptionalExtension;
use sha2::{Digest, Sha256};

pub(super) fn router() -> Router<Host> {
    Router::new()
        .route("/organization/collections/{id}", put(collection))
        .route("/organization/tags", get(tags).put(tag))
        .layer(DefaultBodyLimit::max(4096))
}

async fn scoped(
    host: Host,
    headers: HeaderMap,
    action: impl FnOnce(&mut Workspace, Uuid) -> Result<Value, String> + Send + 'static,
) -> ApiResult<Json<Value>> {
    let workspace = headers
        .get("x-vaultor-workspace")
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.parse::<Uuid>().ok())
        .ok_or(StatusCode::BAD_REQUEST)?;
    let _permit = host
        .requests
        .try_acquire()
        .map_err(|_| StatusCode::SERVICE_UNAVAILABLE)?;
    let grant = host.authorize(&headers, workspace).await?;
    let gate = host.enrollment.clone();
    let access = host.access.clone();
    let stop = host.stop.clone();
    let result = host
        .storage
        .call_host(&host.root, move |ws| {
            let _guard = gate.lock().map_err(error)?;
            if stop.is_cancelled()
                || !grant.current_sync(&access, workspace)
                || ws.review_generation()? != workspace.to_string()
            {
                return Ok(Value::Null);
            }
            Ok(json!({"result":action(ws, grant.device)?}))
        })
        .await
        .map_err(|_| StatusCode::CONFLICT)?;
    result
        .get("result")
        .cloned()
        .map(Json)
        .ok_or(StatusCode::FORBIDDEN)
}

#[derive(Deserialize)]
#[serde(
    tag = "operation",
    rename_all = "camelCase",
    rename_all_fields = "camelCase",
    deny_unknown_fields
)]
enum CollectionChange {
    Create {
        name: String,
        parent_id: Option<Uuid>,
    },
    Update {
        name: String,
        parent_id: Option<Uuid>,
        expected_name: String,
        expected_parent_id: Option<Uuid>,
    },
    ReviewDeletion,
    Delete {
        review: String,
        trash: bool,
    },
}

fn saved_collection(ws: &Workspace, id: &str) -> Result<Option<(String, Option<String>)>, String> {
    ws.db
        .query_row(
            "SELECT name,parent_id FROM collections WHERE id=?1",
            [id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .optional()
        .map_err(error)
}

fn checksum(plan: &Value) -> String {
    hex::encode(Sha256::digest(plan.to_string()))
}

async fn collection(
    State(host): State<Host>,
    RoutePath(id): RoutePath<Uuid>,
    headers: HeaderMap,
    Json(change): Json<CollectionChange>,
) -> ApiResult<Json<Value>> {
    let id = id.to_string();
    let mutates = !matches!(change, CollectionChange::ReviewDeletion);
    let result = scoped(host.clone(), headers, move |ws, device| match change {
        CollectionChange::Create { name, parent_id } => {
            ws.create_collection_once(id, device.to_string(), name, parent_id.map(|p| p.to_string()))
        }
        CollectionChange::Update { name, parent_id, expected_name, expected_parent_id } => {
            let parent = parent_id.map(|p| p.to_string());
            let name = title(&name)?.to_owned();
            let current = saved_collection(ws, &id)?.ok_or("Collection no longer exists")?;
            if current == (name.clone(), parent.clone()) {
                return Ok(json!({"id":id,"name":name,"parentId":parent}));
            }
            if current != (expected_name, expected_parent_id.map(|p| p.to_string())) {
                return Err("Collection changed; refresh before editing".into());
            }
            ws.collection(Some(id), name, parent)
        }
        CollectionChange::ReviewDeletion => {
            let plan = ws.organization(Org::CollectionPlan {id})?;
            Ok(json!({"review":checksum(&plan),"collections":plan["collections"].as_array().map(Vec::len),
                "exclusive":plan["exclusive"].as_array().map(Vec::len)}))
        }
        CollectionChange::Delete { review, trash } => {
            if saved_collection(ws, &id)?.is_none() {
                return Ok(Value::Null);
            }
            let plan = ws.organization(Org::CollectionPlan {id:id.clone()})?;
            if checksum(&plan) != review {
                return Err("Collection changed; review again".into());
            }
            ws.organization(Org::DeleteCollection { id, trash, plan: plan.to_string() })
        }
    }).await?;
    if mutates {
        host.workspace_changed();
    }
    Ok(result)
}

#[derive(Deserialize)]
struct TagSearch {
    #[serde(default)]
    q: String,
    after: Option<String>,
}

async fn tags(
    State(host): State<Host>,
    headers: HeaderMap,
    Query(query): Query<TagSearch>,
) -> ApiResult<Json<Value>> {
    if query.after.as_ref().is_some_and(|after| after.len() > 960) {
        return Err(StatusCode::BAD_REQUEST);
    }
    scoped(host, headers, move |ws, _| {
        let mut result = ws.organization(Org::Tags {
            query: query.q,
            after: query.after,
        })?;
        for tag in result["items"].as_array_mut().into_iter().flatten() {
            tag.as_object_mut().unwrap().remove("count");
        }
        Ok(result)
    })
    .await
}

#[derive(Deserialize)]
#[serde(
    tag = "operation",
    rename_all = "camelCase",
    rename_all_fields = "camelCase",
    deny_unknown_fields
)]
enum TagChange {
    Create {
        name: String,
        color: String,
    },
    Update {
        id: Uuid,
        name: String,
        color: String,
        expected_name: String,
        expected_color: String,
    },
    Delete {
        id: Uuid,
        expected_name: String,
        expected_color: String,
    },
}

fn saved_tag(ws: &Workspace, id: Uuid) -> Result<Option<(String, String)>, String> {
    ws.db
        .query_row(
            "SELECT name,color FROM tags WHERE id=?1",
            [id.to_string()],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .optional()
        .map_err(error)
}

async fn tag(
    State(host): State<Host>,
    headers: HeaderMap,
    Json(change): Json<TagChange>,
) -> ApiResult<Json<Value>> {
    let result = scoped(host.clone(), headers, move |ws, _| {
        let applied = match change {
            TagChange::Create { name, color } => {
                let normalized = title(&name)?.to_lowercase();
                let existing = ws
                    .db
                    .query_row(
                        "SELECT id FROM tags WHERE normalized=?1",
                        [normalized],
                        |row| row.get::<_, String>(0),
                    )
                    .optional()
                    .map_err(error)?;
                if let Some(id) = existing {
                    return Ok(json!({"id":id}));
                }
                ws.organization(Org::Tag {
                    id: None,
                    name,
                    color,
                })?
            }
            TagChange::Update {
                id,
                name,
                color,
                expected_name,
                expected_color,
            } => {
                let name = title(&name)?.to_owned();
                let current = saved_tag(ws, id)?.ok_or("The tag no longer exists")?;
                if current == (name.clone(), color.clone()) {
                    return Ok(json!({"id":id}));
                }
                if current != (expected_name, expected_color) {
                    return Err("Tag changed; refresh".into());
                }
                ws.organization(Org::Tag {
                    id: Some(id.to_string()),
                    name,
                    color,
                })?
            }
            TagChange::Delete {
                id,
                expected_name,
                expected_color,
            } => {
                match saved_tag(ws, id)? {
                    None => return Ok(Value::Null),
                    Some(current) if current != (expected_name, expected_color) => {
                        return Err("Tag changed; refresh".into())
                    }
                    _ => {}
                }
                ws.organization(Org::DeleteTag { id: id.to_string() })?
            }
        };
        Ok(applied)
    })
    .await?;
    host.workspace_changed();
    Ok(result)
}
