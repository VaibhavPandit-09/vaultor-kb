//! Windows local NTFS leases and no-overwrite, handle-relative detached publication.
use sha2::{Digest, Sha256};
use std::{
    ffi::c_void,
    fs::{File, OpenOptions},
    io::{Read, Seek, SeekFrom, Write},
    os::windows::{ffi::OsStrExt, fs::OpenOptionsExt, io::AsRawHandle},
    path::{Component, Path, PathBuf},
    ptr,
};
use windows_sys::Win32::{Foundation::*, Security::*, Storage::FileSystem::*};
pub const MAX_BYTES: u64 = 1024 * 1024;

pub fn open_web(url: &str) -> Result<(), String> {
    let verb: Vec<u16> = "open".encode_utf16().chain(Some(0)).collect();
    let target: Vec<u16> = url.encode_utf16().chain(Some(0)).collect();
    let result = unsafe { windows_sys::Win32::UI::Shell::ShellExecuteW(
        ptr::null_mut(), verb.as_ptr(), target.as_ptr(), ptr::null(), ptr::null(), 1
    ) } as isize;
    if result <= 32 { return Err("System browser dispatch failed".into()); }
    Ok(())
}
fn err() -> String {
    std::io::Error::last_os_error().to_string()
}
fn handle(f: &File) -> HANDLE {
    f.as_raw_handle() as HANDLE
}
fn check(ok: i32) -> Result<(), String> {
    if ok == 0 {
        Err(err())
    } else {
        Ok(())
    }
}
pub fn hash(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}
pub fn info(f: &File) -> Result<BY_HANDLE_FILE_INFORMATION, String> {
    let mut i = BY_HANDLE_FILE_INFORMATION::default();
    unsafe { check(GetFileInformationByHandle(handle(f), &mut i))? }
    Ok(i)
}
pub fn identity(f: &File) -> Result<String, String> {
    let i = info(f)?;
    Ok(format!(
        "{:08x}:{:08x}{:08x}",
        i.dwVolumeSerialNumber, i.nFileIndexHigh, i.nFileIndexLow
    ))
}
pub fn physical(f: &File) -> Result<PathBuf, String> {
    let mut buf = vec![0u16; 32768];
    let n = unsafe {
        GetFinalPathNameByHandleW(
            handle(f),
            buf.as_mut_ptr(),
            buf.len() as u32,
            VOLUME_NAME_GUID,
        )
    };
    if n == 0 || n as usize >= buf.len() {
        return Err(err());
    }
    Ok(PathBuf::from(
        String::from_utf16(&buf[..n as usize]).map_err(|_| "Non-Unicode path")?,
    ))
}
fn ordinary_dir(f: &File) -> Result<(), String> {
    let i = info(f)?;
    if i.dwFileAttributes & FILE_ATTRIBUTE_DIRECTORY == 0
        || i.dwFileAttributes
            & (FILE_ATTRIBUTE_REPARSE_POINT
                | FILE_ATTRIBUTE_OFFLINE
                | FILE_ATTRIBUTE_RECALL_ON_DATA_ACCESS
                | FILE_ATTRIBUTE_RECALL_ON_OPEN)
            != 0
    {
        return Err("Reparse, cloud or unavailable directories are not supported".into());
    }
    Ok(())
}
/// Pin every ancestor against rename/deletion, inspecting each final component without following it.
pub fn pin(path: &Path) -> Result<Vec<File>, String> {
    if !path.is_absolute() {
        return Err("Choose an absolute local folder".into());
    }
    let mut current = PathBuf::new();
    let mut pins = vec![];
    for c in path.components() {
        match c {
            Component::Prefix(_) => {
                current.push(c.as_os_str());
                continue;
            }
            Component::RootDir => current.push(c.as_os_str()),
            Component::Normal(_) => current.push(c.as_os_str()),
            _ => return Err("Unsafe directory path".into()),
        }
        if current.as_os_str().is_empty() {
            continue;
        }
        let f = OpenOptions::new()
            .access_mode(FILE_READ_ATTRIBUTES | FILE_LIST_DIRECTORY)
            .share_mode(FILE_SHARE_READ | FILE_SHARE_WRITE)
            .custom_flags(FILE_FLAG_BACKUP_SEMANTICS | FILE_FLAG_OPEN_REPARSE_POINT)
            .open(&current)
            .map_err(|e| format!("Cannot pin directory {}: {e}", current.display()))?;
        ordinary_dir(&f)?;
        current = physical(&f)?;
        pins.push(f);
    }
    let last = pins.last().ok_or("Missing directory")?;
    let mut name = [0u16; 32];
    unsafe {
        check(GetVolumeInformationByHandleW(
            handle(last),
            ptr::null_mut(),
            0,
            ptr::null_mut(),
            ptr::null_mut(),
            ptr::null_mut(),
            name.as_mut_ptr(),
            32,
        ))?;
    }
    let len = name.iter().position(|c| *c == 0).unwrap_or(32);
    if String::from_utf16_lossy(&name[..len]) != "NTFS" {
        return Err("Linked sources currently require local NTFS".into());
    }
    let p = physical(last)?;
    let mut volume = PathBuf::new();
    for c in p.components() {
        volume.push(c.as_os_str());
        if volume.has_root() {
            break;
        }
    }
    let volume = format!("{}\\", volume.to_string_lossy().trim_end_matches('\\'));
    let wide: Vec<u16> = volume.encode_utf16().chain(Some(0)).collect();
    if unsafe { GetDriveTypeW(wide.as_ptr()) } != 3
    /* DRIVE_FIXED */
    {
        return Err("Network/removable/virtual volumes are not qualified".into());
    }
    Ok(pins)
}
pub fn relative(value: &str) -> Result<PathBuf, String> {
    if value.contains(['\0', ':']) || value.starts_with(['\\', '/']) {
        return Err("Unsafe relative path".into());
    }
    let p = PathBuf::from(value.replace('/', "\\"));
    if p.components().any(|c| !matches!(c, Component::Normal(_))) {
        return Err("Source-root escape refused".into());
    }
    Ok(p)
}
pub struct ReadFile {
    pub file: File,
    pub pins: Vec<File>,
    pub path: PathBuf,
    pub bytes: Vec<u8>,
    pub id: String,
    pub revision: String,
    pub reason: Option<String>,
}
pub fn read(
    root: &Path,
    root_id: &str,
    relative_path: &str,
    write_lease: bool,
) -> Result<ReadFile, String> {
    let root_pins = pin(root)?;
    if identity(root_pins.last().unwrap())? != root_id {
        return Err("Linked folder identity changed; choose the folder again".into());
    }
    let rel = relative(relative_path)?;
    if rel.as_os_str().is_empty() {
        return Err("Choose a Markdown file".into());
    }
    let parent = root.join(rel.parent().unwrap());
    let mut pins = root_pins;
    pins.extend(pin(&parent)?);
    let parent = physical(pins.last().unwrap())?;
    let path = parent.join(rel.file_name().unwrap());
    let mut options = OpenOptions::new();
    options
        .access_mode(FILE_GENERIC_READ | READ_CONTROL | if write_lease { DELETE } else { 0 })
        .share_mode(FILE_SHARE_READ)
        .custom_flags(FILE_FLAG_OPEN_REPARSE_POINT);
    let mut file = options
        .open(&path)
        .map_err(|e| format!("Source unavailable or busy: {e}"))?;
    let i = info(&file)?;
    if i.dwFileAttributes
        & (FILE_ATTRIBUTE_DIRECTORY
            | FILE_ATTRIBUTE_REPARSE_POINT
            | FILE_ATTRIBUTE_OFFLINE
            | FILE_ATTRIBUTE_RECALL_ON_DATA_ACCESS
            | FILE_ATTRIBUTE_RECALL_ON_OPEN)
        != 0
    {
        return Err("Special, reparse or cloud file refused".into());
    }
    let size = ((i.nFileSizeHigh as u64) << 32) | i.nFileSizeLow as u64;
    if size > MAX_BYTES {
        return Err("Linked reading is limited to 1 MiB".into());
    }
    let mut bytes = vec![];
    std::io::Read::by_ref(&mut file)
        .take(MAX_BYTES + 1)
        .read_to_end(&mut bytes)
        .map_err(|e| e.to_string())?;
    if bytes.len() as u64 > MAX_BYTES {
        return Err("Source grew beyond the reading limit".into());
    }
    std::str::from_utf8(&bytes)
        .map_err(|_| "Only UTF-8 Markdown is supported; source untouched")?;
    let id = identity(&file)?;
    let revision = hash(&bytes);
    let reason = write_policy(&file, &path).err();
    if write_lease {
        if let Some(reason) = &reason {
            return Err(reason.clone());
        }
    }
    Ok(ReadFile {
        file,
        pins,
        path,
        bytes,
        id,
        revision,
        reason,
    })
}
#[repr(C)]
struct IoStatus {
    status: usize,
    information: usize,
}
#[link(name = "ntdll")]
unsafe extern "system" {
    fn NtSetInformationFile(
        file: HANDLE,
        status: *mut IoStatus,
        information: *const c_void,
        length: u32,
        class: u32,
    ) -> i32;
    fn NtQueryInformationFile(
        file: HANDLE,
        status: *mut IoStatus,
        information: *mut c_void,
        length: u32,
        class: u32,
    ) -> i32;
}
fn security(file: &File, flags: u32) -> Result<Vec<u8>, String> {
    let mut length = 0;
    unsafe {
        GetKernelObjectSecurity(handle(file), flags, ptr::null_mut(), 0, &mut length);
    }
    if length == 0 {
        return Err("Cannot inspect file security".into());
    }
    let mut sd = vec![0u8; length as usize];
    unsafe {
        check(GetKernelObjectSecurity(
            handle(file),
            flags,
            sd.as_mut_ptr().cast(),
            length,
            &mut length,
        ))?
    }
    Ok(sd)
}
fn write_policy(file: &File, path: &Path) -> Result<(), String> {
    let i = info(file)?;
    let forbidden = FILE_ATTRIBUTE_READONLY
        | FILE_ATTRIBUTE_SYSTEM
        | FILE_ATTRIBUTE_COMPRESSED
        | FILE_ATTRIBUTE_ENCRYPTED
        | FILE_ATTRIBUTE_SPARSE_FILE
        | FILE_ATTRIBUTE_REPARSE_POINT
        | FILE_ATTRIBUTE_OFFLINE
        | FILE_ATTRIBUTE_RECALL_ON_DATA_ACCESS
        | FILE_ATTRIBUTE_RECALL_ON_OPEN
        | FILE_ATTRIBUTE_PINNED
        | FILE_ATTRIBUTE_UNPINNED;
    if i.dwFileAttributes & forbidden != 0 || i.nNumberOfLinks != 1 {
        return Err("Special/read-only/cloud files and multiple hardlinks are read-only".into());
    }
    let mut ea = 0u32;
    let mut status = IoStatus {
        status: 0,
        information: 0,
    };
    let code = unsafe {
        NtQueryInformationFile(
            handle(file),
            &mut status,
            (&mut ea as *mut u32).cast(),
            4,
            7,
        )
    };
    if code < 0 || ea != 0 {
        return Err("Extended file attributes cannot be preserved; read-only".into());
    }
    let mut streams = WIN32_FIND_STREAM_DATA::default();
    let wide: Vec<_> = path.as_os_str().encode_wide().chain(Some(0)).collect();
    let stream = unsafe {
        FindFirstStreamW(
            wide.as_ptr(),
            FindStreamInfoStandard,
            (&mut streams as *mut WIN32_FIND_STREAM_DATA).cast(),
            0,
        )
    };
    if stream == INVALID_HANDLE_VALUE {
        return Err("Cannot inspect alternate streams".into());
    }
    let mut special = false;
    loop {
        let n = streams
            .cStreamName
            .iter()
            .position(|c| *c == 0)
            .unwrap_or(streams.cStreamName.len());
        if String::from_utf16_lossy(&streams.cStreamName[..n]) != "::$DATA" {
            special = true;
        }
        if unsafe { FindNextStreamW(stream, (&mut streams as *mut WIN32_FIND_STREAM_DATA).cast()) }
            == 0
        {
            break;
        }
    }
    unsafe {
        FindClose(stream);
    }
    if special {
        return Err("Alternate streams are read-only".into());
    }
    let sd = security(file, LABEL_SECURITY_INFORMATION)?;
    let mut present = 0;
    let mut defaulted = 0;
    let mut sacl = ptr::null_mut();
    unsafe {
        check(GetSecurityDescriptorSacl(
            sd.as_ptr().cast_mut().cast(),
            &mut present,
            &mut sacl,
            &mut defaulted,
        ))?;
    }
    if present != 0 && !sacl.is_null() && unsafe { (*sacl).AceCount } > 0 {
        return Err("Explicit integrity labels are read-only".into());
    }
    Ok(())
}
pub fn rename(file: &File, parent: &File, name: &str) -> Result<(), String> {
    if name.is_empty() || name.contains(['\\', '/', ':', '\0']) {
        return Err("Unsafe publication name".into());
    }
    let wide: Vec<u16> = name.encode_utf16().chain(Some(0)).collect();
    let length = std::mem::offset_of!(FILE_RENAME_INFO, FileName) + wide.len() * 2;
    let mut buffer = vec![0u64; length.div_ceil(8)];
    let p = buffer.as_mut_ptr().cast::<FILE_RENAME_INFO>();
    unsafe {
        (*p).Anonymous.ReplaceIfExists = false;
        (*p).RootDirectory = handle(parent);
        (*p).FileNameLength = ((wide.len() - 1) * 2) as u32;
        ptr::copy_nonoverlapping(wide.as_ptr(), (*p).FileName.as_mut_ptr(), wide.len());
    }
    let mut status = IoStatus {
        status: 0,
        information: 0,
    };
    let code =
        unsafe { NtSetInformationFile(handle(file), &mut status, p.cast(), length as u32, 10) };
    if code < 0 {
        Err(format!("No-overwrite rename refused (NTSTATUS {code:#x})"))
    } else {
        Ok(())
    }
}
pub fn stage(original: &ReadFile, name: &str, bytes: &[u8]) -> Result<File, String> {
    let path = physical(original.pins.last().unwrap())?.join(name);
    let mut f = OpenOptions::new()
        .read(true)
        .write(true)
        .access_mode(FILE_GENERIC_READ | FILE_GENERIC_WRITE | DELETE | READ_CONTROL | WRITE_DAC)
        .share_mode(FILE_SHARE_READ)
        .create_new(true)
        .custom_flags(FILE_FLAG_OPEN_REPARSE_POINT)
        .open(&path)
        .map_err(|e| e.to_string())?;
    let flags = OWNER_SECURITY_INFORMATION | GROUP_SECURITY_INFORMATION | DACL_SECURITY_INFORMATION;
    let sd = security(&original.file, flags)?;
    let ours = security(&f, flags)?;
    for getter in [GetSecurityDescriptorOwner, GetSecurityDescriptorGroup] {
        let (mut a, mut b) = (ptr::null_mut(), ptr::null_mut());
        let (mut da, mut db) = (0, 0);
        unsafe {
            check(getter(sd.as_ptr().cast_mut().cast(), &mut a, &mut da))?;
            check(getter(ours.as_ptr().cast_mut().cast(), &mut b, &mut db))?;
            if EqualSid(a, b) == 0 {
                return Err("Source owner/group is not reproducible without elevation".into());
            }
        }
    }
    let mut control = 0;
    let mut rev = 0;
    unsafe {
        check(GetSecurityDescriptorControl(
            sd.as_ptr().cast_mut().cast(),
            &mut control,
            &mut rev,
        ))?;
        check(SetKernelObjectSecurity(
            handle(&f),
            DACL_SECURITY_INFORMATION
                | if control & SE_DACL_PROTECTED != 0 {
                    PROTECTED_DACL_SECURITY_INFORMATION
                } else {
                    UNPROTECTED_DACL_SECURITY_INFORMATION
                },
            sd.as_ptr().cast_mut().cast(),
        ))?;
    }
    let after = security(&f, flags)?;
    let mut a = ptr::null_mut();
    let mut b = ptr::null_mut();
    let (mut present, mut defaulted) = (0, 0);
    unsafe {
        check(GetSecurityDescriptorDacl(
            sd.as_ptr().cast_mut().cast(),
            &mut present,
            &mut a,
            &mut defaulted,
        ))?;
        check(GetSecurityDescriptorDacl(
            after.as_ptr().cast_mut().cast(),
            &mut present,
            &mut b,
            &mut defaulted,
        ))?;
        if a.is_null() != b.is_null() {
            return Err("DACL preservation failed".into());
        }
        if !a.is_null() {
            let old = std::slice::from_raw_parts(a.cast::<u8>(), (*a).AclSize as usize);
            let new = std::slice::from_raw_parts(b.cast::<u8>(), (*b).AclSize as usize);
            if old != new {
                return Err("DACL preservation failed".into());
            }
        }
    }
    let i = info(&original.file)?;
    unsafe {
        check(SetFileTime(
            handle(&f),
            &i.ftCreationTime,
            ptr::null(),
            ptr::null(),
        ))?;
    }
    f.write_all(bytes).map_err(|e| e.to_string())?;
    f.sync_all().map_err(|e| e.to_string())?;
    f.seek(SeekFrom::Start(0)).map_err(|e| e.to_string())?;
    let mut checked = vec![];
    f.read_to_end(&mut checked).map_err(|e| e.to_string())?;
    if checked != bytes {
        return Err("Staged verification failed".into());
    }
    let mut basic = FILE_BASIC_INFO::default();
    basic.FileAttributes = i.dwFileAttributes;
    if basic.FileAttributes == 0 {
        basic.FileAttributes = FILE_ATTRIBUTE_NORMAL
    }
    unsafe {
        check(SetFileInformationByHandle(
            handle(&f),
            FileBasicInfo,
            (&basic as *const FILE_BASIC_INFO).cast(),
            std::mem::size_of::<FILE_BASIC_INFO>() as u32,
        ))?;
    }
    if info(&f)?.ftCreationTime.dwLowDateTime != i.ftCreationTime.dwLowDateTime
        || info(&f)?.ftCreationTime.dwHighDateTime != i.ftCreationTime.dwHighDateTime
    {
        return Err("Creation time preservation failed".into());
    }
    Ok(f)
}
pub fn discard_file(file: &File) -> Result<(), String> {
    let info = FILE_DISPOSITION_INFO { DeleteFile: true };
    unsafe {
        check(SetFileInformationByHandle(
            handle(file),
            FileDispositionInfo,
            (&info as *const FILE_DISPOSITION_INFO).cast(),
            std::mem::size_of::<FILE_DISPOSITION_INFO>() as u32,
        ))
    }
}

