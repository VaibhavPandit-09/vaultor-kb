use super::*;

#[derive(Default, Serialize, Deserialize, Debug)]
#[serde(deny_unknown_fields)]
pub struct Descriptor {
    pub(super) id: String,
    title: String,
    label: String,
    path: String,
    revision: String,
}

fn digest(value: &str) -> bool {
    value.len() == 64 && value.bytes().all(|byte| byte.is_ascii_hexdigit())
}

pub(super) fn validate_descriptors(descriptors: &[Descriptor]) -> Result<(), String> {
    let mut ids = HashSet::new();
    if descriptors.len() > MAX_ITEMS {
        return Err("Too many linked descriptors".into());
    }
    for entry in descriptors {
        Uuid::parse_str(
            entry
                .id
                .strip_prefix("linked:")
                .ok_or("Invalid linked identity")?,
        )
        .map_err(error)?;
        if !ids.insert(&entry.id) || !digest(&entry.revision) || entry.path.len() > 4096 {
            return Err("Invalid linked descriptor".into());
        }
        crate::domain::title(&entry.title)?;
        component(&entry.label)?;
        for part in entry.path.split('/') {
            component(part)?;
        }
    }
    Ok(())
}

pub(super) fn capture_descriptors(db: &rusqlite::Connection) -> Result<Vec<Descriptor>, String> {
    let mut statement = db.prepare("SELECT id,title,label,path,revision FROM portable_linked_descriptors
        UNION ALL SELECT r.id,r.title,'Linked Markdown',replace(d.path,char(92),'/'),d.revision
        FROM linked_documents d JOIN linked_inventory i ON i.document_id=d.id AND i.available=1 JOIN resources r ON r.id=i.resource_id
        JOIN linked_sources s ON s.id=d.source_id AND s.active=1
        JOIN linked_grants g ON g.source_id=s.id
        WHERE NOT EXISTS(SELECT 1 FROM portable_linked_descriptors p WHERE p.id=r.id)
        ORDER BY id LIMIT 20001").map_err(error)?;
    let mut descriptors = Vec::new();
    for row in statement
        .query_map([], |row| {
            Ok(Descriptor {
                id: row.get(0)?,
                title: row.get(1)?,
                label: row.get(2)?,
                path: row.get(3)?,
                revision: row.get(4)?,
            })
        })
        .map_err(error)?
    {
        let entry = row.map_err(error)?;
        validate_descriptors(std::slice::from_ref(&entry))?;
        descriptors.push(entry);
    }
    Ok(descriptors)
}

pub(super) fn store_descriptors(
    db: &rusqlite::Connection,
    entries: &[Descriptor],
) -> Result<(), String> {
    for entry in entries {
        db.execute(
            "INSERT INTO portable_linked_descriptors VALUES(?1,?2,?3,?4,?5)",
            params![
                entry.id,
                entry.title,
                entry.label,
                entry.path,
                entry.revision
            ],
        )
        .map_err(error)?;
        db.execute(
            "INSERT INTO resources(id,title,content) VALUES(?1,?2,'{}')",
            params![entry.id,entry.title],
        ).map_err(error)?;
    }
    Ok(())
}

pub(super) fn reserve_originals(
    storage: &Storage,
    root: &str,
    originals: Vec<(String, String)>,
) -> Result<(), String> {
    storage.call(root, move |workspace| {
        let transaction = workspace.db.transaction().map_err(error)?;
        for (id, hash) in originals {
            reserve_original(&transaction, &id, &hash)?;
        }
        transaction.commit().map_err(error)?;
        Ok(Value::Null)
    })?;
    Ok(())
}

pub(super) fn reserve_original(transaction: &rusqlite::Connection, id: &str, hash: &str) -> Result<(), String> {
            Uuid::parse_str(&id).map_err(error)?;
            let owned: bool = transaction
                .query_row(
                    "SELECT EXISTS(SELECT 1 FROM managed_originals WHERE resource_id=?1)",
                    [&id],
                    |row| row.get(0),
                )
                .map_err(error)?;
            if owned {
                return Err("Original identity already committed".into());
            }
            transaction
                .execute(
                    "INSERT OR IGNORE INTO transfer_reserved VALUES(?1,?2)",
                    params![id, hash],
                )
                .map_err(error)?;
            let recorded: String = transaction
                .query_row(
                    "SELECT hash FROM transfer_reserved WHERE id=?1",
                    [&id],
                    |row| row.get(0),
                )
                .map_err(error)?;
            if recorded != hash {
                return Err("Original reservation integrity mismatch".into());
            }
            transaction
                .execute("INSERT OR IGNORE INTO pending_deletions VALUES(?1)", [&id])
                .map_err(error)?;
    Ok(())
}

pub(super) fn verified_orphan(path: &Path, expected: &str) -> Result<bool, String> {
    match fs::symlink_metadata(path) {
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(false),
        Err(e) => return Err(error(e)),
        Ok(_) => {}
    }
    plain_directory(path.parent().ok_or("Missing original directory")?)?;
    let (_, actual) = copy_hash(plain_file(path)?, std::io::sink(), MAX_FILE, |_| Ok(()))?;
    if actual != expected {
        return Err("Reserved original integrity mismatch".into());
    }
    Ok(true)
}

pub(super) fn release_original(db: &rusqlite::Connection, id: &str) -> Result<(), String> {
    db.execute("DELETE FROM transfer_reserved WHERE id=?1", [id])
        .map_err(error)?;
    db.execute("DELETE FROM pending_deletions WHERE id=?1", [id])
        .map_err(error)?;
    Ok(())
}

fn remap(ids: &mut HashMap<String, String>, id: &mut String, linked: bool) {
    let mapped = ids.entry(id.clone()).or_insert_with(|| {
        let fresh = Uuid::new_v4();
        if linked {
            format!("linked:{fresh}")
        } else {
            fresh.to_string()
        }
    });
    id.clone_from(mapped);
}

fn reference_field(node: &Value) -> Option<&'static str> {
    match node["type"].as_str() {
        Some("resourceLink" | "image") => Some("resourceId"),
        Some("table") => Some("sourceResourceId"),
        _ => None,
    }
}

