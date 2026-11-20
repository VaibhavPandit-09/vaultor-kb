//! Managed media resolution, incremental relationships and identity clipboard receipts.
use crate::domain::{error, Workspace};
use rusqlite::{params, Connection};
use serde_json::{json, Value};
use std::path::PathBuf;
use uuid::Uuid;
pub(crate) fn initialize(db: &Connection) -> Result<(), String> {
    let exists: bool = db
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE name='resource_links')",
            [],
            |r| r.get(0),
        )
        .map_err(error)?;
    let has_table_sources:bool=db.query_row(
        "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE name='resource_links_save' AND sql LIKE '%sourceResourceId%')",[],|r|r.get(0)
    ).map_err(error)?;
    db.execute_batch("CREATE TABLE IF NOT EXISTS resource_links(source_id TEXT NOT NULL REFERENCES resources(id),target_id TEXT NOT NULL,kind TEXT NOT NULL,PRIMARY KEY(source_id,target_id,kind));CREATE INDEX IF NOT EXISTS backlinks ON resource_links(target_id,source_id);CREATE TABLE IF NOT EXISTS resource_clipboard(id TEXT PRIMARY KEY,payload TEXT NOT NULL,created INTEGER NOT NULL);
      CREATE TRIGGER IF NOT EXISTS resource_links_delete BEFORE DELETE ON resources BEGIN DELETE FROM resource_links WHERE source_id=old.id; END;").map_err(error)?;
    if !has_table_sources {
        let target = "CASE json_extract(j.value,'$.type') WHEN 'table' THEN json_extract(j.value,'$.attrs.sourceResourceId') ELSE json_extract(j.value,'$.attrs.resourceId') END";
        let kind = "CASE json_extract(j.value,'$.type') WHEN 'image' THEN 'image' WHEN 'table' THEN 'table' ELSE 'link' END";
        let predicate = format!("j.type='object' AND json_extract(j.value,'$.type') IN ('image','resourceLink','table') AND typeof({target})='text'");
        let select = format!("INSERT OR IGNORE INTO resource_links SELECT new.id,{target},{kind} FROM json_tree(new.content) j WHERE {predicate};");
        let mut sql = format!("SAVEPOINT resource_links_migration;
          DROP TRIGGER IF EXISTS resource_links_save; DROP TRIGGER IF EXISTS resource_links_new;
          CREATE TRIGGER resource_links_save AFTER UPDATE OF content ON resources BEGIN DELETE FROM resource_links WHERE source_id=new.id; {select} END;
          CREATE TRIGGER resource_links_new AFTER INSERT ON resources BEGIN {select} END;");
        if !exists {
            sql.push_str(&format!("INSERT OR IGNORE INTO resource_links SELECT r.id,{target},{kind} FROM resources r,json_tree(r.content) j WHERE {predicate};"));
        } else {
            sql.push_str(&format!("INSERT OR IGNORE INTO resource_links SELECT r.id,{target},{kind} FROM resources r,json_tree(r.content) j WHERE {predicate} AND json_extract(j.value,'$.type')='table';"));
        }
        sql.push_str("RELEASE resource_links_migration;");
        db.execute_batch(&sql).map_err(error)?;
    }
    Ok(())
}
impl Workspace {
    pub fn new_media_path(&self, id: &str) -> Result<PathBuf, String> {
        crate::transfers::original_path(&self.root, id)
    }

    pub fn managed_path(&self, id: &str) -> Result<PathBuf, String> {
        Uuid::parse_str(id).map_err(error)?;
        let valid:bool=self.db.query_row("SELECT EXISTS(SELECT 1 FROM managed_originals o JOIN resources r ON r.id=o.resource_id WHERE r.id=?1 AND NOT EXISTS(SELECT 1 FROM resource_state s WHERE s.resource_id=r.id AND s.trashed=1))",[id],|r|r.get(0)).map_err(error)?;
        if !valid {
            return Err("Managed original unavailable or in Trash".into());
        }
        crate::transfers::original_path(&self.root, id)
    }
    fn resource_summaries(&self, ids: &[String]) -> Result<Vec<Value>, String> {
        if ids.is_empty() || ids.len() > 100 {
            return Err("Choose1–100 resources".into());
        }
        let mut query=self.db.prepare("SELECT title,CASE WHEN r.id LIKE 'linked:%' THEN 'linked' WHEN EXISTS(SELECT 1 FROM managed_originals o WHERE o.resource_id=r.id AND o.kind='file') THEN 'file' ELSE 'note' END FROM visible_resources r WHERE id=?1 AND NOT EXISTS(SELECT 1 FROM resource_state WHERE resource_id=r.id AND trashed=1)").map_err(error)?;
        ids.iter().map(|id|query.query_row([id],|row|Ok(json!({"id":id,"title":row.get::<_,String>(0)?,"kind":row.get::<_,String>(1)?}))).map_err(error)).collect()
    }
    pub fn media(&mut self, r: Value) -> Result<Value, String> {
        let id = r["id"].as_str().unwrap_or("");
        match r["op"].as_str().unwrap_or("") {
            "presentation" => {
                let ids: Vec<String> = serde_json::from_value(r["ids"].clone()).map_err(error)?;
                if ids.is_empty() || ids.len() > 100 { return Err("Choose 1–100 resources".into()); }
                let mut tags=self.db.prepare("SELECT t.id,t.name,t.color FROM tags t JOIN resource_tags a ON a.tag_id=t.id WHERE a.resource_id=?1 ORDER BY t.normalized,t.id").map_err(error)?;
                let mut collections=self.db.prepare("SELECT c.id,c.name FROM collections c JOIN memberships m ON m.collection_id=c.id WHERE m.resource_id=?1 ORDER BY c.name,c.id").map_err(error)?;
                let mut rows=Vec::with_capacity(ids.len());
                for id in ids {
                    let assigned=tags.query_map([&id],|row|Ok(json!({"id":row.get::<_,String>(0)?,"name":row.get::<_,String>(1)?,"color":row.get::<_,String>(2)?}))).map_err(error)?.collect::<Result<Vec<_>,_>>().map_err(error)?;
                    let placements=collections.query_map([&id],|row|Ok(json!({"id":row.get::<_,String>(0)?,"name":row.get::<_,String>(1)?}))).map_err(error)?.collect::<Result<Vec<_>,_>>().map_err(error)?;
                    let pinned:bool=self.db.query_row("SELECT EXISTS(SELECT 1 FROM resource_state WHERE resource_id=?1 AND pinned=1)",[&id],|row|row.get(0)).map_err(error)?;
                    rows.push(json!({"id":id,"tags":assigned,"collections":placements,"pinned":pinned}));
                }
                Ok(json!(rows))
            }
            "summaries" => {
                let ids: Vec<String> = serde_json::from_value(r["ids"].clone()).map_err(error)?;
                Ok(json!(self.resource_summaries(&ids)?))
            }
            "open" => {
                let draft: bool = self
                    .db
                    .query_row(
                        "SELECT EXISTS(SELECT 1 FROM drafts WHERE resource_id=?1)",
                        [id],
                        |row| row.get(0),
                    )
                    .map_err(error)?;
                let active:bool=self.db.query_row("SELECT EXISTS(SELECT 1 FROM resources WHERE id=?1 AND NOT EXISTS(SELECT 1 FROM resource_state WHERE resource_id=?1 AND trashed=1))",[id],|r|r.get(0)).map_err(error)?;
                if !active {
                    return Err("Resource is missing or in Trash; the current note was kept".into());
                }
                let note = if draft {
                    Value::Null
                } else {
                    self.execute(crate::domain::Request::Read { id: id.into() })?
                };
                Ok(json!({"draft":draft,"note":note}))
            }
            "info" => {
                self.managed_path(id)?;
                self.db.query_row("SELECT name,bytes,hash,kind FROM managed_originals WHERE resource_id=?1",[id],|row|Ok(json!({"name":row.get::<_,String>(0)?,"bytes":row.get::<_,i64>(1)?,"hash":row.get::<_,String>(2)?,"kind":row.get::<_,String>(3)?}))).map_err(error)
            }
            "references" => self.reference_page(id,r["direction"].as_str().unwrap_or("incoming"),r["page"].as_u64().unwrap_or(0)),
            "indexStatus" => self.db.query_row("SELECT
                (SELECT count(*) FROM managed_originals o JOIN visible_resources r ON r.id=o.resource_id WHERE o.kind='file'
                    AND NOT EXISTS(SELECT 1 FROM resource_state WHERE resource_id=r.id AND trashed=1)),
                (SELECT count(*) FROM managed_text_receipts f JOIN visible_resources r ON r.id=f.resource_id WHERE f.state='indexed'
                    AND NOT EXISTS(SELECT 1 FROM resource_state WHERE resource_id=r.id AND trashed=1)),
                (SELECT count(*) FROM linked_inventory i JOIN visible_resources r ON r.id=i.resource_id WHERE i.indexed_revision<>'')",[],
                |row|Ok(json!({"managedFiles":row.get::<_,i64>(0)?,"indexedFiles":row.get::<_,i64>(1)?,"linkedReceipts":row.get::<_,i64>(2)?}))).map_err(error),
            "discovery" => {
                let query=r["query"].as_str().unwrap_or("").trim().to_lowercase();
                if query.chars().count()>256 { return Err("Search is limited to 256 characters".into()); }
                if query.is_empty(){return Ok(json!([]));}
                let mut q=self.db.prepare("SELECT id,name,kind FROM (SELECT id,name,normalized,'collection' kind FROM collections
                    UNION ALL SELECT id,name,normalized,'tag' kind FROM tags) WHERE instr(normalized,?1)>0
                    ORDER BY normalized=?1 DESC,normalized,kind,id LIMIT 20").map_err(error)?;
                let rows=q.query_map([query],|row|Ok(json!({"id":row.get::<_,String>(0)?,"title":row.get::<_,String>(1)?,"kind":row.get::<_,String>(2)?})))
                    .map_err(error)?.collect::<Result<Vec<_>,_>>().map_err(error)?;
                Ok(json!(rows))
            }
            "backlinks" => {
                let mut q=self.db.prepare("SELECT r.id,r.title,l.kind FROM resource_links l JOIN visible_resources r ON r.id=l.source_id WHERE l.target_id=?1 AND NOT EXISTS(SELECT 1 FROM resource_state s WHERE s.resource_id=r.id AND s.trashed=1) ORDER BY lower(r.title),r.id LIMIT 100").map_err(error)?;
                let rows=q.query_map([id],|r|Ok(json!({"id":r.get::<_,String>(0)?,"title":r.get::<_,String>(1)?,"kind":r.get::<_,String>(2)?}))).map_err(error)?.collect::<Result<Vec<_>,_>>().map_err(error)?;
                Ok(json!(rows))
            }
            "rename" => {
                if id.starts_with("linked:") {
                    return Err("Rename the external original in its source folder".into());
                }
                let name = crate::domain::title(r["title"].as_str().unwrap_or(""))?;
                if self.db.execute("UPDATE resources SET title=?2,revision=revision+1,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?1 AND revision=?3 AND NOT EXISTS(SELECT 1 FROM drafts WHERE resource_id=?1) AND NOT EXISTS(SELECT 1 FROM resource_state WHERE resource_id=?1 AND trashed=1)",params![id,name,r["revision"].as_i64().ok_or("Missing expected revision")?]).map_err(error)?!=1{return Err("Resource changed,unavailable or protected by a draft".into())}
                Ok(Value::Null)
            }
            "copy" => {
                let ids: Vec<String> = serde_json::from_value(r["ids"].clone()).map_err(error)?;
                if ids.is_empty() || ids.len() > 100 {
                    return Err("Choose 1–100 visible resources".into());
                }
                let resources = self.resource_summaries(&ids)?;
                let mode = r["mode"].as_str().unwrap_or("copy");
                if !["copy", "cut", "links"].contains(&mode) {
                    return Err("Invalid clipboard mode".into());
                }
                if mode == "cut" && r["collection"].as_str().is_none() {
                    return Err("Cut requires a source collection".into());
                }
                let receipt = Uuid::new_v4().to_string();
                let payload = json!({"ids":ids,"resources":resources,"mode":mode,"collection":r["collection"]});
                self.db
                    .execute("DELETE FROM resource_clipboard", [])
                    .map_err(error)?;
                self.db
                    .execute(
                        "INSERT INTO resource_clipboard VALUES(?1,?2,strftime('%s','now'))",
                        params![receipt, payload.to_string()],
                    )
                    .map_err(error)?;
                Ok(
                    json!({"receipt":receipt,"resources":resources,"text":resources.iter().map(|r|format!("vaultor://resource/{}",r["id"].as_str().unwrap())).collect::<Vec<_>>().join("\n")}),
                )
            }
            "clipboard" | "paste" => {
                let receipt = r["receipt"].as_str().unwrap_or("");
                let payload:String=self.db.query_row("SELECT payload FROM resource_clipboard WHERE id=?1 AND created>strftime('%s','now')-86400",[receipt],|r|r.get(0)).map_err(|_|"Clipboard belongs to another workspace,was replaced or expired".to_string())?;
                let data: Value = serde_json::from_str(&payload).map_err(error)?;
                if r["op"] == "clipboard" {
                    return Ok(data);
                }
                let dest = r["collection"]
                    .as_str()
                    .ok_or("Paste resources into a collection")?;
                let source = if data["mode"] == "cut" {
                    data["collection"].as_str().map(str::to_string)
                } else {
                    None
                };
                if source.as_deref() == Some(dest) {
                    return Err("Choose another collection for Cut".into());
                }
                let ids = serde_json::from_value(data["ids"].clone()).map_err(error)?;
                let result = self.bulk_membership(ids, Some(dest.into()), source)?;
                if data["mode"] == "cut" {
                    self.db
                        .execute("DELETE FROM resource_clipboard WHERE id=?1", [receipt])
                        .map_err(error)?;
                }
                Ok(result)
            }
            _ => Err("Unknown resource operation".into()),
        }
    }
}
pub fn image_type(bytes: &[u8]) -> Option<(&'static str, u32, u32)> {
    if bytes.starts_with(b"RIFF") && bytes.get(8..12) == Some(b"WEBP") {
        let payload = bytes.get(20..)?;
        let read_24 = |slice: &[u8]| u32::from_le_bytes([slice[0], slice[1], slice[2], 0]);
        let (width, height) = match bytes.get(12..16)? {
            b"VP8X" if payload.len() >= 10 => (read_24(&payload[4..7]) + 1, read_24(&payload[7..10]) + 1),
            b"VP8L" if payload.len() >= 5 && payload[0] == 0x2f => {
                let bits = u32::from_le_bytes(payload[1..5].try_into().ok()?);
                ((bits & 0x3fff) + 1, ((bits >> 14) & 0x3fff) + 1)
            }
            b"VP8 " if payload.len() >= 10 && payload[3..6] == [0x9d, 0x01, 0x2a] => (
                (u16::from_le_bytes(payload[6..8].try_into().ok()?) & 0x3fff) as u32,
                (u16::from_le_bytes(payload[8..10].try_into().ok()?) & 0x3fff) as u32,
            ),
            _ => return None,
        };
        return Some(("image/webp", width, height));
    }
    if bytes.starts_with(b"\x89PNG\r\n\x1a\n") && bytes.len() >= 24 {
        return Some((
            "image/png",
            u32::from_be_bytes(bytes[16..20].try_into().ok()?),
            u32::from_be_bytes(bytes[20..24].try_into().ok()?),
        ));
    }
    if (bytes.starts_with(b"GIF87a") || bytes.starts_with(b"GIF89a")) && bytes.len() >= 10 {
        return Some((
            "image/gif",
            u16::from_le_bytes(bytes[6..8].try_into().ok()?) as u32,
            u16::from_le_bytes(bytes[8..10].try_into().ok()?) as u32,
        ));
    }
    if bytes.starts_with(&[255, 216]) {
        let mut i = 2;
        while i + 9 < bytes.len().min(1048576) {
            if bytes[i] != 255 {
                return None;
            }
            let tag = bytes[i + 1];
            i += 2;
            if tag == 0xd9 || tag == 0xda {
                return None;
            }
            if (0xd0..=0xd7).contains(&tag) {
                continue;
            }
            let n = u16::from_be_bytes(bytes[i..i + 2].try_into().ok()?) as usize;
            if n < 2 || i + n > bytes.len() {
                return None;
            }
            if [0xc0, 0xc1, 0xc2].contains(&tag) {
                return Some((
                    "image/jpeg",
                    u16::from_be_bytes(bytes[i + 5..i + 7].try_into().ok()?) as u32,
                    u16::from_be_bytes(bytes[i + 3..i + 5].try_into().ok()?) as u32,
                ));
            }
            i += n;
        }
    }
    None
}
use std::io::Read;

use sha2::{Digest, Sha256};

impl Workspace {
    pub fn attach_metadata(
        &mut self,
        id: String,
        name: String,
        bytes: i64,
        hash: String,
    ) -> Result<Value, String> {
        let tx = self.db.transaction().map_err(error)?;
        tx.execute("INSERT INTO resources(id,title,content) VALUES(?1,?2,'{\"type\":\"doc\",\"content\":[]}')",rusqlite::params![id,name]).map_err(error)?;
        tx.execute(
            "INSERT INTO managed_originals VALUES(?1,?2,?3,?4,'file','editor attachment')",
            rusqlite::params![id, name, hash, bytes],
        )
        .map_err(error)?;
        tx.commit().map_err(error)?;
        Ok(json!({"id":id,"name":name}))
    }
}
pub fn read_original(path: PathBuf, hash: &str) -> Result<Vec<u8>, String> {
    let file = crate::transfers::plain_file(&path)?;
    if file.metadata().map_err(error)?.len() > 20 * 1024 * 1024 {
        return Err("Inline preview is limited to20MiB;Export original instead".into());
    }
    let mut bytes = vec![];
    file.take(20 * 1024 * 1024 + 1)
        .read_to_end(&mut bytes)
        .map_err(error)?;
    if format!("{:x}", Sha256::digest(&bytes)) != hash {
        return Err("Managed original integrity mismatch".into());
    }
    if let Some((_, w, h)) = image_type(&bytes) {
        if w == 0 || h == 0 || w as u64 * h as u64 > 40_000_000 {
            return Err("Image dimensions exceed40million pixels".into());
        }
    }
    Ok(bytes)
}
#[cfg(windows)]
pub mod clipboard {

    #[link(name = "user32")]
    extern "system" {
        fn OpenClipboard(window: *mut core::ffi::c_void) -> i32;
        fn CloseClipboard() -> i32;
        fn EmptyClipboard() -> i32;
        fn SetClipboardData(format: u32, data: *mut core::ffi::c_void) -> *mut core::ffi::c_void;
        fn GetClipboardData(format: u32) -> *mut core::ffi::c_void;
    }
    #[link(name = "kernel32")]
    extern "system" {
        fn GlobalAlloc(flags: u32, size: usize) -> *mut core::ffi::c_void;
        fn GlobalLock(handle: *mut core::ffi::c_void) -> *mut core::ffi::c_void;
        fn GlobalUnlock(handle: *mut core::ffi::c_void) -> i32;
        fn GlobalSize(handle: *mut core::ffi::c_void) -> usize;
        fn GlobalFree(handle: *mut core::ffi::c_void) -> *mut core::ffi::c_void;
    }
    struct Owner;
    impl Drop for Owner {
        fn drop(&mut self) {
            unsafe {
                CloseClipboard();
            }
        }
    }
    static ACCESS: std::sync::Mutex<()> = std::sync::Mutex::new(());
    fn acquire(window: isize) -> Result<Owner, String> {
        for _ in 0..25 {
            if unsafe { OpenClipboard(window as *mut core::ffi::c_void) } != 0 {
                return Ok(Owner);
            }
            std::thread::sleep(std::time::Duration::from_millis(8));
        }
        Err("Clipboard busy;retry".into())
    }
    pub fn write(value: &str, window: isize) -> Result<(), String> {
        unsafe {
            let _guard = ACCESS
                .lock()
                .map_err(|_| "Clipboard unavailable".to_string())?;
            let _owner = acquire(window)?;
            if value.len() > 1024 * 1024 {
                return Err("Clipboard text too large".into());
            }
            let utf: Vec<u16> = value.encode_utf16().chain(Some(0)).collect();
            let data = GlobalAlloc(2, utf.len() * 2);
            if data.is_null() {
                return Err("Clipboard allocation failed".into());
            }
            let ptr = GlobalLock(data);
            if ptr.is_null() {
                GlobalFree(data);
                return Err("Clipboard allocation unavailable".into());
            }
            core::ptr::copy_nonoverlapping(utf.as_ptr(), ptr.cast(), utf.len());
            GlobalUnlock(data);
            if EmptyClipboard() == 0 || SetClipboardData(13, data).is_null() {
                GlobalFree(data);
                return Err("Clipboard write failed".into());
            }
            Ok(())
        }
    }
    pub fn read() -> Result<String, String> {
        unsafe {
            let _guard = ACCESS
                .lock()
                .map_err(|_| "Clipboard unavailable".to_string())?;
            let _owner = acquire(0)?;
            let data = GetClipboardData(13);
            if data.is_null() {
                return Ok(String::new());
            }
            let count = GlobalSize(data) / 2;
            if count > 1024 * 1024 {
                return Err("Clipboard text too large".into());
            }
            let ptr = GlobalLock(data);
            if ptr.is_null() {
                return Err("Clipboard unavailable".into());
            }
            let words = core::slice::from_raw_parts(ptr.cast::<u16>(), count);
            let len = words.iter().position(|c| *c == 0).unwrap_or(count);
            let result = String::from_utf16_lossy(&words[..len]);
            GlobalUnlock(data);
            Ok(result)
        }
    }
}
use std::path::Path;
/// Export copies have bounded storage. Only receipt-owned unchanged files are reclaimed;
/// edits in an external application are preserved and require explicit user cleanup.
pub fn prepare_copy(source: &Path, name: &str, expected_hash: &str) -> Result<PathBuf, String> {
    use std::io::{Read, Write};
    static PREPARING: std::sync::Mutex<()> = std::sync::Mutex::new(());
    let _guard = PREPARING.lock().map_err(error)?;
    if name.is_empty()
        || name == "."
        || name == ".."
        || name
            .chars()
            .any(|c| "<>:\"/\\|?*".contains(c) || c.is_control())
    {
        return Err("Invalid prepared filename".into());
    }
    let root = std::env::temp_dir().join("vaultor-next-prepared");
    if root.exists() {
        crate::transfers::plain_directory(&root)?;
    } else {
        std::fs::create_dir(&root).map_err(error)?;
    }
    let mut owned = 0u64;
    let mut retained = 0;
    for entry in std::fs::read_dir(&root).map_err(error)?.take(1024) {
        let entry = entry.map_err(error)?;
        if Uuid::parse_str(&entry.file_name().to_string_lossy()).is_err() {
            continue;
        }
        let folder = entry.path();
        if crate::transfers::plain_directory(&folder).is_err() {
            continue;
        }
        let receipt = folder.join(".vaultor-prepared.json");
        let Ok(file) = crate::transfers::plain_file(&receipt) else {
            continue;
        };
        let mut raw = vec![];
        if file.take(4097).read_to_end(&mut raw).is_err() {
            continue;
        }
        if raw.len() > 4096 {
            continue;
        }
        let Ok(r) = serde_json::from_slice::<Value>(&raw) else {
            continue;
        };
        if r["owner"] != "vaultor-next-v1" {
            continue;
        }
        let Some(n) = r["name"].as_str() else {
            continue;
        };
        if n.contains(['/', '\\', ':']) || n == "." || n == ".." {
            continue;
        }
        let path = folder.join(n);
        let Ok(mut file) = crate::transfers::plain_file(&path) else {
            continue;
        };
        let size = file.metadata().map_err(error)?.len();
        let mut hash = Sha256::new();
        let mut buffer = [0u8; 65536];
        loop {
            let count = file.read(&mut buffer).map_err(error)?;
            if count == 0 {
                break;
            }
            hash.update(&buffer[..count]);
        }
        drop(file);
        if format!("{:x}", hash.finalize()) == r["hash"].as_str().unwrap_or("")
            && std::fs::remove_file(&path).is_ok()
        {
            let _ = std::fs::remove_file(receipt);
            let _ = std::fs::remove_dir(folder);
        } else {
            owned = owned.saturating_add(size);
            retained += 1;
        }
    }
    let mut file = crate::transfers::plain_file(source)?;
    let size = file.metadata().map_err(error)?.len();
    if retained >= 8 || size > 256 * 1024 * 1024 || owned.saturating_add(size) > 256 * 1024 * 1024 {
        return Err("Prepared-copy limit256MiB;export to a chosen destination or preserve/remove edited temporary copies first".into());
    }
    let folder = root.join(Uuid::new_v4().to_string());
    std::fs::create_dir(&folder).map_err(error)?;
    let out = folder.join(name);
    let result = (|| {
        let mut dest = std::fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&out)
            .map_err(error)?;
        let mut hash = Sha256::new();
        let mut buffer = [0u8; 65536];
        loop {
            let n = file.read(&mut buffer).map_err(error)?;
            if n == 0 {
                break;
            }
            dest.write_all(&buffer[..n]).map_err(error)?;
            hash.update(&buffer[..n]);
        }
        dest.sync_all().map_err(error)?;
        let actual = format!("{:x}", hash.finalize());
        if actual != expected_hash {
            return Err("Managed original integrity mismatch".into());
        }
        let receipt = json!({"owner":"vaultor-next-v1","name":name,"hash":actual});
        std::fs::write(folder.join(".vaultor-prepared.json"), receipt.to_string())
            .map_err(error)?;
        #[cfg(windows)]
        {
            use std::os::windows::ffi::OsStrExt;
            let path: Vec<u16> = folder
                .join(".vaultor-prepared.json")
                .as_os_str()
                .encode_wide()
                .chain(Some(0))
                .collect();
            unsafe {
                windows_sys::Win32::Storage::FileSystem::SetFileAttributesW(
                    path.as_ptr(),
                    windows_sys::Win32::Storage::FileSystem::FILE_ATTRIBUTE_HIDDEN,
                );
            }
        }
        Ok(out.clone())
    })();
    if result.is_err() {
        let _ = std::fs::remove_file(&out);
        let _ = std::fs::remove_file(folder.join(".vaultor-prepared.json"));
        let _ = std::fs::remove_dir(folder);
    }
    result
}
#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::Request;
    fn note(w: &mut Workspace, title: &str) -> String {
        w.execute(Request::CreateNote {
            title: title.into(),
            collection: None,
        })
        .unwrap()["id"]
            .as_str()
            .unwrap()
            .into()
    }
    #[test]
    fn presentation_is_bounded_metadata_without_document_bodies() {
        let dir = tempfile::tempdir().unwrap();
        let mut w = Workspace::open(dir.path()).unwrap();
        let id = note(&mut w, "Metadata");
        w.db.execute("INSERT INTO tags(id,name,normalized,color) VALUES('t','Ideas','ideas','#123456')",[]).unwrap();
        w.db.execute("INSERT INTO resource_tags(resource_id,tag_id) VALUES(?1,'t')",[&id]).unwrap();
        let rows=w.media(json!({"op":"presentation","ids":[id]})).unwrap();
        assert_eq!(rows[0]["tags"][0]["name"],"Ideas");
        assert_eq!(rows[0]["pinned"],false);
        assert!(rows[0].get("content").is_none());
        assert!(w.media(json!({"op":"presentation","ids":[]})).is_err());
        assert!(w.media(json!({"op":"presentation","ids":vec!["x";101]})).is_err());
    }
    #[test]
    fn links_saved_incrementally_restart_trash_and_purge() {
        let dir = tempfile::tempdir().unwrap();
        let mut w = Workspace::open(dir.path()).unwrap();
        let a = note(&mut w, "A");
        let b = note(&mut w, "B");
        let saved = w.execute(Request::Read { id: a.clone() }).unwrap();
        let body = json!({"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"ordinary JSON strings"},{"type":"resourceLink","attrs":{"resourceId":b,"label":"B"}}]}]});
        w.execute(Request::Save {
            id: a.clone(),
            revision: saved["revision"].as_i64().unwrap(),
            title: "A".into(),
            content: body.clone(),
            proof: None,
        })
        .unwrap();
        assert_eq!(
            w.media(json!({"op":"backlinks","id":b}))
                .unwrap()
                .as_array()
                .unwrap()
                .len(),
            1
        );
        drop(w);
        let mut w = Workspace::open(dir.path()).unwrap();
        assert_eq!(
            w.media(json!({"op":"backlinks","id":b})).unwrap()[0]["id"],
            a
        );
        w.organization(crate::organization::Request::Trash {
            ids: vec![a.clone()],
            restore: false,
        })
        .unwrap();
        assert_eq!(
            w.media(json!({"op":"backlinks","id":b})).unwrap(),
            json!([])
        );
        w.organization(crate::organization::Request::Trash {
            ids: vec![a.clone()],
            restore: true,
        })
        .unwrap();
        let saved = w.execute(Request::Read { id: a.clone() }).unwrap();
        w.execute(Request::Save {
            id: a.clone(),
            revision: saved["revision"].as_i64().unwrap(),
            title: "A".into(),
            content: json!({"type":"doc","content":[]}),
            proof: None,
        })
        .unwrap();
        assert_eq!(
            w.media(json!({"op":"backlinks","id":b})).unwrap(),
            json!([])
        );
    }
    #[test]
    fn table_provenance_survives_restart_and_protects_drafts() {
        use crate::domain::Request;
        let dir=tempfile::tempdir().unwrap();
        let mut w=Workspace::open(dir.path()).unwrap();
        let note=w.execute(Request::CreateNote{title:"Table note".into(),collection:None}).unwrap();
        let id=note["id"].as_str().unwrap().to_string();
        let source=Uuid::new_v4().to_string();
        w.attach_metadata(source.clone(),"Data.csv".into(),3,"fixture".into()).unwrap();
        let body=json!({"type":"doc","content":[{"type":"table","attrs":{"sourceResourceId":source,"sourceResourceTitle":"Data.csv"}}]});
        let saved=w.execute(Request::Save{id:id.clone(),revision:note["revision"].as_i64().unwrap(),title:"Table note".into(),content:body.clone(),proof:None}).unwrap();
        drop(w);
        let mut w=Workspace::open(dir.path()).unwrap();
        assert_eq!(w.media(json!({"op":"backlinks","id":source})).unwrap()[0]["kind"],"table");
        w.execute(Request::Draft{id:id.clone(),base_revision:saved["revision"].as_i64().unwrap(),token:Uuid::new_v4().to_string(),sequence:1,title:"Table note".into(),content:body}).unwrap();
        w.organization(crate::organization::Request::Trash{ids:vec![source.clone()],restore:false}).unwrap();
        assert!(w.purge_one(&source).unwrap_err().contains("drafts"));
        assert!(w.managed_path(&source).is_err());
    }
    #[test]
    fn clipboard_identity_membership_and_atomic_validation() {
        let dir = tempfile::tempdir().unwrap();
        let mut w = Workspace::open(dir.path()).unwrap();
        let a = note(&mut w, "A");
        let source = w
            .execute(Request::CreateCollection {
                name: "Source".into(),
                parent_id: None,
            })
            .unwrap()["id"]
            .as_str()
            .unwrap()
            .to_string();
        let dest = w
            .execute(Request::CreateCollection {
                name: "Dest".into(),
                parent_id: None,
            })
            .unwrap()["id"]
            .as_str()
            .unwrap()
            .to_string();
        w.bulk_membership(vec![a.clone()], Some(source.clone()), None)
            .unwrap();
        let receipt = w
            .media(json!({"op":"copy","ids":[a],"mode":"cut","collection":source}))
            .unwrap()["receipt"]
            .clone();
        assert!(w
            .media(json!({"op":"paste","receipt":receipt,"collection":"missing"}))
            .is_err());
        w.media(json!({"op":"paste","receipt":receipt,"collection":dest}))
            .unwrap();
        let memberships = w.execute(Request::Memberships { id: a.clone() }).unwrap();
        assert!(memberships.to_string().contains(&dest));
        assert!(!memberships.to_string().contains(&source));
        assert!(w
            .media(json!({"op":"paste","receipt":receipt,"collection":dest}))
            .is_err());
        assert_eq!(
            w.db.query_row("SELECT count(*) FROM resources", [], |r| r.get::<_, i64>(0))
                .unwrap(),
            1
        );
    }
    #[test]
    fn images_bound_integrity_and_path_validation() {
        assert!(image_type(b"<svg onload='evil'>").is_none());
        assert!(image_type(b"not an image").is_none());
        let mut png = b"\x89PNG\r\n\x1a\n".to_vec();
        png.extend([0u8; 8]);
        png.extend(12u32.to_be_bytes());
        png.extend(20u32.to_be_bytes());
        assert_eq!(image_type(&png), Some(("image/png", 12, 20)));
        let dir = tempfile::tempdir().unwrap();
        let file = dir.path().join("image");
        std::fs::write(&file, &png).unwrap();
        assert!(read_original(file.clone(), "wrong").is_err());
        assert_eq!(
            read_original(file, &format!("{:x}", Sha256::digest(&png))).unwrap(),
            png
        );
        let w = Workspace::open(&dir.path().join("workspace")).unwrap();
        assert!(w.managed_path("../outside").is_err());
        assert!(prepare_copy(std::path::Path::new("missing"), "../escape", "unused").is_err());
    }
    #[test]
    fn reads_webp_canvas_dimensions_without_transcoding() {
        let fixture = b"RIFF\x16\0\0\0WEBPVP8X\x0a\0\0\0\x02\0\0\0\x1f\0\0\x0f\0\0";
        assert_eq!(image_type(fixture), Some(("image/webp", 32, 16)));
        assert_eq!(image_type(&fixture[..25]), None);
    }
    #[test]
    fn draft_referenced_attachment_cannot_be_purged() {
        let dir = tempfile::tempdir().unwrap();
        let mut w = Workspace::open(dir.path()).unwrap();
        let parent = note(&mut w, "Parent");
        let asset = note(&mut w, "Asset");
        let base = w.execute(Request::Read { id: parent.clone() }).unwrap()["revision"]
            .as_i64()
            .unwrap();
        w.execute(Request::Draft{id:parent.clone(),base_revision:base,token:Uuid::new_v4().to_string(),sequence:1,title:"Parent".into(),content:json!({"type":"doc","content":[{"type":"image","attrs":{"resourceId":asset}}]})}).unwrap();
        w.organization(crate::organization::Request::Trash {
            ids: vec![asset.clone()],
            restore: false,
        })
        .unwrap();
        assert!(w
            .purge_one(&asset)
            .unwrap_err()
            .contains("drafts referring"));
        let opened = w.media(json!({"op":"open","id":parent})).unwrap();
        assert_eq!(opened["draft"], true);
        assert!(opened["note"].is_null());
    }
}
