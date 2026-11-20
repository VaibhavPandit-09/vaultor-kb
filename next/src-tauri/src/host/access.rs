use axum::http::StatusCode;
use rustls::pki_types::{pem::PemObject, CertificateDer};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    collections::BTreeSet,
    fs::{File, OpenOptions},
    io::{self, Read, Write},
    path::Path,
};
use uuid::Uuid;

pub struct Identity {
    pub(super) id: Uuid,
    pub(super) fingerprint: String,
    pub(super) certificate: CertificateDer<'static>,
    directory: std::path::PathBuf,
    _lock: File,
}

#[derive(Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
struct IdentityRecord {
    id: Uuid,
    fingerprint: String,
}

fn private_directory(path: &Path) -> io::Result<()> {
    let info = std::fs::symlink_metadata(path)?;
    if !info.is_dir() {
        return Err(io::Error::other("Expected an ordinary access directory"));
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        if info.permissions().mode() & 0o077 != 0 {
            return Err(io::Error::other(
                "Host access directory must be private (0700)",
            ));
        }
    }
    Ok(())
}

impl Identity {
    pub fn initialize(access: &Path, ca: &Path) -> Result<Uuid, Box<dyn std::error::Error>> {
        private_directory(access)?;
        let certificate = CertificateDer::from_pem_file(ca)?;
        let record = IdentityRecord {
            id: Uuid::new_v4(),
            fingerprint: hex::encode(Sha256::digest(certificate.as_ref())),
        };
        let mut file = tempfile::NamedTempFile::new_in(access)?;
        serde_json::to_writer(file.as_file_mut(), &record)?;
        file.flush()?;
        file.as_file().sync_all()?;
        // Existing identities require explicit recovery into a separate access directory.
        file.persist_noclobber(access.join("identity.json"))?;
        match std::fs::create_dir(access.join("grants")) {
            Ok(()) => {}
            Err(err) if err.kind() == io::ErrorKind::AlreadyExists => {}
            Err(err) => return Err(err.into()),
        }
        Ok(record.id)
    }

    pub fn open(access: &Path, ca: &Path) -> Result<Self, Box<dyn std::error::Error>> {
        let access = access.canonicalize()?;
        private_directory(&access)?;
        if !std::fs::symlink_metadata(access.join("grants"))?.is_dir() {
            return Err("Expected an ordinary device grant directory".into());
        }
        let lock = OpenOptions::new()
            .create(true)
            .truncate(false)
            .read(true)
            .write(true)
            .open(access.join("host.lock"))?;
        fs2::FileExt::try_lock_exclusive(&lock)?;
        let mut bytes = Vec::new();
        File::open(access.join("identity.json"))?
            .take(1025)
            .read_to_end(&mut bytes)?;
        if bytes.len() > 1024 {
            return Err("Host identity is damaged".into());
        }
        let IdentityRecord { id, fingerprint } = serde_json::from_slice(&bytes)?;
        let certificate = CertificateDer::from_pem_file(ca)?;
        if fingerprint != hex::encode(Sha256::digest(certificate.as_ref())) {
            return Err("Host authority changed. Restore the original CA or initialize a separate host identity".into());
        }
        Ok(Self {
            id,
            fingerprint,
            certificate,
            directory: access,
            _lock: lock,
        })
    }

    pub(super) fn directory(&self) -> &Path {
        &self.directory
    }
}

#[derive(Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub(super) struct Record {
    pub workspaces: BTreeSet<Uuid>,
    pub device: Uuid,
    pub label: String,
}

pub(super) struct Grant {
    pub(super) device: Uuid,
    pub(super) label: String,
    pub(super) workspaces: BTreeSet<Uuid>,
    verifier: [u8; 32],
}

impl Grant {
    pub(super) fn current_sync(&self, access: &Path, workspace: Uuid) -> bool {
        let path = access
            .join("grants")
            .join(format!("{}.json", hex::encode(self.verifier)));
        read_record(&path)
            .is_ok_and(|r| r.device == self.device && r.workspaces.contains(&workspace))
    }

    pub(super) async fn current(&self, access: &Path, workspace: Uuid) -> bool {
        read_grant(access, self.verifier)
            .await
            .is_ok_and(|grant| grant.device == self.device && grant.workspaces.contains(&workspace))
    }
}