fn rewrite(node: &mut Value, ids: &mut HashMap<String, String>) {
    if let Some(field) = reference_field(node) {
        if let Some(id) = node.get_mut("attrs").and_then(|attrs| attrs.get_mut(field)) {
            if let Some(raw) = id.as_str() {
                let mut value = raw.to_string();
                remap(ids, &mut value, raw.starts_with("linked:"));
                *id = Value::String(value);
            }
        }
    }
    if let Some(children) = node.get_mut("content").and_then(Value::as_array_mut) {
        for child in children {
            rewrite(child, ids);
        }
    }
}

pub(super) fn dependencies(node: &Value, result: &mut HashSet<String>) {
    if let Some(id) = reference_field(node).and_then(|field| node["attrs"][field].as_str()) {
        result.insert(id.into());
    }
    if let Some(children) = node["content"].as_array() {
        for child in children {
            dependencies(child, result);
        }
    }
}

fn unique_name(
    db: &rusqlite::Connection,
    name: &str,
    parent: Option<&str>,
    tag: bool,
) -> Result<String, String> {
    for index in 1..=MAX_ITEMS {
        let candidate = if index == 1 {
            name.to_string()
        } else {
            format!("{} ({index})", name.chars().take(226).collect::<String>())
        };
        let normalized = candidate.trim().to_lowercase();
        let exists: bool = if tag {
            db.query_row(
                "SELECT EXISTS(SELECT 1 FROM tags WHERE normalized=?1)",
                [normalized],
                |row| row.get(0),
            )
        } else {
            db.query_row(
                "SELECT EXISTS(SELECT 1 FROM collections WHERE normalized=?1 AND parent_id IS ?2)",
                params![normalized, parent],
                |row| row.get(0),
            )
        }
        .map_err(error)?;
        if !exists {
            return Ok(candidate);
        }
    }
    Err("Could not allocate a distinct name".into())
}

