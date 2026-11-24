use std::{sync::Arc, time::Duration};
use tauri::{AppHandle, Manager};
use tauri_plugin_updater::{Update, UpdaterExt};
use tokio::sync::Mutex;
use url::Url;
use vaultor_next::transfers::Transfers;

const REPOSITORY: &str = "VaibhavPandit-09/vaultor-kb";
const MANIFEST: &str = "vaultor-next-windows-update.json";
const MAX_INSTALLER: usize = 128 * 1024 * 1024;

#[derive(Default)]
pub struct StagedUpdate(Mutex<Option<(Update, Vec<u8>)>>);

#[derive(serde::Deserialize)]
struct Release {
    draft: bool,
    prerelease: bool,
    assets: Vec<Asset>,
}

#[derive(serde::Deserialize)]
struct Asset {
    name: String,
    browser_download_url: Url,
}

fn github_asset(url: &Url) -> bool {
    url.scheme() == "https"
        && url.host_str() == Some("github.com")
        && url.username().is_empty()
        && url.password().is_none()
        && url.port().is_none()
        && url.query().is_none()
        && url.fragment().is_none()
        && url.path().starts_with(&format!("/{REPOSITORY}/releases/download/v"))
}

async fn read_bounded(client: &reqwest::Client, url: Url, limit: usize) -> Result<Vec<u8>, String> {
    let mut response = client.get(url).send().await.map_err(|error| problem(error.without_url()))?
        .error_for_status().map_err(|error| problem(error.without_url()))?;
    if response.content_length().is_some_and(|size| size > limit as u64) {
        return Err("Update response exceeds the size limit".into());
    }
    let mut bytes = Vec::new();
    while let Some(chunk) = response.chunk().await.map_err(|error| problem(error.without_url()))? {
        if chunk.len() > limit - bytes.len() {
            return Err("Update response exceeds the size limit".into());
        }
        bytes.extend(chunk);
    }
    Ok(bytes)
}

fn problem(error: impl std::fmt::Display) -> String {
    format!("Windows update: {error}")
}

fn available(app: &AppHandle) -> bool {
    app.config().identifier == "com.vaultor.next"
}

#[cfg(feature = "qualification-feed")]
fn disposable_endpoint() -> Option<Url> {
    let port = std::env::var("VAULTOR_QUALIFICATION_UPDATE_PORT").ok()?.parse::<u16>().ok()?;
    Url::parse(&format!("http://127.0.0.1:{port}/{MANIFEST}")).ok()
}

#[cfg(not(feature = "qualification-feed"))]
fn disposable_endpoint() -> Option<Url> {
    None
}

#[tauri::command]
pub fn next_update_info(app: AppHandle) -> (String, bool) {
    (app.package_info().version.to_string(), available(&app))
}

#[tauri::command]
pub async fn stage_next_update(app: AppHandle) -> Result<Option<String>, String> {
    if !available(&app) {
        return Err("Updates are available in the installed Windows release".into());
    }
    let state = app.state::<StagedUpdate>();
    let mut slot = state.0.try_lock().map_err(|_| "An update check is running")?;
    *slot = None;
    let client = reqwest::Client::builder()
        .user_agent("Vaultor-Next-Windows-Updater")
        .timeout(Duration::from_secs(90))
        .redirect(reqwest::redirect::Policy::custom(|attempt| {
            if attempt.previous().len() < 5
                && attempt.url().scheme() == "https"
                && matches!(attempt.url().host_str(), Some("github.com" | "release-assets.githubusercontent.com"))
            {
                attempt.follow()
            } else {
                attempt.stop()
            }
        }))
        .build().map_err(problem)?;
    let fixture = disposable_endpoint();
    let endpoint = if let Some(endpoint) = &fixture {
        endpoint.clone()
    } else {
        let catalog = Url::parse(&format!("https://api.github.com/repos/{REPOSITORY}/releases?per_page=30")).map_err(problem)?;
        let releases: Vec<Release> = serde_json::from_slice(&read_bounded(&client, catalog, 2 * 1024 * 1024).await?)
            .map_err(problem)?;
        let selected = releases.into_iter()
            .filter(|release| !release.draft && !release.prerelease)
            .flat_map(|release| release.assets)
            .find(|asset| asset.name == MANIFEST && github_asset(&asset.browser_download_url));
        let Some(selected) = selected else { return Ok(None) };
        selected.browser_download_url
    };
    let updater = app.updater_builder().endpoints(vec![endpoint]).map_err(problem)?
        .timeout(Duration::from_secs(30)).build().map_err(problem)?;
    let Some(update) = updater.check().await.map_err(|_| "The Windows update manifest could not be read or validated")? else { return Ok(None) };
    let source_valid = fixture.as_ref().map_or_else(
        || github_asset(&update.download_url),
        |endpoint| endpoint.origin() == update.download_url.origin() && update.download_url.path() == "/second.exe",
    );
    if !source_valid {
        return Err("The Windows installer is outside the official release channel".into());
    }
    let bytes = read_bounded(&client, update.download_url.clone(), MAX_INSTALLER).await?;
    update.verify(&bytes).map_err(problem)?;
    let version = update.version.clone();
    *slot = Some((update, bytes));
    Ok(Some(version))
}

#[tauri::command]
pub async fn install_next_update(app: AppHandle, version: String) -> Result<(), String> {
    if !available(&app) {
        return Err("Updates are available in the installed Windows release".into());
    }
    let state = app.state::<StagedUpdate>();
    let slot = state.0.try_lock().map_err(|_| "An update check is running")?;
    let (update, bytes) = slot.as_ref().filter(|(update, _)| update.version == version)
        .ok_or("Check for updates and verify the installer first")?;
    let transfers = app.state::<Arc<Transfers>>();
    if transfers.activity.list().iter().any(|task| matches!(task.state.as_str(), "queued" | "running")) {
        return Err("Finish or cancel work in Activity before updating".into());
    }
    update.verify(bytes).map_err(problem)?;
    #[cfg(feature = "host")]
    {
        let hosting = app.state::<crate::desktop_host::DesktopHost>();
        let mut running = hosting.running.lock().await;
        crate::desktop_host::DesktopHost::stop(&mut running).await?;
    }
    update.install(bytes).map_err(problem)
}