pub fn verify_published(file: &File, path: &Path, expected_hash: &str) -> Result<(), String> {
    let observed = OpenOptions::new()
        .access_mode(FILE_READ_ATTRIBUTES)
        .share_mode(FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE)
        .custom_flags(FILE_FLAG_OPEN_REPARSE_POINT)
        .open(path)
        .map_err(|e| e.to_string())?;
    if identity(&observed)? != identity(file)? {
        return Err("Published path identity differs".into());
    }
    let mut copy = file.try_clone().map_err(|e| e.to_string())?;
    copy.seek(SeekFrom::Start(0)).map_err(|e| e.to_string())?;
    let mut bytes = vec![];
    copy.take(MAX_BYTES + 1)
        .read_to_end(&mut bytes)
        .map_err(|e| e.to_string())?;
    if hash(&bytes) != expected_hash {
        return Err("Published bytes differ".into());
    }
    Ok(())
}
pub fn verify_metadata(original: &File, staged: &File) -> Result<(), String> {
    let a = info(original)?;
    let b = info(staged)?;
    if a.ftCreationTime.dwLowDateTime != b.ftCreationTime.dwLowDateTime
        || a.ftCreationTime.dwHighDateTime != b.ftCreationTime.dwHighDateTime
        || a.dwFileAttributes != b.dwFileAttributes
    {
        return Err("Source metadata changed or could not be preserved".into());
    }
    let flags = OWNER_SECURITY_INFORMATION | GROUP_SECURITY_INFORMATION | DACL_SECURITY_INFORMATION;
    let original = security(original, flags)?;
    let staged = security(staged, flags)?;
    for getter in [GetSecurityDescriptorOwner, GetSecurityDescriptorGroup] {
        let (mut a, mut b) = (ptr::null_mut(), ptr::null_mut());
        let (mut da, mut db) = (0, 0);
        unsafe {
            check(getter(original.as_ptr().cast_mut().cast(), &mut a, &mut da))?;
            check(getter(staged.as_ptr().cast_mut().cast(), &mut b, &mut db))?;
            if EqualSid(a, b) == 0 {
                return Err("Source owner/group changed".into());
            }
        }
    }
    let (mut a, mut b) = (ptr::null_mut(), ptr::null_mut());
    let (mut present, mut defaulted) = (0, 0);
    let (mut ac, mut bc, mut revision) = (0, 0, 0);
    unsafe {
        check(GetSecurityDescriptorControl(
            original.as_ptr().cast_mut().cast(),
            &mut ac,
            &mut revision,
        ))?;
        check(GetSecurityDescriptorControl(
            staged.as_ptr().cast_mut().cast(),
            &mut bc,
            &mut revision,
        ))?;
        if ac & SE_DACL_PROTECTED != bc & SE_DACL_PROTECTED {
            return Err("DACL inheritance state differs".into());
        }
        check(GetSecurityDescriptorDacl(
            original.as_ptr().cast_mut().cast(),
            &mut present,
            &mut a,
            &mut defaulted,
        ))?;
        check(GetSecurityDescriptorDacl(
            staged.as_ptr().cast_mut().cast(),
            &mut present,
            &mut b,
            &mut defaulted,
        ))?;
        if a.is_null() != b.is_null() {
            return Err("DACL differs".into());
        }
        if !a.is_null()
            && std::slice::from_raw_parts(a.cast::<u8>(), (*a).AclSize as usize)
                != std::slice::from_raw_parts(b.cast::<u8>(), (*b).AclSize as usize)
        {
            return Err("Source DACL changed".into());
        }
    }
    Ok(())
}
