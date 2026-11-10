//! Profile-local presentation preferences. Session metadata stays in its workspace database.
use serde_json::{json, Value};
use std::{fs, io::Write, path::Path};

pub fn validate(value: &Value) -> Result<(), String> {
    let obj = value.as_object().ok_or("Preferences must be an object")?;
    if value.to_string().len() > 16384 {
        return Err("Preferences too large".into());
    }
    for (key, v) in obj {
        let valid = match key.as_str() {
            "theme" => ["light", "dark", "oled", "system"].contains(&v.as_str().unwrap_or("")),
            "motion" => ["smooth", "fast", "reduced"].contains(&v.as_str().unwrap_or("")),
            "accent" => ["blue", "purple", "green", "orange", "teal", "pink"]
                .contains(&v.as_str().unwrap_or("")),
            "startup" => {
                ["library", "collections", "tags", "sources"].contains(&v.as_str().unwrap_or(""))
            }
            "restoreSession" | "sidebarOpen" | "autoCompanion" | "openBeside" | "focusEditor" => {
                v.is_boolean()
            }
            "shortcuts" => v.as_object().is_some_and(|o| {
                o.len() <= 32
                    && o.iter()
                        .all(|(k, v)| k.len() <= 32 && v.as_str().is_some_and(|s| s.len() <= 64))
            }),
            _ => false,
        };
        if !valid {
            return Err(format!("Unsupported preference: {key}"));
        }
    }
    Ok(())
}
pub fn preferences(path: Option<&Path>, value: Option<Value>) -> Result<Value, String> {
    let path = path.ok_or("Profile preferences unavailable")?;
    if let Some(value) = value {
        validate(&value)?;
        let stage = path.with_extension("pending");
        let mut file = fs::File::create(&stage).map_err(|e| e.to_string())?;
        file.write_all(value.to_string().as_bytes())
            .and_then(|_| file.sync_all())
            .map_err(|e| e.to_string())?;
        drop(file);
        fs::rename(stage, path).map_err(|e| e.to_string())?;
        Ok(value)
    } else if path.exists() {
        if fs::metadata(path).map_err(|e| e.to_string())?.len() > 16384 {
            return Err("Preferences too large".into());
        }
        let value = serde_json::from_slice(&fs::read(path).map_err(|e| e.to_string())?)
            .map_err(|e| e.to_string())?;
        validate(&value)?;
        Ok(value)
    } else {
        Ok(json!({}))
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn workspace_session_receipts_are_root_bound_and_persistent() {
        use crate::domain::{Request, Workspace};
        let dir=std::env::temp_dir().join(uuid::Uuid::new_v4().to_string());
        let mut workspace=Workspace::open(&dir).unwrap();
        let value=json!({"version":1,"documents":[],"ratio":62});
        workspace.execute(Request::Session{path:dir.to_string_lossy().into(),value:value.clone()}).unwrap();
        assert!(workspace.execute(Request::Session{path:dir.join("other").to_string_lossy().into(),value:json!({})}).is_err());
        drop(workspace);
        let mut workspace=Workspace::open(&dir).unwrap();
        assert_eq!(workspace.execute(Request::Snapshot).unwrap()["settings"]["session"],value);
        drop(workspace);fs::remove_dir_all(dir).unwrap();
    }
    #[test]
    fn profile_preferences_are_validated_and_durable() {
        let dir = std::env::temp_dir().join(uuid::Uuid::new_v4().to_string());
        fs::create_dir(&dir).unwrap();
        let path = dir.join("preferences.json");
        let value = json!({"theme":"oled","restoreSession":true,"shortcuts":{"palette":"Ctrl+K"}});
        preferences(Some(&path), Some(value.clone())).unwrap();
        assert_eq!(preferences(Some(&path), None).unwrap(), value);
        assert!(preferences(Some(&path), Some(json!({"theme":"invalid"}))).is_err());
        assert_eq!(preferences(Some(&path), None).unwrap(), value);
        fs::remove_dir_all(dir).unwrap();
    }
}
