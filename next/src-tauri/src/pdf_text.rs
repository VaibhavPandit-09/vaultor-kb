use std::{
    io::{Read, Seek, Write},
    process::{Command, Stdio},
    sync::Mutex,
    thread,
    time::{Duration, Instant},
};

pub(crate) const MAX_BYTES: u64 = 20 * 1024 * 1024;
const MAX_PAGES: usize = 100;
const MAX_UNITS: usize = 500_000;
const MAX_REPLY: u64 = (MAX_UNITS * 3 + 1) as u64;
const MAX_MEMORY: usize = 256 * 1024 * 1024;
const WORKER_ARGUMENT: &str = "--internal-pdf-text";
const INVALID: (&str, Option<String>) = ("invalid", None);
static EXTRACTION: Mutex<()> = Mutex::new(());

pub(crate) fn extract(
    bytes: &[u8],
    cancelled: impl Fn() -> bool,
) -> (&'static str, Option<String>) {
    let deadline = Instant::now() + Duration::from_secs(10);
    let _slot = loop {
        if cancelled() {
            return ("cancelled", None);
        }
        if let Ok(slot) = EXTRACTION.try_lock() {
            break slot;
        }
        if Instant::now() >= deadline {
            return ("limit", None);
        }
        thread::sleep(Duration::from_millis(20));
    };
    extract_isolated(bytes, deadline, cancelled).unwrap_or(INVALID)
}

fn extract_isolated(
    bytes: &[u8],
    deadline: Instant,
    cancelled: impl Fn() -> bool,
) -> std::io::Result<(&'static str, Option<String>)> {
    // Anonymous files avoid pipe backpressure and pass only verified bytes to the child.
    let mut input = tempfile::tempfile()?;
    input.write_all(bytes)?;
    input.rewind()?;
    let mut output = tempfile::tempfile()?;
    let mut command = Command::new(std::env::current_exe()?);
    command
        .arg(WORKER_ARGUMENT)
        .env_clear()
        .stdin(Stdio::from(input))
        .stdout(Stdio::from(output.try_clone()?))
        .stderr(Stdio::null());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        use windows_sys::Win32::System::Threading::CREATE_NO_WINDOW;
        command.creation_flags(CREATE_NO_WINDOW);
        if let Some(system_root) = std::env::var_os("SystemRoot") {
            command.env("SystemRoot", system_root);
        }
    }
    let mut child = command.spawn()?;
    loop {
        let stopped = if cancelled() {
            Some("cancelled")
        } else if Instant::now() >= deadline {
            Some("limit")
        } else {
            None
        };
        if let Some(state) = stopped {
            let _ = child.kill();
            child.wait()?;
            return Ok((state, None));
        }
        match child.try_wait() {
            Ok(Some(status)) if status.success() => break,
            Ok(Some(_)) => return Ok(INVALID),
            Ok(None) => thread::sleep(Duration::from_millis(20)),
            Err(err) => {
                let _ = child.kill();
                let _ = child.wait();
                return Err(err);
            }
        }
    }
    output.rewind()?;
    let mut reply = Vec::new();
    output.take(MAX_REPLY + 1).read_to_end(&mut reply)?;
    Ok(match reply.as_slice() {
        [b'E'] => ("encrypted", None),
        [b'L'] => ("limit", None),
        [b'N'] => ("empty", None),
        [b'T', body @ ..] if !body.is_empty() && reply.len() as u64 <= MAX_REPLY => {
            match std::str::from_utf8(body) {
                Ok(text) if text.encode_utf16().count() <= MAX_UNITS => {
                    ("indexed", Some(text.to_owned()))
                }
                _ => INVALID,
            }
        }
        _ => INVALID,
    })
}

