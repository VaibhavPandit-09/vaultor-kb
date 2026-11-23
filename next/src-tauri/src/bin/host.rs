use std::{
    io::{BufRead, IsTerminal},
    net::SocketAddr,
    path::PathBuf,
};
use vaultor_next::{
    host::{Host, Identity},
    worker::Worker,
};
#[cfg(unix)]
#[path = "../host/unix_owner.rs"]
mod unix_owner;

#[tokio::main(flavor = "current_thread")]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    vaultor_next::pdf_text::run_worker_if_requested();
    let args: Vec<_> = std::env::args_os().skip(1).collect();
    #[cfg(unix)]
    if let [command, access, operation @ ..] = args.as_slice() {
        if command == "owner" {
            return unix_owner::command(&PathBuf::from(access), operation).await;
        }
    }
    if let [command, access, authority] = args.as_slice() {
        if command == "init" {
            let id = Identity::initialize(&PathBuf::from(access), &PathBuf::from(authority))?;
            println!("Initialized host {id}");
            return Ok(());
        }
    }
    let [workspace, access, certificate, private_key, authority, address] = args.as_slice() else {
        return Err("Usage: vaultor-next-host WORKSPACE ACCESS_DIR TLS_CHAIN_PEM TLS_KEY_PEM CA_PEM IP:PORT".into());
    };
    let root = PathBuf::from(workspace);
    let access = std::fs::canonicalize(access)?;
    let identity = Identity::open(&access, &PathBuf::from(authority))?;
    let address: SocketAddr = address.to_str().ok_or("Invalid address")?.parse()?;
    let worker = Worker::start(root.clone(), None)?;
    worker.call(vaultor_next::domain::Request::Snapshot).await?;
    let host = Host::new(worker.storage(), root, identity).await?;
    #[cfg(unix)]
    let owner_socket = unix_owner::Socket::start(&access, host.clone())?;
    let listener = host
        .clone()
        .listen(
            address,
            PathBuf::from(certificate),
            PathBuf::from(private_key),
        )
        .await?;
    println!("Vaultor Next HTTPS listening at {}", listener.address());
    let (done, quit) = tokio::sync::oneshot::channel();
    // A service without an attached terminal can serve existing approvals.
    let _owner = std::thread::Builder::new().name("vaultor-host-console".into()).spawn(move || {
        if !std::io::stdin().is_terminal() || !std::io::stderr().is_terminal() {
            return;
        }
        eprintln!("Local owner commands: pending, approve ID CODE, reject ID CODE, devices, grant ID, withdraw ID, revoke ID, zip list, zip preview ID, zip approve ID NEW_PATH, zip reject ID, quit");
        for line in std::io::stdin().lock().lines().map_while(Result::ok) {
            if line.trim() == "quit" {
                let _ = done.send(());
                return;
            }
            match host.owner_command(&line) {
                Ok(value) => eprintln!("{value}"),
                Err(error) => eprintln!("{error}"),
            }
        }
    })?;
    #[cfg(unix)]
    {
        let mut terminate =
            tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())?;
        tokio::select! {
            result = tokio::signal::ctrl_c() => result?,
            _ = terminate.recv() => {},
            Ok(()) = quit => {},
        }
    }
    #[cfg(not(unix))]
    tokio::select! {
        result = tokio::signal::ctrl_c() => result?,
        Ok(()) = quit => {},
    }
    listener.stop().await?;
    #[cfg(unix)]
    drop(owner_socket);
    worker.stop();
    Ok(())
}
