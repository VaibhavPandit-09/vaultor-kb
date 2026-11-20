//! WebView2 admits a dedicated drag grip. Windows owns the actual drag loop.
use std::{
    os::windows::ffi::OsStrExt,
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicUsize, Ordering},
        Arc, Mutex,
    },
};
use vaultor_next::{
    native_exports::{self, PreparedDrag},
    worker::Worker,
};
use windows::{
    core::PCWSTR,
    Win32::{
        Foundation::HWND,
        System::{
            Com::{CoTaskMemFree, IBindCtx, IDataObject},
            Ole::{IDropSource, OleInitialize, OleUninitialize, DROPEFFECT_COPY},
        },
        UI::{
            Input::KeyboardAndMouse::{GetAsyncKeyState, VK_LBUTTON},
            Shell::{
                Common::ITEMIDLIST, ILFindLastID, SHCreateDataObject, SHDoDragDrop,
                SHParseDisplayName,
            },
        },
    },
};

#[derive(Clone)]
pub struct NativeDrag {
    cache: PathBuf,
    ready: Arc<Mutex<Option<PreparedDrag>>>,
}

impl NativeDrag {
    pub fn new(cache: PathBuf) -> Self {
        if cache.exists() {
            let path = cache.clone();
            tauri::async_runtime::spawn_blocking(move || {
                let _ = native_exports::cleanup(&path);
            });
        }
        Self {
            cache,
            ready: Arc::new(Mutex::new(None)),
        }
    }
}

#[tauri::command]
pub async fn prepare_drag(
    path: String,
    ids: Vec<String>,
    worker: tauri::State<'_, Worker>,
    state: tauri::State<'_, NativeDrag>,
) -> Result<serde_json::Value, String> {
    let state = state.inner().clone();
    let storage = worker.storage();
    tauri::async_runtime::spawn_blocking(move || {
        let mut slot = state.ready.lock().map_err(|e| e.to_string())?;
        slot.take();
        let originals = storage.call(&path, move |w| {
            serde_json::to_value(w.native_originals(&ids)?).map_err(|e| e.to_string())
        })?;
        let copies = PreparedDrag::prepare(
            &state.cache,
            path,
            serde_json::from_value(originals).map_err(|e| e.to_string())?,
        )?;
        let reply = serde_json::json!({"receipt":copies.receipt,"names":copies.names()});
        *slot = Some(copies);
        Ok(reply)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn release_drag(
    receipt: String,
    state: tauri::State<'_, NativeDrag>,
) -> Result<(), String> {
    let state = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let mut slot = state.ready.lock().map_err(|e| e.to_string())?;
        if slot.as_ref().is_some_and(|copy| copy.receipt == receipt) {
            slot.take();
        }
        Ok(())
    })
    .await
    .map_err(|e| e.to_string())?
}

struct WorkspaceGate(Arc<AtomicUsize>);
impl WorkspaceGate {
    fn acquire(active: Arc<AtomicUsize>) -> Self {
        active.fetch_add(1, Ordering::SeqCst);
        Self(active)
    }
}
impl Drop for WorkspaceGate {
    fn drop(&mut self) {
        self.0.fetch_sub(1, Ordering::SeqCst);
    }
}

#[tauri::command]
pub async fn start_drag(
    receipt: String,
    window: tauri::WebviewWindow,
    worker: tauri::State<'_, Worker>,
    state: tauri::State<'_, NativeDrag>,
) -> Result<bool, String> {
    let storage = worker.storage();
    let state = state.inner().clone();
    let hwnd = window.hwnd().map_err(|e| e.to_string())?.0 as isize;
    let (send, receive) = tokio::sync::oneshot::channel();
    let (gate, mut copy) = tauri::async_runtime::spawn_blocking(move || {
        let mut slot = state.ready.lock().map_err(|e| e.to_string())?;
        if slot.as_ref().is_none_or(|copy| copy.receipt != receipt) {
            return Err("Prepare the copies again".to_string());
        }
        let copy = slot.take().expect("checked current prepared copies");
        drop(slot);
        let gate = WorkspaceGate::acquire(storage.active.clone());
        let path = copy.workspace.clone();
        let (give, take) = std::sync::mpsc::sync_channel(1);
        storage.call(&path, move |workspace| {
            copy.verify(workspace)?;
            give.send(copy).map_err(|e| e.to_string())?;
            Ok(serde_json::Value::Null)
        })?;
        Ok((gate, take.recv().map_err(|e| e.to_string())?))
    })
    .await
    .map_err(|e| e.to_string())??;
    window
        .run_on_main_thread(move || {
            let _gate = gate;
            let result = shell_drag(hwnd, copy.paths());
            // Shell consumers may hold file reads after the visible drag ends.
            if result == Ok(true) {
                copy.handed_to_shell();
            }
            let _ = send.send(result);
        })
        .map_err(|e| e.to_string())?;
    receive.await.map_err(|e| e.to_string())?
}

struct Ole;
impl Drop for Ole {
    fn drop(&mut self) {
        // This guard is created and destroyed inside the native window callback.
        unsafe {
            OleUninitialize();
        }
    }
}

struct Pidl(*mut ITEMIDLIST);
impl Pidl {
    fn parse(path: &Path) -> windows::core::Result<Self> {
        let text: Vec<u16> = path.as_os_str().encode_wide().chain(Some(0)).collect();
        let mut result = Self(std::ptr::null_mut());
        // The input is an application-owned, absolute path. Shell allocates the PIDL.
        unsafe {
            SHParseDisplayName(
                PCWSTR(text.as_ptr()),
                None::<&IBindCtx>,
                &mut result.0,
                0,
                None,
            )?;
        }
        Ok(result)
    }
}
impl Drop for Pidl {
    fn drop(&mut self) {
        unsafe {
            CoTaskMemFree(Some(self.0.cast()));
        }
    }
}

fn shell_drag(hwnd: isize, paths: &[PathBuf]) -> Result<bool, String> {
    let parent = paths
        .first()
        .and_then(|path| path.parent())
        .ok_or("Prepared files are missing")?;
    // Shell owns the drop source and feedback. COPY is the sole advertised effect.
    // Keep the absolute PIDLs alive while SHCreateDataObject uses relative child pointers.
    unsafe {
        OleInitialize(None).map_err(|e| e.to_string())?;
        let _ole = Ole;
        let folder = Pidl::parse(parent).map_err(|e| e.to_string())?;
        let items = paths
            .iter()
            .map(|path| Pidl::parse(path))
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?;
        let children = items
            .iter()
            .map(|item| ILFindLastID(item.0).cast_const())
            .collect::<Vec<_>>();
        let object: IDataObject =
            SHCreateDataObject(Some(folder.0), Some(&children), None::<&IDataObject>)
                .map_err(|e| e.to_string())?;
        if GetAsyncKeyState(i32::from(VK_LBUTTON.0)) >= 0 {
            return Ok(false);
        }
        let effect = SHDoDragDrop(
            Some(HWND(hwnd as _)),
            &object,
            None::<&IDropSource>,
            DROPEFFECT_COPY,
        )
        .map_err(|e| e.to_string())?;
        Ok(effect == DROPEFFECT_COPY)
    }
}