pub(super) async fn authenticate(access: &Path, value: &str) -> Result<Grant, StatusCode> {
    if value.len() != 64 || !value.bytes().all(|c| c.is_ascii_hexdigit()) {
        return Err(StatusCode::UNAUTHORIZED);
    }
    read_grant(access, Sha256::digest(value.as_bytes()).into())
        .await
        .map_err(|_| StatusCode::UNAUTHORIZED)
}

fn read_record(path: &Path) -> io::Result<Record> {
    use std::io::Read;
    let file = std::fs::File::open(path)?;
    let mut data = Vec::with_capacity(256);
    file.take(1025).read_to_end(&mut data)?;
    let invalid = || io::Error::new(io::ErrorKind::PermissionDenied, "Grant unavailable");
    if data.len() > 1024 {
        return Err(invalid());
    }
    serde_json::from_slice(&data).map_err(|_| invalid())
}

async fn read_grant(access: &Path, verifier: [u8; 32]) -> io::Result<Grant> {
    let path = access
        .join("grants")
        .join(format!("{}.json", hex::encode(verifier)));
    let record = tokio::task::spawn_blocking(move || read_record(&path)).await??;
    Ok(Grant {
        device: record.device,
        label: record.label,
        workspaces: record.workspaces,
        verifier,
    })
}

pub(super) fn new_credential() -> io::Result<String> {
    let mut bytes = [0; 32];
    getrandom::fill(&mut bytes).map_err(io::Error::other)?;
    Ok(hex::encode(bytes))
}

pub(super) fn add(access: &Path, credential: &str, record: &Record) -> io::Result<()> {
    let directory = access.join("grants");
    if records(access)?.len() >= 1000 {
        return Err(io::Error::other("Device limit reached"));
    }
    let mut file = tempfile::NamedTempFile::new_in(&directory)?;
    serde_json::to_writer(file.as_file_mut(), record)?;
    file.flush()?;
    file.as_file().sync_all()?;
    let verifier = hex::encode(Sha256::digest(credential.as_bytes()));
    file.persist_noclobber(directory.join(format!("{verifier}.json")))?;
    Ok(())
}

fn records(access: &Path) -> io::Result<Vec<(std::path::PathBuf, Record)>> {
    let mut records = Vec::new();
    for entry in std::fs::read_dir(access.join("grants"))? {
        let entry = entry?;
        let path = entry.path();
        if path.extension().is_some_and(|value| value == "json") {
            records.push((path.clone(), read_record(&path)?));
        }
        if records.len() > 1000 {
            return Err(io::Error::other("Device limit exceeded"));
        }
    }
    Ok(records)
}

pub(super) fn devices(access: &Path, workspace: Uuid) -> io::Result<Vec<serde_json::Value>> {
    Ok(records(access)?.into_iter().map(|(_, record)| serde_json::json!({
        "id": record.device, "name": record.label, "workspace": record.workspaces.contains(&workspace).then_some(workspace),
    })).collect())
}

pub(super) fn revoke(access: &Path, id: Uuid) -> io::Result<()> {
    for (path, record) in records(access)? {
        if record.device == id {
            std::fs::remove_file(path)?;
        }
    }
    Ok(())
}

pub(super) fn set_grant(access: &Path, id: Uuid, workspace: Uuid, allow: bool) -> io::Result<()> {
    for (path, mut record) in records(access)? {
        if record.device == id {
            if allow {
                if record.workspaces.len() >= 16 && !record.workspaces.contains(&workspace) {
                    return Err(io::Error::other("Workspace grant limit reached"));
                }
                record.workspaces.insert(workspace);
            } else {
                record.workspaces.remove(&workspace);
            }
            let mut file = tempfile::NamedTempFile::new_in(access.join("grants"))?;
            serde_json::to_writer(file.as_file_mut(), &record)?;
            file.flush()?;
            file.as_file().sync_all()?;
            file.persist(path)?;
            return Ok(());
        }
    }
    Err(io::Error::new(
        io::ErrorKind::NotFound,
        "Approved device not found",
    ))
}
