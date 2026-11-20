//! Windows notification area and taskbar projection of the existing Activity queue.
use std::{
    collections::HashSet,
    time::{Duration, Instant},
};
use tauri::{
    window::{ProgressBarState, ProgressBarStatus},
    AppHandle, Emitter, Manager, WebviewWindow,
};
use vaultor_next::activity::Task;
use windows_sys::Win32::{
    Foundation::{HWND, LPARAM, LRESULT, POINT, WPARAM},
    UI::{Shell::*, WindowsAndMessaging::*},
};

const ICON: u32 = 1;
const SUBCLASS: usize = 0x564c54;
const CALLBACK: u32 = WM_APP + 422;
const KEY_SELECT: u32 = NIN_SELECT + 1;

struct Tray {
    app: AppHandle,
    explorer_restart: u32,
}

pub fn install(window: &WebviewWindow) -> bool {
    let Ok(handle) = window.hwnd() else {
        return false;
    };
    let hwnd = handle.0;
    let event = wide("TaskbarCreated");
    let state = Box::new(Tray {
        app: window.app_handle().clone(),
        explorer_restart: unsafe { RegisterWindowMessageW(event.as_ptr()) },
    });
    // Tauri calls setup on the owning window thread. WM_NCDESTROY releases this state.
    unsafe {
        let state = Box::into_raw(state);
        if SetWindowSubclass(hwnd, Some(tray_proc), SUBCLASS, state as usize) == 0 {
            drop(Box::from_raw(state));
            return false;
        }
        register(hwnd)
    }
}

fn wide(text: &str) -> Vec<u16> {
    text.encode_utf16().chain(Some(0)).collect()
}

fn icon(hwnd: HWND) -> NOTIFYICONDATAW {
    NOTIFYICONDATAW {
        cbSize: std::mem::size_of::<NOTIFYICONDATAW>() as u32,
        hWnd: hwnd,
        uID: ICON,
        ..Default::default()
    }
}

unsafe fn register(hwnd: HWND) -> bool {
    let mut data = icon(hwnd);
    data.uFlags = NIF_MESSAGE | NIF_ICON | NIF_TIP | NIF_SHOWTIP;
    data.uCallbackMessage = CALLBACK;
    data.hIcon = GetClassLongPtrW(hwnd, GCLP_HICONSM) as _;
    if data.hIcon.is_null() {
        data.hIcon = GetClassLongPtrW(hwnd, GCLP_HICON) as _;
    }
    if data.hIcon.is_null() {
        data.hIcon = LoadIconW(std::ptr::null_mut(), IDI_APPLICATION);
    }
    let label = wide("Vaultor Next");
    data.szTip[..label.len()].copy_from_slice(&label);
    if Shell_NotifyIconW(NIM_ADD, &data) == 0 {
        return false;
    }
    data.Anonymous.uVersion = NOTIFYICON_VERSION_4;
    Shell_NotifyIconW(NIM_SETVERSION, &data);
    true
}

unsafe extern "system" fn tray_proc(
    hwnd: HWND,
    message: u32,
    wparam: WPARAM,
    lparam: LPARAM,
    _: usize,
    state: usize,
) -> LRESULT {
    if message == WM_NCDESTROY {
        RemoveWindowSubclass(hwnd, Some(tray_proc), SUBCLASS);
        Shell_NotifyIconW(NIM_DELETE, &icon(hwnd));
        drop(Box::from_raw(state as *mut Tray));
    } else {
        let state = &*(state as *const Tray);
        if message == CALLBACK {
            let app = state.app.clone();
            match (lparam as u32) & 0xFFFF {
                NIN_SELECT | KEY_SELECT | WM_LBUTTONUP => show(&app, false),
                NIN_BALLOONUSERCLICK => show(&app, true),
                WM_CONTEXTMENU | WM_RBUTTONUP => tray_menu(hwnd, &app),
                _ => {}
            }
            return 0;
        }
        if message != 0 && message == state.explorer_restart {
            register(hwnd);
        }
    }
    DefSubclassProc(hwnd, message, wparam, lparam)
}

fn show(app: &AppHandle, activity: bool) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
        if activity {
            let _ = window.emit("next-activity-open", ());
        }
    }
}

unsafe fn tray_menu(hwnd: HWND, app: &AppHandle) {
    let menu = CreatePopupMenu();
    if menu.is_null() {
        return;
    }
    AppendMenuW(menu, MF_STRING, 1, wide("Show Vaultor Next").as_ptr());
    AppendMenuW(menu, MF_STRING, 2, wide("Activity").as_ptr());
    AppendMenuW(menu, MF_SEPARATOR, 0, std::ptr::null());
    AppendMenuW(menu, MF_STRING, 3, wide("Quit Vaultor Next").as_ptr());
    let mut cursor = POINT::default();
    GetCursorPos(&mut cursor);
    SetForegroundWindow(hwnd);
    let clicked = TrackPopupMenu(
        menu,
        TPM_RETURNCMD | TPM_RIGHTBUTTON,
        cursor.x,
        cursor.y,
        0,
        hwnd,
        std::ptr::null(),
    );
    DestroyMenu(menu);
    PostMessageW(hwnd, WM_NULL, 0, 0);
    match clicked {
        1 => show(app, false),
        2 => show(app, true),
        3 => {
            show(app, false);
            let _ = app.emit("next-quit-requested", ());
        }
        _ => {}
    }
}

