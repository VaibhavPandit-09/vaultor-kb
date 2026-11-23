//! Verified portable archive input. ZIP entry names never become filesystem paths.
use super::*;
use serde::de::{Error as DeError, MapAccess, Visitor};
use std::fmt;
use std::io::{Seek, SeekFrom};
use zip::ZipArchive;

const ZIP_BYTES: u64 = 512 * 1024 * 1024;
const ZIP_EXPANDED: u64 = 2 * 1024 * 1024 * 1024;
const ZIP_JSON: u64 = 20 * 1024 * 1024;

pub(super) enum Input {
    Native(File),
    Legacy(Box<ZipArchive<File>>, Vec<String>),
}

impl Input {
    pub(super) fn copy(
        &mut self,
        index: usize,
        original: &Original,
        output: impl Write,
        progress: impl FnMut(u64) -> Result<(), String>,
    ) -> Result<(), String> {
        let (size, hash) = match self {
            Self::Native(file) => {
                copy_hash(file.take(original.bytes), output, original.bytes, progress)?
            }
            Self::Legacy(zip, names) => copy_hash(
                zip.by_name(&names[index]).map_err(error)?,
                output,
                original.bytes,
                progress,
            )?,
        };
        if size != original.bytes || hash != original.hash {
            return Err("Archive payload integrity mismatch".into());
        }
        Ok(())
    }

    pub(super) fn finish(&mut self) -> Result<(), String> {
        if let Self::Native(file) = self {
            if file.read(&mut [0]).map_err(error)? != 0 {
                return Err("Unexpected trailing archive data".into());
            }
        }
        Ok(())
    }
}

pub(super) fn open(path: &Path) -> Result<(Input, Manifest, String, Option<u32>), String> {
    let mut file = plain_file_archive(path)?;
    let mut signature = [0; 4];
    file.read_exact(&mut signature).map_err(error)?;
    file.rewind().map_err(error)?;
    if &signature == b"PK\x03\x04" {
        return legacy(file);
    }
    let (manifest, hash) = read_manifest(&mut file)?;
    Ok((Input::Native(file), manifest, hash, None))
}