pub(super) fn merge(
    storage: &Storage,
    root: &str,
    source: &str,
    expected: &str,
    ctx: &mut Context,
) -> Result<Value, String> {
    let (mut input, mut manifest, hash, _) = archive_input::open(Path::new(source))?;
    if hash != expected {
        return Err("Archive changed since preview".into());
    }
    let receipt = storage.call(root, {
        let hash = hash.clone();
        move |w| {
            let record: Option<String> =
                w.db.query_row(
                    "SELECT receipt FROM transfer_merges WHERE hash=?1",
                    [hash],
                    |r| r.get(0),
                )
                .optional()
                .map_err(error)?;
            record.map_or(Ok(Value::Null), |record| {
                serde_json::from_str(&record).map_err(error)
            })
        }
    })?;
    if !receipt.is_null() {
        let (_, verified) = inspect_archive(Path::new(source), Some(ctx))?;
        if verified != hash {
            return Err("Archive changed since preview".into());
        }
        let mut receipt = receipt;
        receipt["reused"] = json!(true);
        return Ok(receipt);
    }
    let mut ids = HashMap::new();
    for resource in &mut manifest.resources {
        remap(&mut ids, &mut resource.id, false);
    }
    for descriptor in &mut manifest.linked {
        remap(&mut ids, &mut descriptor.id, true);
    }
    for resource in &mut manifest.resources {
        rewrite(&mut resource.content, &mut ids);
    }
    for original in &mut manifest.originals {
        original.id = ids[&original.id].clone();
    }
    let mut collections = HashMap::new();
    for collection in &mut manifest.collections {
        remap(&mut collections, &mut collection.id, false);
    }
    for collection in &mut manifest.collections {
        collection.parent = collection.parent.as_ref().map(|id| collections[id].clone());
    }
    for (resource, collection) in &mut manifest.memberships {
        *resource = ids[resource].clone();
        *collection = collections[collection].clone();
    }
    for (resource, ..) in &mut manifest.organization.states {
        *resource = ids[resource].clone();
    }
    for id in &mut manifest.organization.collection_pins {
        *id = collections[id].clone();
    }

    for original in &manifest.originals {
        let target = original_path(Path::new(root), &original.id)?;
        if fs::symlink_metadata(target).is_ok() {
            return Err("Managed destination already exists".into());
        }
    }
    reserve_originals(
        storage,
        root,
        manifest
            .originals
            .iter()
            .map(|o| (o.id.clone(), o.hash.clone()))
            .collect(),
    )?;
    let mut bytes = 0;
    let total = manifest.originals.iter().map(|o| o.bytes).sum();
    for (index, original) in manifest.originals.iter().enumerate() {
        ctx.check()?;
        let target = original_path(Path::new(root), &original.id)?;
        let staged = stage(target.parent().ok_or("Managed directory missing")?, false)?;
        let mut output = OpenOptions::new()
            .write(true)
            .open(&staged.0)
            .map_err(error)?;
        input.copy(
            index,
            original,
            &mut output,
            |progress| {
                ctx.check()?;
                ctx.progress(
                    "Verifying merge originals",
                    index as u64,
                    Some(manifest.originals.len() as u64),
                    bytes + progress,
                    Some(total),
                );
                Ok(())
            },
        )?;
        output.sync_all().map_err(error)?;
        drop(output);
        publish_file(&staged.0, &target)?;
        bytes += original.bytes;
    }
    input.finish()?;
    ctx.check()?;
    ctx.committing();
    storage.call(root,move |w|{
        let tx=w.db.transaction().map_err(error)?;
        tx.execute_batch("PRAGMA defer_foreign_keys=ON").map_err(error)?;
        for collection in &manifest.collections {
            let name=unique_name(&tx,&collection.name,collection.parent.as_deref(),false)?;
            tx.execute("INSERT INTO collections VALUES(?1,?2,?3,?4)",
                params![collection.id,name,name.trim().to_lowercase(),collection.parent]).map_err(error)?;
        }
        for resource in &manifest.resources {
            tx.execute("INSERT INTO resources(id,title,content,revision,updated_at) VALUES(?1,?2,?3,?4,?5)",
                params![resource.id,resource.title,resource.content.to_string(),resource.revision,resource.updated]).map_err(error)?;
        }
        store_descriptors(&tx,&manifest.linked)?;
        for (resource,collection) in &manifest.memberships {
            tx.execute("INSERT INTO memberships VALUES(?1,?2)",params![resource,collection]).map_err(error)?;
        }
        for original in &manifest.originals {
            insert_original(&tx,original)?;
            release_original(&tx,&original.id)?;
        }
        let mut tags=HashMap::new();
        for (old,name,color) in std::mem::take(&mut manifest.organization.tags) {
            let existing:Option<String>=tx.query_row("SELECT id FROM tags WHERE normalized=?1 AND color=?2",
                params![name.trim().to_lowercase(),color],|row|row.get(0)).optional().map_err(error)?;
            let id=if let Some(id)=existing{id}else{
                let id=Uuid::new_v4().to_string();
                let name=unique_name(&tx,&name,None,true)?;
                tx.execute("INSERT INTO tags VALUES(?1,?2,?3,?4)",params![id,name,name.trim().to_lowercase(),color]).map_err(error)?;
                id
            };
            tags.insert(old,id);
        }
        for (resource, tag) in &mut manifest.organization.assignments {
            *resource=ids[resource].clone();
            *tag=tags[tag].clone();
        }
        manifest.organization.restore(&tx)?;
        crate::reviews::restore(&tx, &manifest.reviews, Some(&mut ids))?;
        let receipt=json!({"resources":manifest.resources.len(),"collections":manifest.collections.len(),"files":manifest.originals.len(),"linkedDescriptors":manifest.linked.len(),"reviews":manifest.reviews.len(),"bytes":bytes,"reused":false});
        tx.execute("INSERT INTO transfer_merges VALUES(?1,?2)",params![hash,receipt.to_string()]).map_err(error)?;
        tx.commit().map_err(error)?;
        Ok(receipt)
    })
}

