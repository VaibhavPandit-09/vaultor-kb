//! Private, leased copies for native handoff. Never hand the shell an owned original.
use crate::{
    domain::{error, Workspace},
    transfers::{component, copy_hash, plain_directory, plain_file},
};
use fs2::FileExt;
use std::{
    collections::HashSet,
    fs::{self, File, OpenOptions},
    path::{Path, PathBuf},
    time::{Duration, SystemTime},
};
use uuid::Uuid;

const BYTE_LIMIT: u64 = 256 * 1024 * 1024;
const FILE_LIMIT: usize = 16;
const BATCH_LIMIT: usize = 64;
const READY: Duration = Duration::from_secs(300);
const RETENTION: Duration = Duration::from_secs(24 * 60 * 60);
const LEASE: &str = ".vaultor-native-lease";

#[derive(serde::Serialize, serde::Deserialize, PartialEq)]
pub struct Original {
    id: String,
    path: PathBuf,
    name: String,
    hash: String,
    bytes: u64,
}

impl Workspace {
    pub fn native_originals(&self, ids: &[String]) -> Result<Vec<Original>, String> {
        if ids.is_empty()
            || ids.len() > FILE_LIMIT
            || ids.iter().collect::<HashSet<_>>().len() != ids.len()
        {
            return Err("Choose 1–16 different managed files".into());
        }
        let mut query = self
            .db
            .prepare(
                "SELECT name,hash,bytes FROM managed_originals
            WHERE resource_id=?1 AND kind='file'
            AND NOT EXISTS (SELECT 1 FROM resource_state WHERE resource_id=?1 AND trashed=1)",
            )
            .map_err(error)?;
        let mut result = Vec::with_capacity(ids.len());
        for id in ids {
            let path = self.managed_path(id)?;
            let (name,hash,bytes) = query.query_row([id], |row| Ok((row.get(0)?,row.get(1)?,row.get(2)?)))
                .map_err(|_| "Explorer drag requires active managed files. Use Export for notes and linked resources.".to_string())?;
            result.push(Original {
                id: id.clone(),
                path,
                name,
                hash,
                bytes,
            });
        }
        Ok(result)
    }
}

pub struct PreparedDrag {
    directory: PathBuf,
    lease: Option<File>,
    originals: Vec<Original>,
    paths: Vec<PathBuf>,
    pub workspace: String,
    pub receipt: String,
    created: SystemTime,
    handed: bool,
}

impl PreparedDrag {
    pub fn prepare(
        cache: &Path,
        workspace: String,
        originals: Vec<Original>,
    ) -> Result<Self, String> {
        fs::create_dir_all(cache).map_err(error)?;
        plain_directory(cache)?;
        let _cache_lock = cache_lock(cache)?;
        let (batches, occupied) = sweep(cache)?;
        let bytes = originals
            .iter()
            .try_fold(0u64, |total, file| total.checked_add(file.bytes))
            .ok_or("Invalid native copy size")?;
        if batches >= BATCH_LIMIT || bytes > BYTE_LIMIT.saturating_sub(occupied) {
            return Err("Prepared copies have reached the 256 MiB or batch limit. Export to a chosen destination instead.".into());
        }
        let receipt = Uuid::new_v4().to_string();
        let directory = cache.join(&receipt);
        fs::create_dir(&directory).map_err(error)?;
        let mut batch = Self {
            directory,
            lease: None,
            originals,
            paths: vec![],
            workspace,
            receipt,
            created: SystemTime::now(),
            handed: false,
        };
        let lease = OpenOptions::new()
            .read(true)
            .write(true)
            .create_new(true)
            .open(batch.directory.join(LEASE))
            .map_err(error)?;
        FileExt::try_lock_exclusive(&lease).map_err(error)?;
        batch.lease = Some(lease);
        let mut names = HashSet::new();
        names.insert(LEASE.to_owned());
        for file in &batch.originals {
            let name = unique_name(&file.name, &mut names)?;
            let output = batch.directory.join(name);
            let mut target = OpenOptions::new()
                .write(true)
                .create_new(true)
                .open(&output)
                .map_err(error)?;
            let (size, hash) =
                copy_hash(plain_file(&file.path)?, &mut target, file.bytes, |_| Ok(()))?;
            if size != file.bytes || hash != file.hash {
                return Err("Managed original integrity mismatch".into());
            }
            target.sync_all().map_err(error)?;
            batch.paths.push(output);
        }
        batch.created = SystemTime::now();
        Ok(batch)
    }

