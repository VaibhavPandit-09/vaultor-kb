use std::{
    ffi::OsString,
    io,
    os::unix::fs::{FileTypeExt, PermissionsExt},
    path::{Path, PathBuf},
    time::Duration,
};
use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    net::{UnixListener, UnixStream},
};
use vaultor_next::host::Host;

pub struct Socket {
    path: PathBuf,
    work: tokio::task::JoinHandle<()>,
}

impl Socket {
    pub fn start(access: &Path, host: Host) -> io::Result<Self> {
        let path = access.join("owner.sock");
        match std::fs::symlink_metadata(&path) {
            Ok(meta) if meta.file_type().is_socket() => std::fs::remove_file(&path)?,
            Ok(_) => return Err(io::Error::other("Owner socket path is occupied")),
            Err(error) if error.kind() == io::ErrorKind::NotFound => {}
            Err(error) => return Err(error),
        }
        let listener = UnixListener::bind(&path)?;
        std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o600))?;
        let work = tokio::spawn(async move {
            while let Ok((connection, _)) = listener.accept().await {
                let _ =
                    tokio::time::timeout(Duration::from_secs(5), serve(connection, host.clone()))
                        .await;
            }
        });
        Ok(Self { path, work })
    }
}

impl Drop for Socket {
    fn drop(&mut self) {
        self.work.abort();
        let _ = std::fs::remove_file(&self.path);
    }
}

async fn serve(mut client: UnixStream, host: Host) -> io::Result<()> {
    let mut input = String::new();
    (&mut client).take(513).read_to_string(&mut input).await?;
    let result = if input.len() > 512 {
        Err("Owner command exceeds the size limit".into())
    } else {
        tokio::task::spawn_blocking(move || host.owner_command(&input)).await?
    };
    let reply = serde_json::to_vec(&result)?;
    client.write_all(&reply).await?;
    client.shutdown().await
}

pub async fn command(access: &Path, args: &[OsString]) -> Result<(), Box<dyn std::error::Error>> {
    let mut client = UnixStream::connect(access.join("owner.sock")).await?;
    let input = args
        .iter()
        .map(|arg| arg.to_str().ok_or("Owner command must be UTF-8"))
        .collect::<Result<Vec<_>, _>>()?
        .join(" ");
    client.write_all(input.as_bytes()).await?;
    client.shutdown().await?;
    let mut reply = Vec::new();
    client.take(512 * 1024).read_to_end(&mut reply).await?;
    let result: Result<serde_json::Value, String> = serde_json::from_slice(&reply)?;
    println!("{}", result?);
    Ok(())
}
