use super::{lock_directory, Identity};
use rcgen::{
    BasicConstraints, CertificateParams, DistinguishedName, DnType, ExtendedKeyUsagePurpose, IsCa,
    Issuer, KeyPair, KeyUsagePurpose,
};
use rustls::pki_types::{pem::PemObject, CertificateDer, PrivateKeyDer, PrivatePkcs8KeyDer};
use std::{
    fs::{self, File},
    io::{self, Read, Write},
    net::IpAddr,
    path::Path,
    ptr,
};
use time::{Duration, OffsetDateTime};
use windows_sys::Win32::{
    Foundation::LocalFree,
    Security::Cryptography::{
        CryptProtectData, CryptUnprotectData, CRYPTPROTECT_UI_FORBIDDEN, CRYPT_INTEGER_BLOB,
    },
};
use zeroize::Zeroizing;

const BLOB_LIMIT: u64 = 16 * 1024;
const LEAF_DAYS: i64 = 30;

pub struct Authority {
    issuer: Issuer<'static, KeyPair>,
    certificate: CertificateDer<'static>,
    valid_from: i64,
    expires: i64,
}

impl Authority {
    pub fn open(access: &Path) -> Result<(Identity, Option<Self>), String> {
        let result = (|| -> Result<_, Box<dyn std::error::Error>> {
            match fs::symlink_metadata(access) {
                Err(error) if error.kind() == io::ErrorKind::NotFound => provision(access)?,
                Err(error) => return Err(error.into()),
                Ok(_) => {}
            }
            let (directory, lock) = lock_directory(access)?;
            let certificate = CertificateDer::from_pem_file(directory.join("ca.pem"))?;
            let identity = Identity::load(directory.clone(), lock, certificate.clone())?;
            let key_path = directory.join("authority.dpapi");
            let authority = match fs::symlink_metadata(&key_path) {
                Err(error) if error.kind() == io::ErrorKind::NotFound => None,
                Err(error) => return Err(error.into()),
                Ok(info) if info.is_file() && info.len() <= BLOB_LIMIT => {
                    let mut sealed = Vec::new();
                    File::open(key_path)?
                        .take(BLOB_LIMIT + 1)
                        .read_to_end(&mut sealed)?;
                    if sealed.len() as u64 > BLOB_LIMIT {
                        return Err("Invalid protected authority".into());
                    }
                    let key = protect(&sealed, false)?;
                    let key = KeyPair::try_from(key.as_slice())?;
                    let issuer = Issuer::from_ca_cert_der(&certificate, key)?;
                    let (_, parsed) = x509_parser::parse_x509_certificate(certificate.as_ref())
                        .map_err(|_| "Invalid host authority certificate")?;
                    let valid_from = parsed.validity().not_before.timestamp();
                    let expires = parsed.validity().not_after.timestamp();
                    Some(Self {
                        issuer,
                        certificate,
                        valid_from,
                        expires,
                    })
                }
                Ok(_) => return Err("Invalid protected authority".into()),
            };
            Ok((identity, authority))
        })();
        result.map_err(|error| format!("Host certificate setup failed. {error}"))
    }

    pub(in crate::host) fn issue(
        &self,
        ip: IpAddr,
        now: OffsetDateTime,
    ) -> io::Result<(
        Vec<CertificateDer<'static>>,
        PrivateKeyDer<'static>,
        OffsetDateTime,
    )> {
        if !(self.valid_from..self.expires).contains(&now.unix_timestamp()) {
            return Err(io::Error::other(
                "Host authority expired or the system clock is incorrect",
            ));
        }
        let mut params = CertificateParams::new(vec![ip.to_string()]).map_err(io::Error::other)?;
        params.distinguished_name = name("Vaultor Next HTTPS");
        params.not_before = now - Duration::minutes(10);
        params.not_after = (now + Duration::days(LEAF_DAYS))
            .min(OffsetDateTime::from_unix_timestamp(self.expires).map_err(io::Error::other)?);
        params.key_usages = vec![KeyUsagePurpose::DigitalSignature];
        params.extended_key_usages = vec![ExtendedKeyUsagePurpose::ServerAuth];
        let expires = params.not_after;
        let key = KeyPair::generate().map_err(io::Error::other)?;
        let leaf = params
            .signed_by(&key, &self.issuer)
            .map_err(io::Error::other)?;
        Ok((
            vec![leaf.der().clone(), self.certificate.clone()],
            PrivatePkcs8KeyDer::from(key.serialize_der()).into(),
            expires,
        ))
    }