fn notify(window: &WebviewWindow, title: &str, body: &str) {
    let Ok(handle) = window.hwnd() else {
        return;
    };
    let mut data = icon(handle.0);
    data.uFlags = NIF_INFO | NIF_REALTIME;
    data.dwInfoFlags = NIIF_INFO | NIIF_NOSOUND | NIIF_RESPECT_QUIET_TIME;
    for (word, unit) in data
        .szInfoTitle
        .iter_mut()
        .take(63)
        .zip(title.encode_utf16())
    {
        *word = unit;
    }
    for (word, unit) in data.szInfo.iter_mut().take(255).zip(body.encode_utf16()) {
        *word = unit;
    }
    unsafe {
        Shell_NotifyIconW(NIM_MODIFY, &data);
    }
}

pub fn close_to_tray(window: &WebviewWindow) -> Result<(), String> {
    use std::sync::atomic::{AtomicBool, Ordering};
    static EXPLAINED: AtomicBool = AtomicBool::new(false);
    window.hide().map_err(|error| error.to_string())?;
    if !EXPLAINED.swap(true, Ordering::SeqCst) {
        notify(
            window,
            "Vaultor Next is still running",
            "Use the tray icon to reopen Vaultor Next. Quit closes the workspace.",
        );
    }
    Ok(())
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum Progress {
    Hidden,
    Unknown,
    Measured(u64),
    Error,
}

fn progress(tasks: &[Task], failed: bool) -> Progress {
    let running = tasks
        .iter()
        .filter(|task| task.state == "running")
        .collect::<Vec<_>>();
    let Some(first) = running.first() else {
        return if tasks.iter().any(|task| task.state == "queued") {
            Progress::Unknown
        } else if failed {
            Progress::Error
        } else {
            Progress::Hidden
        };
    };
    let bytes = running.iter().all(|task| {
        task.total_bytes
            .is_some_and(|total| total > 0 && task.bytes <= total)
    });
    if !bytes
        && running.iter().any(|task| {
            task.kind != first.kind
                || !task
                    .total
                    .is_some_and(|total| total > 0 && task.done <= total)
        })
    {
        return Progress::Unknown;
    }
    let (done, total) = running.iter().fold((0u128, 0u128), |(done, total), task| {
        let (next, max) = if bytes {
            (task.bytes, task.total_bytes.unwrap())
        } else {
            (task.done, task.total.unwrap())
        };
        (done + u128::from(next), total + u128::from(max))
    });
    Progress::Measured((done * 100 / total) as u64)
}

#[derive(Default)]
pub struct ActivityProjection {
    running: HashSet<String>,
    last: Option<Progress>,
    last_notice: Option<Instant>,
}

impl ActivityProjection {
    pub fn update(&mut self, window: &WebviewWindow, tasks: &[Task]) {
        let completed = tasks.iter().find(|task| {
            self.running.contains(&task.id)
                && (task.state == "failed"
                    || task.state == "completed"
                        && task
                            .finished
                            .zip(task.started)
                            .is_some_and(|(end, start)| end.saturating_sub(start) >= 30_000))
        });
        let state = progress(tasks, completed.is_some_and(|task| task.state == "failed"));
        if self.last != Some(state) {
            self.last = Some(state);
            let (status, progress) = match state {
                Progress::Hidden => (ProgressBarStatus::None, None),
                Progress::Unknown => (ProgressBarStatus::Indeterminate, None),
                Progress::Measured(value) => (ProgressBarStatus::Normal, Some(value)),
                Progress::Error => (ProgressBarStatus::Error, Some(100)),
            };
            let _ = window.set_progress_bar(ProgressBarState {
                status: Some(status),
                progress,
            });
        }
        if let Some(task) = completed {
            let background = matches!(window.is_focused(), Ok(false))
                || matches!(window.is_visible(), Ok(false))
                || matches!(window.is_minimized(), Ok(true));
            if background
                && self
                    .last_notice
                    .is_none_or(|time| time.elapsed() >= Duration::from_secs(30))
            {
                self.last_notice = Some(Instant::now());
                let title = if task.state == "failed" {
                    "Vaultor Next needs attention"
                } else {
                    "Vaultor Next task complete"
                };
                notify(window, title, &task.title);
            }
        }
        self.running = tasks
            .iter()
            .filter(|task| task.state == "running")
            .map(|task| task.id.clone())
            .collect();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn task(kind: &str, state: &str, done: u64, total: Option<u64>) -> Task {
        Task {
            id: kind.into(),
            kind: kind.into(),
            title: kind.into(),
            workspace: "fixture".into(),
            state: state.into(),
            phase: String::new(),
            done,
            total,
            bytes: 0,
            total_bytes: None,
            started: None,
            finished: None,
            result: None,
            error: None,
            cancellable: true,
        }
    }

    #[test]
    fn activity_progress_aggregates_comparable_units_and_preserves_unknown_work() {
        let import = task("file-import","running",1,Some(4));
        let other = task("file-import","running",4,Some(6));
        assert_eq!(progress(&[import.clone(),other],false),Progress::Measured(50));
        assert_eq!(progress(&[import.clone(),task("linked-index","running",2,Some(5))],false),Progress::Unknown);
        assert_eq!(progress(&[task("queued","queued",0,None)],false),Progress::Unknown);
        assert_eq!(progress(&[task("done","completed",9,Some(9))],false),Progress::Hidden);
        assert_eq!(progress(&[],true),Progress::Error);
    }
}