fn read_pdf(bytes: &[u8]) -> (u8, String) {
    const PAGE_STREAM_BYTES: usize = 8 * 1024 * 1024;
    let options = lopdf::LoadOptions {
        max_decompressed_size: Some(PAGE_STREAM_BYTES),
        ..Default::default()
    };
    let Ok(doc) = lopdf::Document::load_mem_with_options(bytes, options) else {
        return (b'I', String::new());
    };
    if doc.is_encrypted() || doc.was_encrypted() {
        return (b'E', String::new());
    }
    let mut text = String::new();
    let mut units = 0;
    for (index, _) in doc.page_iter().take(MAX_PAGES + 1).enumerate() {
        if index == MAX_PAGES {
            return (b'L', String::new());
        }
        let Ok(page) = doc.extract_text_with_limit(&[(index + 1) as u32], PAGE_STREAM_BYTES) else {
            return (b'I', String::new());
        };
        units += page.encode_utf16().count() + 1;
        if units > MAX_UNITS {
            return (b'L', String::new());
        }
        text.extend(
            page.chars()
                .map(|ch| if ch.is_control() { ' ' } else { ch }),
        );
        text.push(' ');
    }
    if text.trim().is_empty() {
        (b'N', String::new())
    } else {
        (b'T', text)
    }
}

pub fn run_worker_if_requested() {
    let mut args = std::env::args_os().skip(1);
    if args.next().as_deref() != Some(std::ffi::OsStr::new(WORKER_ARGUMENT))
        || args.next().is_some()
    {
        return;
    }
    if !set_limits() {
        std::process::exit(1);
    }
    let result = (|| -> std::io::Result<()> {
        let mut bytes = Vec::new();
        std::io::stdin()
            .take(MAX_BYTES + 1)
            .read_to_end(&mut bytes)?;
        let (status, body) = if bytes.len() as u64 > MAX_BYTES {
            (b'L', String::new())
        } else {
            read_pdf(&bytes)
        };
        let mut output = std::io::stdout().lock();
        output.write_all(&[status])?;
        output.write_all(body.as_bytes())?;
        output.flush()
    })();
    std::process::exit(if result.is_ok() { 0 } else { 1 });
}

#[cfg(windows)]
fn set_limits() -> bool {
    use windows_sys::Win32::{
        Foundation::CloseHandle,
        System::{
            JobObjects::{
                AssignProcessToJobObject, CreateJobObjectW, JobObjectExtendedLimitInformation,
                SetInformationJobObject, JOBOBJECT_EXTENDED_LIMIT_INFORMATION,
                JOB_OBJECT_LIMIT_PROCESS_MEMORY, JOB_OBJECT_LIMIT_PROCESS_TIME,
            },
            Threading::GetCurrentProcess,
        },
    };
    let mut limits = JOBOBJECT_EXTENDED_LIMIT_INFORMATION::default();
    limits.BasicLimitInformation.LimitFlags =
        JOB_OBJECT_LIMIT_PROCESS_MEMORY | JOB_OBJECT_LIMIT_PROCESS_TIME;
    limits.BasicLimitInformation.PerProcessUserTimeLimit = 8 * 10_000_000;
    limits.ProcessMemoryLimit = MAX_MEMORY;
    unsafe {
        let job = CreateJobObjectW(std::ptr::null(), std::ptr::null());
        if job.is_null() {
            return false;
        }
        let limited = SetInformationJobObject(
            job,
            JobObjectExtendedLimitInformation,
            (&limits as *const JOBOBJECT_EXTENDED_LIMIT_INFORMATION).cast(),
            std::mem::size_of_val(&limits) as u32,
        ) != 0
            && AssignProcessToJobObject(job, GetCurrentProcess()) != 0;
        CloseHandle(job);
        limited
    }
}

#[cfg(unix)]
fn set_limits() -> bool {
    unsafe {
        libc::setrlimit(
            libc::RLIMIT_AS,
            &libc::rlimit {
                rlim_cur: MAX_MEMORY as _,
                rlim_max: MAX_MEMORY as _,
            },
        ) == 0
            && libc::setrlimit(
                libc::RLIMIT_CPU,
                &libc::rlimit {
                    rlim_cur: 8,
                    rlim_max: 8,
                },
            ) == 0
    }
}

#[cfg(not(any(windows, unix)))]
fn set_limits() -> bool {
    false
}