// The Java writer uses single-disk ZIP32 with no archive comment. Walk the actual
// directory before ZipArchive indexes entries by name and loses duplicate evidence.
fn directory(file: &mut File) -> Result<(usize, u64), String> {
    let size = file.metadata().map_err(error)?.len();
    if !(22..=ZIP_BYTES).contains(&size) {
        return Err("Legacy ZIP exceeds the supported archive size or is incomplete".into());
    }
    let end_pos = size - 22;
    file.seek(SeekFrom::Start(end_pos)).map_err(error)?;
    let mut end = [0; 22];
    file.read_exact(&mut end).map_err(error)?;
    let count = u16::from_le_bytes(end[10..12].try_into().unwrap()) as usize;
    let directory_size = u32::from_le_bytes(end[12..16].try_into().unwrap()) as u64;
    let start = u32::from_le_bytes(end[16..20].try_into().unwrap()) as u64;
    if &end[..4] != b"PK\x05\x06"
        || end[4..8] != [0; 4]
        || end[8..10] != end[10..12]
        || end[20..] != [0; 2]
        || !(2..=MAX_ITEMS).contains(&count)
        || start + directory_size != end_pos
    {
        return Err("Unsupported or damaged legacy ZIP directory".into());
    }
    let mut entries = HashSet::with_capacity(count);
    let mut next = start;
    for _ in 0..count {
        if next + 46 > end_pos {
            return Err("Truncated ZIP directory record".into());
        }
        file.seek(SeekFrom::Start(next)).map_err(error)?;
        let mut entry = [0; 46];
        file.read_exact(&mut entry).map_err(error)?;
        let name_len = u16::from_le_bytes(entry[28..30].try_into().unwrap()) as usize;
        let extra = u16::from_le_bytes(entry[30..32].try_into().unwrap()) as u64;
        let comment = u16::from_le_bytes(entry[32..34].try_into().unwrap()) as u64;
        let offset = u32::from_le_bytes(entry[42..46].try_into().unwrap()) as u64;
        next += 46 + name_len as u64 + extra + comment;
        if &entry[..4] != b"PK\x01\x02"
            || entry[34..36] != [0; 2]
            || offset + 30 + name_len as u64 > start
            || !(1..=80).contains(&name_len)
            || next > end_pos
        {
            return Err("Invalid legacy ZIP entry header".into());
        }
        let mut name = vec![0; name_len];
        file.read_exact(&mut name).map_err(error)?;
        let name = String::from_utf8(name).map_err(error)?;
        if !matches!(
            name.as_str(),
            "manifest.json" | "workspace.json" | "partial.json"
        ) {
            let (prefix, id) = name.split_once('/').ok_or("Unsupported ZIP entry")?;
            if !matches!(prefix, "files" | "originals") {
                return Err("Unsupported ZIP entry".into());
            }
            canonical_archive_id(id)?;
        }
        file.seek(SeekFrom::Start(offset)).map_err(error)?;
        let mut local = [0; 30];
        file.read_exact(&mut local).map_err(error)?;
        if &local[..4] != b"PK\x03\x04"
            || local[6..10] != entry[8..12]
            || u16::from_le_bytes(local[26..28].try_into().unwrap()) as usize != name_len
        {
            return Err("ZIP entry disagrees with its local header".into());
        }
        let mut local_name = vec![0; name_len];
        file.read_exact(&mut local_name).map_err(error)?;
        if local_name != name.as_bytes() || !entries.insert(name) {
            return Err("Duplicate or ambiguous legacy ZIP entry".into());
        }
    }
    if next != end_pos {
        return Err("ZIP directory count does not cover its entries".into());
    }
    Ok((count, start))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct LegacyManifest {
    version: u32,
    #[serde(rename = "createdAt")]
    _created_at: String,
    resources: usize,
    tags: usize,
    #[serde(deserialize_with = "unique_checksums")]
    checksums: HashMap<String, String>,
}

fn unique_checksums<'de, D: serde::Deserializer<'de>>(
    d: D,
) -> Result<HashMap<String, String>, D::Error> {
    struct Inventory;
    impl<'de> Visitor<'de> for Inventory {
        type Value = HashMap<String, String>;

        fn expecting(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
            f.write_str("a checksum inventory with unique entry names")
        }

        fn visit_map<A: MapAccess<'de>>(self, mut map: A) -> Result<Self::Value, A::Error> {
            let mut result = HashMap::new();
            while let Some((key, value)) = map.next_entry()? {
                if result.len() == MAX_ITEMS || result.insert(key, value).is_some() {
                    return Err(A::Error::custom("Duplicate or excessive ZIP checksums"));
                }
            }
            Ok(result)
        }
    }
    d.deserialize_map(Inventory)
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct LegacyWorkspace {
    resources: Vec<LegacyResource>,
    tags: Vec<LegacyTag>,
    settings: LegacySettings,
    organization: Option<LegacyOrganization>,
    reviews: Option<Vec<Value>>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct LegacyResource {
    id: String,
    #[serde(rename = "type")]
    kind: String,
    title: String,
    content: Option<Value>,
    mime_type: Option<String>,
    size: Option<u64>,
    updated_at: Option<String>,
    #[serde(rename = "createdAt")]
    _created_at: Option<String>,
    #[serde(rename = "lastOpenedAt")]
    _last_opened_at: Option<String>,
    tags: Vec<String>,
    binary: Option<String>,
    trashed_at: Option<String>,
    #[serde(rename = "trashOrganization")]
    _trash_organization: Option<String>,
    import_original: Option<LegacyOriginal>,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct LegacyOriginal {
    filename: String,
    #[serde(rename = "mime")]
    _mime: String,
    sha256: String,
    bytes: u64,
    binary: String,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct LegacyTag {
    id: String,
    name: String,
    color: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct LegacySettings {
    max_open_notes: Option<u64>,
    #[serde(alias = "openBehavior")]
    note_opening: Option<String>,
    autosave_delay: Option<u64>,
    focus_mode: Option<bool>,
}

#[derive(Default, Deserialize)]
#[serde(deny_unknown_fields)]
struct LegacyOrganization {
    collections: Vec<LegacyCollection>,
    favorites: Vec<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct LegacyCollection {
    id: String,
    name: String,
    parent_id: Option<String>,
    #[serde(default)]
    favorite: bool,
    resources: Vec<String>,
}

fn json_entry(zip: &mut ZipArchive<File>, name: &str) -> Result<Vec<u8>, String> {
    let mut entry = zip.by_name(name).map_err(error)?;
    let mut result = Vec::new();
    (&mut entry)
        .take(ZIP_JSON + 1)
        .read_to_end(&mut result)
        .map_err(error)?;
    if result.len() as u64 != entry.size() || result.len() as u64 > ZIP_JSON {
        return Err("ZIP JSON exceeds its declared size or 20 MiB limit".into());
    }
    Ok(result)
}

fn checked_json(
    zip: &mut ZipArchive<File>,
    checksums: &HashMap<String, String>,
    name: &str,
) -> Result<Vec<u8>, String> {
    let bytes = json_entry(zip, name)?;
    if checksums.get(name) != Some(&format!("{:x}", Sha256::digest(&bytes))) {
        return Err("Legacy ZIP JSON checksum mismatch".into());
    }
    Ok(bytes)
}

fn legacy(mut file: File) -> Result<(Input, Manifest, String, Option<u32>), String> {
    let (count, start) = directory(&mut file)?;
    let mut zip = ZipArchive::new(file).map_err(error)?;
    if zip.len() != count || zip.central_directory_start() != start {
        return Err("Ambiguous legacy ZIP inventory".into());
    }
    let mut sizes = HashMap::new();
    let mut expanded = 0;
    for index in 0..count {
        let entry = zip.by_index_raw(index).map_err(error)?;
        let name = entry.name();
        let limit = if name.ends_with(".json") {
            ZIP_JSON
        } else {
            MAX_FILE
        };
        if entry.encrypted()
            || !entry.is_file()
            || entry.size() > limit
            || !matches!(
                entry.compression(),
                zip::CompressionMethod::Stored | zip::CompressionMethod::Deflated
            )
        {
            return Err("Encrypted, unsupported or oversized ZIP entry".into());
        }
        expanded += entry.size();
        if expanded > ZIP_EXPANDED {
            return Err("Legacy ZIP expanded data exceeds 2 GiB".into());
        }
        sizes.insert(name.to_owned(), entry.size());
    }
    let raw = json_entry(&mut zip, "manifest.json")?;
    let manifest: LegacyManifest = serde_json::from_slice(&raw).map_err(error)?;
    let version = manifest.version;
    if !(1..=8).contains(&version) {
        return Err("Unsupported legacy archive version. Linked-reference formats 9 and 10 require the original application.".into());
    }
    if manifest.checksums.len() + 1 != sizes.len()
        || manifest.checksums.iter().any(|(name, hash)| {
            name == "manifest.json"
                || !sizes.contains_key(name)
                || hash.len() != 64
                || !hash
                    .bytes()
                    .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
        })
    {
        return Err("Legacy ZIP entries do not match the checksummed inventory".into());
    }
    let partial = matches!(version, 6 | 8);
    if partial {
        let coverage = checked_json(&mut zip, &manifest.checksums, "partial.json")?;
        let coverage: Value = serde_json::from_slice(&coverage).map_err(error)?;
        if coverage["version"] != 1
            || coverage["kind"] != "vaultor-partial"
            || !coverage["omissions"]
                .as_array()
                .is_some_and(|items| items.len() <= MAX_ITEMS)
        {
            return Err("Invalid legacy partial ZIP coverage".into());
        }
    } else if sizes.contains_key("partial.json") {
        return Err("Unexpected partial ZIP coverage".into());
    }
    let workspace = checked_json(&mut zip, &manifest.checksums, "workspace.json")?;
    let workspace: LegacyWorkspace = serde_json::from_slice(&workspace).map_err(error)?;
    let (translated, names) = translate(workspace, &manifest, &sizes, partial)?;
    validate(&translated)?;
    let mut digest = Sha256::new();
    digest.update(b"vaultor-electron-zip\0");
    digest.update(raw);
    Ok((
        Input::Legacy(Box::new(zip), names),
        translated,
        format!("{:x}", digest.finalize()),
        Some(version),
    ))
}

fn translate(
    workspace: LegacyWorkspace,
    manifest: &LegacyManifest,
    sizes: &HashMap<String, u64>,
    partial: bool,
) -> Result<(Manifest, Vec<String>), String> {
    if workspace.resources.len() != manifest.resources
        || workspace.tags.len() != manifest.tags
        || (manifest.version >= 2 && workspace.organization.is_none())
        || (manifest.version >= 4 && workspace.reviews.is_none())
    {
        return Err("Legacy ZIP has missing sections or mismatched counts".into());
    }
    if workspace.reviews.is_some_and(|reviews| !reviews.is_empty()) {
        return Err(
            "Legacy ZIP contains Review evidence that cannot yet be imported safely".into(),
        );
    }
    let mut translated = Manifest {
        format: "vaultor-next-portable".into(),
        version: 4,
        resources: vec![],
        collections: vec![],
        memberships: vec![],
        originals: vec![],
        settings: json!({}),
        partial,
        linked: vec![],
        organization: Default::default(),
        reviews: vec![],
    };
    if !partial {
        let settings = workspace.settings;
        let behavior = [
            ("maxVisiblePanes", json!(settings.max_open_notes)),
            ("noteOpening", json!(settings.note_opening)),
            ("autosaveDelay", json!(settings.autosave_delay)),
            ("focusMode", json!(settings.focus_mode)),
        ]
        .into_iter()
        .filter(|(_, value)| !value.is_null())
        .map(|(key, value)| (key.to_owned(), value))
        .collect::<serde_json::Map<_, _>>();
        if !behavior.is_empty() {
            translated.settings["behavior"] = json!(behavior);
        }
    }
    let organization = workspace.organization.unwrap_or_default();
    let mut pins: HashSet<_> = organization.favorites.iter().collect();
    if pins.len() != organization.favorites.len() {
        return Err("Duplicate resource favorites in legacy ZIP".into());
    }
    for collection in organization.collections {
        if manifest.version < 7 && collection.parent_id.is_some() {
            return Err("Legacy ZIP hierarchy requires version 7 or later".into());
        }
        if collection.favorite {
            translated
                .organization
                .collection_pins
                .push(collection.id.clone());
        }
        translated.memberships.extend(
            collection
                .resources
                .into_iter()
                .map(|id| (id, collection.id.clone())),
        );
        translated.collections.push(Collection {
            id: collection.id,
            name: collection.name,
            parent: collection.parent_id,
        });
    }
    for tag in workspace.tags {
        canonical_archive_id(&tag.id)?;
        translated
            .organization
            .tags
            .push((tag.id, tag.name, tag.color));
    }
    let mut entries = HashSet::new();
    let mut names = Vec::new();
    for resource in workspace.resources {
        let id = resource.id;
        canonical_archive_id(&id)?;
        let content = match resource.kind.as_str() {
            "note" if resource.binary.is_none() && resource.size.is_none() => {
                resource.content.ok_or("Legacy note has no document")?
            }
            "file" if resource.import_original.is_none() && resource.content.is_none() => {
                let binary = format!("files/{id}");
                if resource.binary.as_ref() != Some(&binary) {
                    return Err("Legacy file does not own the expected binary".into());
                }
                let name = file_name(&resource.title, resource.mime_type.as_deref());
                let bytes = resource.size.ok_or("Legacy file has no size")?;
                let hash = manifest
                    .checksums
                    .get(&binary)
                    .ok_or("Missing legacy file checksum")?
                    .clone();
                if sizes.get(&binary) != Some(&bytes) || !entries.insert(binary.clone()) {
                    return Err("Legacy managed original inventory mismatch".into());
                }
                names.push(binary);
                translated.originals.push(Original {
                    id: id.clone(),
                    name,
                    hash,
                    bytes,
                    kind: "file".into(),
                    provenance: "legacy ZIP".into(),
                });
                json!({"type":"doc","content":[]})
            }
            _ => return Err("Unsupported legacy resource metadata or kind".into()),
        };
        if let Some(original) = resource.import_original {
            let binary = format!("originals/{id}");
            if manifest.version < 5
                || original.binary != binary
                || original.bytes > 5 * 1024 * 1024
                || sizes.get(&binary) != Some(&original.bytes)
                || manifest.checksums.get(&binary) != Some(&original.sha256)
                || !entries.insert(binary.clone())
            {
                return Err("Legacy converted-original inventory mismatch".into());
            }
            names.push(binary);
            translated.originals.push(Original {
                id: id.clone(),
                name: original.filename,
                hash: original.sha256,
                bytes: original.bytes,
                kind: "note".into(),
                provenance: "legacy ZIP".into(),
            });
        }
        let pinned = pins.remove(&id);
        let trashed = resource.trashed_at.is_some();
        if pinned || trashed {
            translated
                .organization
                .states
                .push((id.clone(), trashed, pinned, 0));
        }
        translated
            .organization
            .assignments
            .extend(resource.tags.into_iter().map(|tag| (id.clone(), tag)));
        translated.resources.push(Resource {
            id,
            title: resource.title,
            content,
            revision: 1,
            updated: resource
                .updated_at
                .unwrap_or_else(|| "1970-01-01T00:00:00".into()),
        });
    }
    if !pins.is_empty() || entries.len() + 2 + usize::from(partial) != sizes.len() {
        return Err("Unowned archive entries or unknown resource favorites".into());
    }
    Ok((translated, names))
}

// Legacy ZIPs retain the display title and MIME but may have lost the filename on rename.
fn file_name(title: &str, mime: Option<&str>) -> String {
    let extension = match mime {
        Some("application/pdf") => "pdf",
        Some("image/png") => "png",
        Some("image/jpeg") => "jpg",
        Some("image/gif") => "gif",
        Some("image/webp") => "webp",
        Some("text/plain") => "txt",
        Some("text/markdown") => "md",
        Some("text/csv") => "csv",
        _ => "bin",
    };
    if component(title).is_ok() {
        if Path::new(title).extension().is_some() {
            return title.to_owned();
        }
        let name = format!("{title}.{extension}");
        if component(&name).is_ok() {
            return name;
        }
    }
    format!("Original.{extension}")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn legacy_zip_rejects_ambiguous_and_untrusted_inventory() {
        let temp = tempfile::tempdir().unwrap();
        let path = temp.path().join("archive.zip");
        let good = include_bytes!("../../fixtures/electron-workspace-v5.zip");
        let addresses = |bytes: &[u8], signature: &[u8]| {
            bytes
                .windows(signature.len())
                .enumerate()
                .filter_map(|(position, bytes)| (bytes == signature).then_some(position))
                .collect::<Vec<_>>()
        };
        let central = addresses(good, b"PK\x01\x02");
        let local = addresses(good, b"PK\x03\x04");
        assert_eq!(central.len(), 3);
        assert_eq!(local.len(), 3);
        let names = |bytes: &mut [u8], index: usize, name: &[u8]| {
            let length = u16::from_le_bytes(
                bytes[central[index] + 28..central[index] + 30]
                    .try_into()
                    .unwrap(),
            ) as usize;
            assert_eq!(length, name.len());
            bytes[central[index] + 46..central[index] + 46 + length].copy_from_slice(name);
            bytes[local[index] + 30..local[index] + 30 + length].copy_from_slice(name);
        };
        let mut traversal = good.to_vec();
        let file_index = central
            .iter()
            .position(|position| &good[*position + 46..*position + 52] == b"files/")
            .unwrap();
        let original_path = &good[central[file_index] + 46..central[file_index] + 88];
        let mut escaped = original_path.to_vec();
        escaped[..6].copy_from_slice(b"../xx/");
        names(&mut traversal, file_index, &escaped);
        fs::write(&path, traversal).unwrap();
        assert!(open(&path).is_err());

        let mut alias = original_path.to_vec();
        alias[6..].make_ascii_uppercase();
        let mut archive = good.to_vec();
        names(&mut archive, file_index, &alias);
        fs::write(&path, archive).unwrap();
        assert!(open(&path).is_err());

        let mut encrypted = good.to_vec();
        encrypted[central[file_index] + 8] |= 1;
        encrypted[local[file_index] + 6] |= 1;
        fs::write(&path, encrypted).unwrap();
        assert!(open(&path).is_err());

        let end = good.len() - 22;
        let record = &good[central[2]..end];
        let mut duplicated = good[..end].to_vec();
        duplicated.extend_from_slice(record);
        duplicated.extend_from_slice(&good[end..]);
        let new_end = end + record.len();
        duplicated[new_end + 8..new_end + 12].copy_from_slice(&[4, 0, 4, 0]);
        let directory_size = (end - central[0] + record.len()) as u32;
        duplicated[new_end + 12..new_end + 16].copy_from_slice(&directory_size.to_le_bytes());
        fs::write(&path, duplicated).unwrap();
        assert!(open(&path).is_err());

        let mut damaged = good.to_vec();
        let offset = local[file_index]
            + 30
            + original_path.len()
            + u16::from_le_bytes(
                good[local[file_index] + 28..local[file_index] + 30]
                    .try_into()
                    .unwrap(),
            ) as usize;
        damaged[offset] ^= 1;
        fs::write(&path, damaged).unwrap();
        assert!(inspect_archive(&path, None).is_err());
        assert!(serde_json::from_str::<LegacyManifest>(
            r#"{"version":5,"createdAt":"","resources":0,"tags":0,"checksums":{"workspace.json":"a","workspace.json":"b"}}"#,
        ).is_err());
    }
}
