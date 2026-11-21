use mdns_sd::{IfKind, ServiceDaemon, ServiceInfo};
use std::{
    net::{IpAddr, SocketAddr},
    time::Duration,
};
use uuid::Uuid;

pub(super) struct Advertisement {
    daemon: ServiceDaemon,
    name: String,
}

impl Advertisement {
    pub(super) fn start(address: SocketAddr, host: Uuid) -> Result<Self, String> {
        let IpAddr::V4(ip) = address.ip() else {
            return Err("Nearby discovery requires a private IPv4 listening address.".into());
        };
        if !ip.is_private() {
            return Err("Choose a private network address to advertise this host.".into());
        }
        let label = std::env::var("COMPUTERNAME").unwrap_or_else(|_| "Vaultor Next".into());
        let label: String = label
            .chars()
            .filter(|c| c.is_ascii_alphanumeric() || *c == '-')
            .take(40)
            .collect();
        let id = host.to_string();
        let info = ServiceInfo::new(
            "_vaultor._tcp.local.",
            &format!(
                "{} - {}",
                if label.is_empty() {
                    "Vaultor Next"
                } else {
                    &label
                },
                &id[..8]
            ),
            &format!("vaultor-{}.local.", &id[..8]),
            address.ip(),
            address.port(),
            &[
                ("hostId", id.as_str()),
                ("protocol", "1"),
                ("nextMobile", "1"),
            ][..],
        )
        .map_err(crate::domain::error)?;
        let name = info.get_fullname().to_owned();
        let daemon = ServiceDaemon::new().map_err(crate::domain::error)?;
        let advertisement = Self { daemon, name };
        advertisement
            .daemon
            .disable_interface(IfKind::All)
            .map_err(crate::domain::error)?;
        advertisement
            .daemon
            .enable_interface(IfKind::Addr(address.ip()))
            .map_err(crate::domain::error)?;
        advertisement
            .daemon
            .register(info)
            .map_err(crate::domain::error)?;
        Ok(advertisement)
    }
}

impl Drop for Advertisement {
    fn drop(&mut self) {
        if let Ok(receipt) = self.daemon.unregister(&self.name) {
            let _ = receipt.recv_timeout(Duration::from_millis(250));
        }
        let _ = self.daemon.shutdown();
    }
}
