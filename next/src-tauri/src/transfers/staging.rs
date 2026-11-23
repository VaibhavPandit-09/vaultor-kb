//! Journal only directories created by an active Activity owner. The receipt
//! stays outside the destination and survives a process or host restart.
use crate::{
    domain::{error, STAGE_PREFIX},
    transfers::{plain_directory, plain_file_with_limit, publish_directory},
};
use serde::{Deserialize, Serialize};
use std::{
    fs, io,
    path::{Path, PathBuf},
};
use uuid::Uuid;

#[derive(Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
struct Receipt {
    parent: PathBuf,
    stage: Uuid,
    cleanup: Uuid,
    identity: String,
}

pub(super) struct Stage {
    pub path: PathBuf,
    journal: PathBuf,
    receipt: Receipt,
}

fn stage_path(parent: &Path, id: Uuid) -> PathBuf {
    parent.join(format!("{STAGE_PREFIX}{id}"))
}

fn identity(path: &Path) -> Result<Option<String>, String> {
    match fs::symlink_metadata(path) {
        Err(e) if e.kind() == io::ErrorKind::NotFound => return Ok(None),
        Err(e) => return Err(error(e)),
        Ok(_) => plain_directory(path)?,
    }
    #[cfg(windows)]
    {
        use std::os::windows::fs::OpenOptionsExt;
        use windows_sys::Win32::Storage::FileSystem::{
            FILE_FLAG_BACKUP_SEMANTICS, FILE_FLAG_OPEN_REPARSE_POINT,
        };
        let folder = fs::OpenOptions::new()
            .read(true)
            .custom_flags(FILE_FLAG_BACKUP_SEMANTICS | FILE_FLAG_OPEN_REPARSE_POINT)
            .open(path)
            .map_err(error)?;
        if crate::transfers::reparse(&folder.metadata().map_err(error)?) {
            return Err("Staging directory is a reparse point".into());
        }
        Ok(Some(format!(
            "{}:{}",
            crate::linked::native::identity(&folder)?,
            crate::linked::native::birth(&folder)?
        )))
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::MetadataExt;
        let metadata = fs::symlink_metadata(path).map_err(error)?;
        if !metadata.is_dir() {
            return Err("Staging path is not an ordinary directory".into());
        }
        Ok(Some(format!("{}:{}", metadata.dev(), metadata.ino())))
    }
    #[cfg(not(any(windows, unix)))]
    Err("Staging identity is unavailable on this platform".into())
}

fn clean(receipt: &Receipt) -> Result<(), String> {
    if !receipt.parent.is_absolute() || receipt.stage == receipt.cleanup {
        return Err("Invalid staging receipt".into());
    }
    let original = stage_path(&receipt.parent, receipt.stage);
    let cleanup = stage_path(&receipt.parent, receipt.cleanup);
    match (identity(&original)?, identity(&cleanup)?) {
        (None, None) => return Ok(()),
        (Some(id), None) if id == receipt.identity => publish_directory(&original, &cleanup)?,
        (None, Some(id)) if id == receipt.identity => {}
        _ => return Err("Staging identity changed; retained the directory for review".into()),
    }
    // Recheck after the rename. A directory moved in place of the stage
    // between the initial check and rename is never recursively removed.
    if identity(&cleanup)?.as_deref() != Some(&receipt.identity) {
        return Err("Staging identity changed during quarantine; retained it".into());
    }
    fs::remove_dir_all(&cleanup).map_err(error)
}

impl Stage {
    pub fn create(parent: &Path, directory: &Path, operation: &str) -> Result<Self, String> {
        let operation = Uuid::parse_str(operation).map_err(error)?;
        fs::create_dir_all(parent).map_err(error)?;
        plain_directory(parent)?;
        let parent = parent.canonicalize().map_err(error)?;
        fs::create_dir_all(directory).map_err(error)?;
        plain_directory(directory)?;
        let stage = Uuid::new_v4();
        let cleanup = Uuid::new_v4();
        let path = stage_path(&parent, stage);

        #[cfg(unix)]
        {
            use std::os::unix::fs::DirBuilderExt;
            fs::DirBuilder::new()
                .mode(0o700)
                .create(&path)
                .map_err(error)?;
        }
        #[cfg(not(unix))]
        fs::create_dir(&path).map_err(error)?;
        let journal = directory.join(format!("{operation}.json"));
        let record = (|| {
            let receipt = Receipt {
                parent,
                stage,
                cleanup,
                identity: identity(&path)?.ok_or("Created staging directory disappeared")?,
            };
            let mut output = tempfile::NamedTempFile::new_in(directory).map_err(error)?;
            serde_json::to_writer(output.as_file_mut(), &receipt).map_err(error)?;
            output.as_file().sync_all().map_err(error)?;
            output.persist_noclobber(&journal).map_err(error)?;
            #[cfg(unix)]
            fs::File::open(directory)
                .and_then(|dir| dir.sync_all())
                .map_err(error)?;
            Ok(receipt)
        })();
        match record {
            Ok(receipt) => Ok(Self {
                path,
                journal,
                receipt,
            }),
            Err(e) => {
                // At this point the stage was never handed to a writer.
                let _ = fs::remove_dir(path);
                Err(e)
            }
        }
    }
}

impl Drop for Stage {
    fn drop(&mut self) {
        if clean(&self.receipt).is_ok() {
            let _ = fs::remove_file(&self.journal);
        }
    }
}