    pub(in crate::host) fn needs_renewal(expires: OffsetDateTime, now: OffsetDateTime) -> bool {
        expires - now <= Duration::days(7)
    }
}

fn name(common: &str) -> DistinguishedName {
    let mut name = DistinguishedName::new();
    name.push(DnType::CommonName, common);
    name
}

fn provision(access: &Path) -> Result<(), Box<dyn std::error::Error>> {
    let parent = access
        .parent()
        .ok_or("Host access needs a profile directory")?;
    let staged = tempfile::Builder::new()
        .prefix(".host-provision-")
        .tempdir_in(parent)?;
    let now = OffsetDateTime::now_utc();
    let mut params = CertificateParams::default();
    params.distinguished_name = name(&format!("Vaultor Next Host {}", uuid::Uuid::new_v4()));
    params.is_ca = IsCa::Ca(BasicConstraints::Constrained(0));
    params.key_usages = vec![KeyUsagePurpose::KeyCertSign, KeyUsagePurpose::CrlSign];
    params.not_before = now - Duration::hours(1);
    params.not_after = now + Duration::days(3650);
    let key = KeyPair::generate()?;
    let cert = params.self_signed(&key)?;
    let raw = Zeroizing::new(key.serialize_der());
    let protected = protect(&raw, true)?;
    let public_file = staged.path().join("ca.pem");
    durable_file(&public_file, cert.pem().as_bytes())?;
    durable_file(&staged.path().join("authority.dpapi"), &protected)?;
    Identity::initialize(staged.path(), &public_file)?;
    // Publish the complete identity in one rename. Windows refuses an existing target.
    fs::rename(staged.path(), access)?;
    Ok(())
}

fn durable_file(path: &Path, data: &[u8]) -> io::Result<()> {
    let mut file = File::create_new(path)?;
    file.write_all(data)?;
    file.sync_all()
}

fn protect(data: &[u8], encrypt: bool) -> io::Result<Zeroizing<Vec<u8>>> {
    let input = CRYPT_INTEGER_BLOB {
        cbData: data.len() as u32,
        pbData: data.as_ptr().cast_mut(),
    };
    let mut output = CRYPT_INTEGER_BLOB {
        cbData: 0,
        pbData: ptr::null_mut(),
    };
    // DPAPI borrows the input and allocates the result with LocalAlloc on success.
    let ok = unsafe {
        if encrypt {
            CryptProtectData(
                &input,
                ptr::null(),
                ptr::null(),
                ptr::null(),
                ptr::null(),
                CRYPTPROTECT_UI_FORBIDDEN,
                &mut output,
            )
        } else {
            CryptUnprotectData(
                &input,
                ptr::null_mut(),
                ptr::null(),
                ptr::null(),
                ptr::null(),
                CRYPTPROTECT_UI_FORBIDDEN,
                &mut output,
            )
        }
    };
    if ok == 0 {
        return Err(io::Error::other(
            "Windows could not protect or unlock this host key",
        ));
    }
    if output.pbData.is_null() {
        return Err(io::Error::other("Windows returned no host key material"));
    }
    let bytes = unsafe {
        use zeroize::Zeroize;
        let result = std::slice::from_raw_parts_mut(output.pbData, output.cbData as usize);
        let bytes = Zeroizing::new(result.to_vec());
        result.zeroize();
        LocalFree(output.pbData.cast());
        bytes
    };
    Ok(bytes)
}