pub(super) fn selection(
    w: &mut Workspace,
    ids: Vec<String>,
    collection: Option<String>,
) -> Result<Manifest, String> {
    let mut scope = HashSet::new();
    let mut selected = ids.into_iter().collect::<HashSet<_>>();
    if let Some(id) = collection {
        let mut query=w.db.prepare("WITH RECURSIVE subtree(id) AS (
            SELECT id FROM collections WHERE id=?1 UNION SELECT c.id FROM collections c JOIN subtree s ON c.parent_id=s.id
            ) SELECT id FROM subtree LIMIT 20001").map_err(error)?;
        scope = query
            .query_map([id], |r| r.get::<_, String>(0))
            .map_err(error)?
            .collect::<Result<_, _>>()
            .map_err(error)?;
        if scope.is_empty() || scope.len() > MAX_ITEMS {
            return Err("Collection missing or exceeds the archive limit".into());
        }
    }
    let requested = selected.clone();
    let mut memberships = Vec::new();
    let mut parents = HashMap::new();
    {
        let mut query =
            w.db.prepare("SELECT id,name,parent_id FROM collections ORDER BY id LIMIT 20001")
                .map_err(error)?;
        for row in query
            .query_map([], |r| {
                Ok(Collection {
                    id: r.get(0)?,
                    name: r.get(1)?,
                    parent: r.get(2)?,
                })
            })
            .map_err(error)?
        {
            let c = row.map_err(error)?;
            parents.insert(c.id.clone(), c);
        }
        if parents.len() > MAX_ITEMS {
            return Err("Collection inventory exceeds the archive limit".into());
        }
        let mut query =
            w.db.prepare("SELECT resource_id,collection_id FROM memberships ORDER BY 1,2 LIMIT 200001")
            .map_err(error)?;
        for row in query
            .query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)))
            .map_err(error)?
        {
            let (resource, collection) = row.map_err(error)?;
            if scope.contains(&collection) {
                selected.insert(resource.clone());
            }
            memberships.push((resource, collection));
        }
    }
    if memberships.len() > 200000 {
        return Err("Membership inventory exceeds the archive limit".into());
    }
    let scoped = !scope.is_empty();
    let mut linked = selected.iter().filter(|id|id.starts_with("linked:")).cloned().collect::<HashSet<_>>();
    selected.retain(|id| !id.starts_with("linked:"));
    let mut waiting = selected.iter().cloned().collect::<Vec<_>>();
    let mut processed = HashSet::new();
    {
        let mut content=w.db.prepare("SELECT r.content, EXISTS(SELECT 1 FROM managed_originals o WHERE o.resource_id=r.id AND o.kind='file'), EXISTS(SELECT 1 FROM drafts WHERE resource_id=r.id) FROM resources r WHERE id=?1 AND id NOT LIKE 'linked:%'").map_err(error)?;
        while let Some(id) = waiting.pop() {
            if !processed.insert(id.clone()) {
                continue;
            }
            let row: Option<(String, bool, bool)> = content
                .query_row([&id], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)))
                .optional()
                .map_err(error)?;
            let Some((value, _, draft)) = row else {
                return Err("Selected resource is no longer available".into());
            };
            if draft {
                return Err("Resolve selected protected drafts before archiving".into());
            }
            let mut references = HashSet::new();
            dependencies(
                &serde_json::from_str(&value).map_err(error)?,
                &mut references,
            );
            for target in references {
                if target.starts_with("linked:") {
                    linked.insert(target);
                    continue;
                }
                if selected.contains(&target) {
                    continue;
                }
                let file:bool=w.db.query_row("SELECT EXISTS(SELECT 1 FROM managed_originals WHERE resource_id=?1 AND kind='file')",[&target],|r|r.get(0)).map_err(error)?;
                if file && selected.insert(target.clone()) {
                    waiting.push(target);
                }
            }
            if selected.len() > MAX_ITEMS || linked.len() > MAX_ITEMS {
                return Err("Selection exceeds the archive limit".into());
            }
        }
    }
    let ids = selected.iter().cloned().collect::<Vec<_>>();
    let mut manifest = snapshot(w, Some(&ids))?;
    manifest.partial = true;
    manifest.linked = capture_descriptors(&w.db)?
        .into_iter()
        .filter(|d| linked.contains(&d.id))
        .collect();
    let included = manifest.linked.iter().map(|entry|entry.id.clone()).collect::<HashSet<_>>();
    if requested.iter().any(|id|id.starts_with("linked:")&&!included.contains(id)) {
        return Err("Selected linked resource has no portable descriptor".into());
    }
    if !included.is_empty() {
        manifest.version=4;
        let targets = ids.iter().chain(&included).cloned().collect::<HashSet<_>>();
        manifest.organization = crate::organization::Archive::capture(&w.db,&targets)?;
        manifest.organization.collection_pins.clear();
    }
    manifest.memberships = memberships
        .into_iter()
        .filter(|(id, parent)| {
            (!id.starts_with("linked:")||included.contains(id))
                && ((scoped && scope.contains(parent)) || (!scoped && requested.contains(id)))
        })
        .collect();
    if !scoped {
        scope.extend(manifest.memberships.iter().map(|(_, id)| id.clone()));
    }
    let mut ancestors = scope.iter().cloned().collect::<Vec<_>>();
    while let Some(id) = ancestors.pop() {
        if let Some(parent) = parents.get(&id).and_then(|c| c.parent.clone()) {
            if scope.insert(parent.clone()) {
                ancestors.push(parent);
            }
        }
    }
    manifest.collections = parents
        .into_values()
        .filter(|c| scope.contains(&c.id))
        .collect();
    manifest.collections.sort_by(|a, b| a.id.cmp(&b.id));
    let assigned = manifest
        .organization
        .assignments
        .iter()
        .map(|(_, id)| id)
        .collect::<HashSet<_>>();
    manifest
        .organization
        .tags
        .retain(|(id, _, _)| assigned.contains(id));
    Ok(manifest)
}