pub(crate) fn recover(directory: &Path) -> Vec<(String, String)> {
    match fs::symlink_metadata(directory) {
        Err(e) if e.kind() == io::ErrorKind::NotFound => return Vec::new(),
        _ => {}
    }
    let read = || {
        plain_directory(directory)?;
        fs::read_dir(directory).map_err(error)
    };
    let entries = match read() {
        Ok(entries) => entries,
        Err(e) => return vec![(String::new(), e)],
    };
    let mut issues = Vec::new();
    for entry in entries {
        let Ok(entry) = entry else { continue };
        let path = entry.path();
        let Some(id) = path.file_stem().and_then(|s| s.to_str()).filter(|id| {
            path.extension().and_then(|s| s.to_str()) == Some("json") && Uuid::parse_str(id).is_ok()
        }) else {
            continue;
        };
        let attempt = || -> Result<(), String> {
            let file = plain_file_with_limit(&path, 64 * 1024)?;
            let receipt = serde_json::from_reader(file).map_err(error)?;
            clean(&receipt)?;
            fs::remove_file(&path).map_err(error)
        };
        if let Err(err) = attempt() {
            issues.push((id.to_owned(), err));
        }
    }
    issues
}

pub(super) fn merge_lock(root: &Path) -> Result<fs::File, String> {
    plain_directory(root)?;
    let mut options = fs::OpenOptions::new();
    options.read(true).write(true).create(true).truncate(false);
    #[cfg(windows)]
    {
        use std::os::windows::fs::OpenOptionsExt;
        options.custom_flags(windows_sys::Win32::Storage::FileSystem::FILE_FLAG_OPEN_REPARSE_POINT);
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.custom_flags(libc::O_NOFOLLOW);
    }
    let file = options
        .open(root.join(".vaultor-merge.lock"))
        .map_err(error)?;
    let metadata = file.metadata().map_err(error)?;
    if crate::transfers::reparse(&metadata) || !metadata.is_file() {
        return Err("Merge lock is not an ordinary file".into());
    }
    Ok(file)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn receipt_refuses_a_replaced_directory_and_retries_verified_quarantine() {
        let root = tempfile::tempdir().unwrap();
        let journal = root.path().join("journal");
        let stage = Stage::create(root.path(), &journal, &Uuid::new_v4().to_string()).unwrap();
        let prior = root.path().join("held");
        fs::rename(&stage.path, &prior).unwrap();
        fs::create_dir(&stage.path).unwrap();
        fs::write(stage.path.join("unrelated.txt"), b"preserve").unwrap();
        let path = stage.path.clone();
        drop(stage);
        assert_eq!(recover(&journal).len(), 1);
        assert_eq!(fs::read(path.join("unrelated.txt")).unwrap(), b"preserve");
        fs::rename(&path, root.path().join("unrelated")).unwrap();
        fs::rename(&prior, path).unwrap();
        assert!(recover(&journal).is_empty());
        assert!(recover(&journal).is_empty());
        assert_eq!(
            fs::read(root.path().join("unrelated/unrelated.txt")).unwrap(),
            b"preserve"
        );
    }

    #[cfg(windows)]
    #[test]
    fn locked_file_retains_cleanup_receipt_until_the_lock_is_released() {
        use std::os::windows::fs::OpenOptionsExt;
        let root = tempfile::tempdir().unwrap();
        let journal = root.path().join("journal");
        let stage = Stage::create(root.path(), &journal, &Uuid::new_v4().to_string()).unwrap();
        let locked = fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .share_mode(0)
            .open(stage.path.join("locked.bin"))
            .unwrap();
        drop(stage);
        assert_eq!(recover(&journal).len(), 1);
        drop(locked);
        assert!(recover(&journal).is_empty());
        assert!(recover(&journal).is_empty());
        assert_eq!(fs::read_dir(root.path()).unwrap().count(), 1);
    }

    #[cfg(windows)]
    #[test]
    fn access_denied_stage_remains_recoverable_until_permissions_are_restored() {
        let root = tempfile::tempdir().unwrap();
        let journal = root.path().join("journal");
        let stage = Stage::create(root.path(), &journal, &Uuid::new_v4().to_string()).unwrap();
        let original = stage.path.clone();
        let quarantine = stage_path(&stage.receipt.parent, stage.receipt.cleanup);
        let file = original.join("disposable.bin");
        fs::write(&file, b"staged data").unwrap();
        let acl = |path: &Path, args: [&str; 2]| {
            std::process::Command::new("icacls.exe").arg(path).args(args).output().unwrap().status.success()
        };
        let file_denied = acl(&file, ["/deny", "*S-1-1-0:(DE)"]);
        let folder_denied = acl(&original, ["/deny", "*S-1-1-0:(DC)"]);
        drop(stage);
        let issues = recover(&journal);
        let retained = if original.exists() { original } else { quarantine };
        let retained_file = retained.join("disposable.bin");
        let permissions_restored = if retained_file.exists() {
            let file_restored = acl(&retained_file, ["/remove:d", "*S-1-1-0"]);
            let directory_restored = acl(&retained, ["/remove:d", "*S-1-1-0"]);
            file_restored && directory_restored
        } else { false };
        assert!(file_denied && folder_denied && permissions_restored);
        assert_eq!(issues.len(), 1);
        assert!(issues[0].1.contains("os error 5"), "{:?}", issues);
        assert_eq!(fs::read(retained_file).unwrap(), b"staged data");
        assert!(recover(&journal).is_empty());
        assert!(recover(&journal).is_empty());
        assert!(!retained.exists());
    }
}
