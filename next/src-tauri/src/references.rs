use crate::domain::{error, Workspace};
use rusqlite::{params, Connection, OptionalExtension};
use serde_json::{json, Value};

pub(crate) fn initialize(db: &Connection) -> Result<(), String> {
    db.execute_batch("CREATE VIEW IF NOT EXISTS saved_reference_edges AS
        SELECT source_id,target_id,kind,NULL AS occurrences FROM resource_links
        UNION ALL
        SELECT origin.resource_id,
            COALESCE((SELECT i.resource_id FROM linked_documents target JOIN linked_inventory i ON i.document_id=target.id
                WHERE target.source_id=d.source_id AND target.path_key=ref.path_key AND i.available=1
                GROUP BY target.path_key HAVING count(*)=1),'unavailable:'||ref.path_key),
            'relative',ref.occurrences
        FROM linked_references ref JOIN linked_documents d ON d.id=ref.document_id
        JOIN linked_inventory origin ON origin.document_id=d.id;").map_err(error)
}

impl Workspace {
    pub(crate) fn reference_page(
        &self,
        id: &str,
        direction: &str,
        page: u64,
    ) -> Result<Value, String> {
        if page > 10000 || !matches!(direction, "incoming" | "outgoing") {
            return Err("Unsupported reference page".into());
        }
        let revision: i64 = self
            .db
            .query_row(
                "SELECT revision FROM visible_resources WHERE id=?1",
                [id],
                |r| r.get(0),
            )
            .map_err(error)?;
        let archived="NOT EXISTS(SELECT 1 FROM resource_state state WHERE state.resource_id=e.source_id AND state.trashed=1)";
        let (other, filter) = if direction == "incoming" {
            ("e.source_id",format!("e.target_id=?1 AND e.source_id IN (SELECT id FROM visible_resources) AND {archived}"))
        } else {
            ("e.target_id", "e.source_id=?1".into())
        };
        let total: i64 = self
            .db
            .query_row(
                &format!(
                    "SELECT count(DISTINCT {other}) FROM saved_reference_edges e WHERE {filter}"
                ),
                [id],
                |r| r.get(0),
            )
            .map_err(error)?;
        let mut q=self.db.prepare(&format!("SELECT {other},r.title,COALESCE(r.revision,0),e.kind,e.occurrences,
            COALESCE((SELECT trashed FROM resource_state WHERE resource_id=r.id),0),
            CASE WHEN r.id LIKE 'linked:%' THEN 'linked' ELSE COALESCE((SELECT kind FROM managed_originals WHERE resource_id=r.id),'note') END
            FROM saved_reference_edges e LEFT JOIN visible_resources r ON r.id={other}
            WHERE {filter} AND {other} IN (SELECT {other} FROM saved_reference_edges e LEFT JOIN visible_resources other_row ON other_row.id={other}
                WHERE {filter} GROUP BY {other} ORDER BY lower(other_row.title),{other} LIMIT 30 OFFSET ?2)
            ORDER BY lower(r.title),{other},e.kind")).map_err(error)?;
        let rows = q
            .query_map(params![id, page * 30], |r| {
                Ok((
                    r.get::<_, String>(0)?,
                    r.get::<_, Option<String>>(1)?,
                    r.get::<_, i64>(2)?,
                    r.get::<_, String>(3)?,
                    r.get::<_, Option<i64>>(4)?,
                    r.get::<_, bool>(5)?,
                    r.get::<_, String>(6)?,
                ))
            })
            .map_err(error)?
            .collect::<Result<Vec<_>, _>>()
            .map_err(error)?;
        let mut items: Vec<Value> = Vec::new();
        let mut page_occurrences = 0;
        for (other, title, version, kind, count, trashed, resource_type) in rows {
            let (from, to) = if direction == "incoming" {
                (other.as_str(), id)
            } else {
                (id, other.as_str())
            };
            let (count, occurrences) = if let Some(count) = count {
                (
                    count,
                    vec![
                        json!({"path":"relative","kind":"resource-link","label":"Relative Markdown reference"}),
                    ],
                )
            } else {
                self.managed_occurrences(from, to, &kind)?
            };
            let count_field = match kind.as_str() {
                "image" => "images",
                "link" if resource_type == "note" => "noteLinks",
                "link" if resource_type == "file" => "fileLinks",
                _ => "otherLinks",
            };
            if items.last().is_none_or(|entry| entry["id"] != other) {
                let label = title
                    .as_deref()
                    .unwrap_or_else(|| other.strip_prefix("unavailable:").unwrap_or(&other));
                items.push(json!({"id":other,"title":label,"type":resource_type,"revision":version.to_string(),
                    "available":title.is_some()&&!trashed,"trashed":trashed,"noteLinks":0,"fileLinks":0,"images":0,"otherLinks":0,"occurrences":[]}));
            }
            let item = items.last_mut().unwrap();
            item[count_field] = json!(item[count_field].as_i64().unwrap_or(0) + count);
            let list = item["occurrences"].as_array_mut().unwrap();
            list.extend(
                occurrences
                    .into_iter()
                    .take(20usize.saturating_sub(list.len())),
            );
            page_occurrences += count;
        }
        Ok(
            json!({"items":items,"page":page,"size":30,"totalItems":total,"totalPages":(total+29)/30,
            "totalOccurrences":page_occurrences,"sourceRevision":revision.to_string(),"occurrencesOnPage":true}),
        )
    }

    fn managed_occurrences(
        &self,
        source: &str,
        target: &str,
        kind: &str,
    ) -> Result<(i64, Vec<Value>), String> {
        let (node, attr, display) = match kind {
            "image" => ("image", "resourceId", "image"),
            "table" => ("table", "sourceResourceId", "resource-link"),
            _ => ("resourceLink", "resourceId", "resource-link"),
        };
        let path = format!("$.attrs.{attr}");
        let predicate="FROM resources r,json_tree(r.content) j WHERE r.id=?1 AND j.type='object'
            AND json_extract(j.value,'$.type')=?2 AND json_extract(j.value,?3)=?4 AND j.fullkey NOT LIKE '%.attrs.%'";
        let count = self
            .db
            .query_row(
                &format!("SELECT count(*) {predicate}"),
                params![source, node, path, target],
                |r| r.get(0),
            )
            .optional()
            .map_err(error)?
            .unwrap_or(0);
        let mut q=self.db.prepare(&format!("SELECT j.fullkey,substr(COALESCE(json_extract(j.value,'$.attrs.label'),json_extract(j.value,'$.attrs.alt'),?5),1,180)
            {predicate} LIMIT 20")).map_err(error)?;
        let occurrences = q
            .query_map(
                params![
                    source,
                    node,
                    path,
                    target,
                    if kind == "table" {
                        "CSV source table"
                    } else {
                        ""
                    }
                ],
                |r| {
                    let pointer = r
                        .get::<_, String>(0)?
                        .split(".content[")
                        .skip(1)
                        .filter_map(|part| part.strip_suffix(']'))
                        .collect::<Vec<_>>()
                        .join("/");
                    Ok(json!({"path":pointer,"kind":display,"label":r.get::<_,String>(1)?}))
                },
            )
            .map_err(error)?
            .collect::<Result<Vec<_>, _>>()
            .map_err(error)?;
        Ok((count, occurrences))
    }
}
