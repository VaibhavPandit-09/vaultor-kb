//! Profile-local presentation preferences. Session metadata stays in its workspace database.
use serde_json::{json, Value};
use std::{fs, io::Write, path::Path};

pub fn validate_behavior(value:&Value)->Result<(),String>{
    validate(value)?;
    if value.as_object().is_none_or(|o|o.keys().any(|k|!["maxVisiblePanes","noteOpening","autosaveDelay","focusMode"].contains(&k.as_str()))){return Err("Unsupported workspace behavior".into());}
    Ok(())
}
pub fn validate(value: &Value) -> Result<(), String> {
    let obj = value.as_object().ok_or("Preferences must be an object")?;
    if value.to_string().len() > 16384 {
        return Err("Preferences too large".into());
    }
    for (key, v) in obj {
        let valid = match key.as_str() {
            "maxVisiblePanes" => matches!(v.as_u64(),Some(1|2)),
            "noteOpening" => ["fill","reuse"].contains(&v.as_str().unwrap_or("")),
            "autosaveDelay" => v.as_u64().is_some_and(|n| n<=1000 && n%100==0),
            "focusMode" => v.is_boolean(),
            "previewMode" => ["side","floating"].contains(&v.as_str().unwrap_or("")),
            "sidebarWidth" => v.as_u64().is_some_and(|n| (240..=400).contains(&n)),
            "theme" => ["light", "dark", "oled", "system"].contains(&v.as_str().unwrap_or("")),
            "motion" => ["smooth", "fast", "reduced"].contains(&v.as_str().unwrap_or("")),
            "density" => ["comfortable","compact"].contains(&v.as_str().unwrap_or("")),
            "sidebarMode" => ["fixed","floating"].contains(&v.as_str().unwrap_or("")),
            "sidebarSections" => v.as_object().is_some_and(|o| o.len()<=3 && o.iter().all(|(k,s)| ["pinned","recent","tags"].contains(&k.as_str()) && s.as_object().is_some_and(|s| s.len()==3 && s.get("visible").is_some_and(Value::is_boolean) && s.get("collapsed").is_some_and(Value::is_boolean) && s.get("type").is_some_and(|t| ["all","note","file","collection","image","pdf","audio","video","text","other"].contains(&t.as_str().unwrap_or("")) && (k=="pinned"||t!="collection"))))),
            "opacity" => v.as_f64().is_some_and(|n| (0.6..=1.0).contains(&n)),
            "accent" => ["blue", "purple", "green", "orange", "red", "teal", "pink", "cyan"]
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
        let value = json!({"theme":"oled","opacity":0.65,"restoreSession":true,"shortcuts":{"palette":"Ctrl+K"}});
        preferences(Some(&path), Some(value.clone())).unwrap();
        assert_eq!(preferences(Some(&path), None).unwrap(), value);
        for invalid in [json!(0.59),json!(1.01),json!("0.85"),json!(null)] {
            assert!(preferences(Some(&path), Some(json!({"opacity":invalid}))).is_err());
        }
        assert!(preferences(Some(&path), Some(json!({"theme":"invalid"}))).is_err());
        assert_eq!(preferences(Some(&path), None).unwrap(), value);
        fs::remove_dir_all(dir).unwrap();
    }
}