    pub fn names(&self) -> Vec<String> {
        self.paths
            .iter()
            .filter_map(|path| path.file_name()?.to_str().map(str::to_owned))
            .collect()
    }

    pub fn verify(&self, workspace: &Workspace) -> Result<(), String> {
        if self.created.elapsed().unwrap_or(READY) >= READY {
            return Err("The prepared copies expired. Prepare them again.".into());
        }
        let ids = self
            .originals
            .iter()
            .map(|file| file.id.clone())
            .collect::<Vec<_>>();
        if workspace.native_originals(&ids)? != self.originals {
            return Err("A selected resource changed. Prepare the copies again.".into());
        }
        Ok(())
    }

    pub fn paths(&self) -> &[PathBuf] {
        &self.paths
    }

    pub fn handed_to_shell(&mut self) {
        self.handed = true;
        // Preserve successful drops for asynchronous receivers after the OLE loop.
        if let Some(lease) = &self.lease {
            let _ = lease.set_modified(SystemTime::now());
        }
    }
}

impl Drop for PreparedDrag {
    fn drop(&mut self) {
        if !self.handed {
            remove_batch(&self.directory, self.lease.take());
        }
    }
}

fn unique_name(name: &str, used: &mut HashSet<String>) -> Result<String, String> {
    component(name)?;
    if used.insert(name.to_lowercase()) {
        return Ok(name.into());
    }
    let (stem, extension) = name.rsplit_once('.').unwrap_or((name, ""));
    for occurrence in 2..=FILE_LIMIT + 1 {
        let suffix = format!(
            " ({occurrence}){}",
            if extension.is_empty() {
                String::new()
            } else {
                format!(".{extension}")
            }
        );
        if suffix.len() >= 255 {
            return Err("Prepared filenames are too long to disambiguate".into());
        }
        let truncated: String = stem
            .char_indices()
            .take_while(|(index, c)| index + c.len_utf8() + suffix.len() <= 255)
            .map(|(_, c)| c)
            .collect();
        let candidate = format!("{truncated}{suffix}");
        component(&candidate)?;
        if used.insert(candidate.to_lowercase()) {
            return Ok(candidate);
        }
    }
    Err("Could not give each prepared file a distinct name".into())
}

pub fn cleanup(cache: &Path) -> Result<(), String> {
    if cache.exists() {
        plain_directory(cache)?;
        let _cache_lock = cache_lock(cache)?;
        sweep(cache)?;
    }
    Ok(())
}

fn cache_lock(cache: &Path) -> Result<File, String> {
    let marker = cache.join(".cache-lock");
    let lock = match OpenOptions::new()
        .read(true)
        .write(true)
        .create_new(true)
        .open(&marker)
    {
        Ok(file) => file,
        Err(err) if err.kind() == std::io::ErrorKind::AlreadyExists => plain_file(&marker)?,
        Err(err) => return Err(error(err)),
    };
    FileExt::try_lock_exclusive(&lock)
        .map_err(|_| "Another native export is preparing copies".to_string())?;
    Ok(lock)
}