pub(super) fn recovery(
    storage: &Storage,
    root: &str,
    id: String,
    destination: &str,
    linked: bool,
    ctx: &mut Context,
) -> Result<Value, String> {
    let value=storage.call(root, move |w|{
        if linked{
            w.db.query_row("SELECT revision,base,content,sequence,updated_at,state FROM linked_drafts WHERE id=?1",[id.strip_prefix("linked:").unwrap_or(&id)],|row|{
                Ok(json!({"format":"vaultor-next-protected-draft","version":1,"kind":"linkedMarkdown",
                    "resourceId":id,"baseRevision":row.get::<_,String>(0)?,"baseMarkdown":row.get::<_,String>(1)?,
                    "draftMarkdown":row.get::<_,String>(2)?,"sequence":row.get::<_,i64>(3)?,"updated":row.get::<_,String>(4)?,"state":row.get::<_,String>(5)?}))
            }).optional().map_err(error)?.ok_or_else(||"Protected linked draft is unavailable".into())
        }else{
            let (revision,title,content,sequence,updated):(i64,String,String,i64,String)=w.db.query_row(
                "SELECT base_revision,title,content,sequence,updated_at FROM drafts WHERE resource_id=?1",[&id],
                |row|Ok((row.get(0)?,row.get(1)?,row.get(2)?,row.get(3)?,row.get(4)?))).optional().map_err(error)?
                .ok_or("Protected managed draft is unavailable")?;
            let document:Value=serde_json::from_str(&content).map_err(error)?;
            Ok(json!({"format":"vaultor-next-protected-draft","version":1,"kind":"managedNote",
                "resourceId":id,"baseRevision":revision,"title":title,"document":document,"sequence":sequence,"updated":updated}))
        }
    })?;
    let payload = serde_json::to_string_pretty(&value).map_err(error)?;
    ctx.check()?;
    ctx.committing();
    save_csv_copy(Path::new(destination), &payload)?;
    Ok(json!({"path":destination,"bytes":payload.len(),"linked":linked}))
}