fn sweep(cache: &Path) -> Result<(usize, u64), String> {
    let mut count = 0;
    let mut bytes = 0u64;
    for entry in fs::read_dir(cache).map_err(error)?.take(BATCH_LIMIT + 2) {
        let entry = entry.map_err(error)?;
        if entry.file_name() == ".cache-lock" {
            continue;
        }
        count += 1;
        let directory = entry.path();
        if Uuid::parse_str(&entry.file_name().to_string_lossy()).is_err()
            || plain_directory(&directory).is_err()
        {
            return Err("Unexpected item in the native export cache".into());
        }
        let lease_path = directory.join(LEASE);
        let lease = plain_file(&lease_path).ok();
        let stamp = match &lease {
            Some(file) => file.metadata().map_err(error)?,
            None if !lease_path.exists() => fs::metadata(&directory).map_err(error)?,
            None => return Err("Native export cache contains an invalid lease".into()),
        };
        if stamp
            .modified()
            .map_err(error)?
            .elapsed()
            .unwrap_or_default()
            > RETENTION
        {
            let available = lease
                .as_ref()
                .is_none_or(|file| FileExt::try_lock_exclusive(file).is_ok());
            if available {
                remove_batch(&directory, lease);
                if !directory.exists() {
                    count -= 1;
                    continue;
                }
            }
        }
        let mut files = 0;
        for file in fs::read_dir(&directory)
            .map_err(error)?
            .take(FILE_LIMIT + 2)
        {
            let file = file.map_err(error)?;
            if file.file_name() == LEASE {
                continue;
            }
            files += 1;
            if files > FILE_LIMIT {
                return Err("Unexpected files in the native export cache".into());
            }
            bytes =
                bytes.saturating_add(plain_file(&file.path())?.metadata().map_err(error)?.len());
        }
    }
    Ok((count, bytes))
}

#[cfg(test)]
mod tests {
    use super::*;
    use sha2::{Digest, Sha256};

    #[test]
    fn prepared_copies_cancel_and_expire_without_touching_source_or_live_leases() {
        let temp = tempfile::tempdir().unwrap();
        let source = temp.path().join("source.bin");
        let cache = temp.path().join("cache");
        let bytes = b"immutable input";
        fs::write(&source, bytes).unwrap();
        let file = || Original {
            id: Uuid::new_v4().to_string(),
            path: source.clone(),
            name: "Example.bin".into(),
            hash: format!("{:x}", Sha256::digest(bytes)),
            bytes: bytes.len() as u64,
        };
        let batch = PreparedDrag::prepare(&cache, "fixture".into(), vec![file(), file()]).unwrap();
        assert_eq!(batch.names(), ["Example.bin", "Example (2).bin"]);
        let directory = batch.directory.clone();
        assert_eq!(fs::read(&batch.paths()[0]).unwrap(), bytes);
        let past = SystemTime::now() - RETENTION - Duration::from_secs(60);
        batch.lease.as_ref().unwrap().set_modified(past).unwrap();
        cleanup(&cache).unwrap();
        assert!(directory.exists());
        drop(batch);
        assert!(!directory.exists());
        let mut batch = PreparedDrag::prepare(&cache, "fixture".into(), vec![file()]).unwrap();
        let directory = batch.directory.clone();
        batch.handed_to_shell();
        drop(batch);
        cleanup(&cache).unwrap();
        assert!(directory.exists());
        OpenOptions::new()
            .write(true)
            .open(directory.join(LEASE))
            .unwrap()
            .set_modified(past)
            .unwrap();
        cleanup(&cache).unwrap();
        assert!(!directory.exists());
        assert_eq!(fs::read(source).unwrap(), bytes);
    }
}

fn remove_batch(directory: &Path, lease: Option<File>) {
    if plain_directory(directory).is_ok() {
        if let Ok(entries) = fs::read_dir(directory) {
            for entry in entries.flatten().take(FILE_LIMIT + 1) {
                if entry.file_name() != LEASE && plain_file(&entry.path()).is_ok() {
                    let _ = fs::remove_file(entry.path());
                }
            }
        }
        drop(lease);
        if fs::read_dir(directory).is_ok_and(|mut files| {
            files.all(|entry| entry.is_ok_and(|entry| entry.file_name() == LEASE))
        }) {
            let _ = fs::remove_file(directory.join(LEASE));
            let _ = fs::remove_dir(directory);
        }
    }
}
