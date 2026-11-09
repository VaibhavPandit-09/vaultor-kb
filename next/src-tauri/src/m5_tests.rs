use crate::{
    domain::Workspace,
    linked::{markdown, Request as L},
};
use serde_json::{json, Value};
use std::fs;

#[test]
fn web_dispatch_validation_does_not_grant_filesystem_or_custom_protocol_authority() {
    assert!(crate::linked::web_url("https://example.invalid/docs").is_ok());
    assert!(crate::linked::web_url("file:///C:/outside.md").is_err());
    assert!(crate::linked::web_url("shell:desktop").is_err());
    assert!(crate::linked::web_url("https://example.invalid/\n").is_err());
}
#[test]
fn markdown_source_ranges_preserve_frontmatter_references_crlf_and_noop() {
    let source="\u{feff}---\r\nowner: external\r\n---\r\n\r\n# Title\r\n\r\nHello **bold** and [reference][r].\r\n\r\n[r]: other.md \"original title\"\r\n\r\n```rs\r\nlet x = 1;\r\n```\r\n\r\n| A | B |\r\n| - | - |\r\n| 1 | 2 |\r\n";
    let parsed = markdown::parse(source);
    assert!(parsed.reason.is_none(), "{:?}", parsed.reason);
    assert_eq!(markdown::patch(source, &parsed.document).unwrap(), source);
    let mut proposed = parsed.document.clone();
    proposed["content"][1]["content"][0]["text"] = json!("Greetings ");
    let changed = markdown::patch(source, &proposed).unwrap();
    assert_eq!(changed, source.replacen("Hello ", "Greetings ", 1));
    let mut heading = parsed.document.clone();
    heading["content"][0]["attrs"]["level"] = json!(2);
    let changed = markdown::patch(source, &heading).unwrap();
    assert!(changed.starts_with("\u{feff}---\r\nowner: external\r\n---\r\n\r\n## Title"));
    assert!(changed.ends_with("| 1 | 2 |\r\n"));
    for source in [
        "![image](x.png)",
        "<div>raw</div>",
        "Text[^a]\n\n[^a]: note",
    ] {
        assert!(markdown::parse(source).reason.is_some());
    }
}
#[cfg(windows)]
#[test]
fn local_ntfs_registration_save_conflict_recovery_identity_and_removal() {
    let workspace = tempfile::tempdir().unwrap();
    let source = tempfile::tempdir().unwrap();
    fs::create_dir(source.path().join("Nested λ")).unwrap();
    let file = source.path().join("Nested λ/doc.md");
    let original="---\r\nkey: unchanged\r\n---\r\n\r\n# Heading\r\n\r\nOriginal paragraph.\r\n\r\n    code stays\r\n";
    fs::write(&file, original).unwrap();
    fs::write(source.path().join("ignored.bin"), [1, 2, 3]).unwrap();
    let mut w = Workspace::open(workspace.path()).unwrap();
    let registered = w
        .linked(L::Register {
            path: source.path().to_string_lossy().into(),
        })
        .unwrap();
    let root = registered["id"].as_str().unwrap().to_string();
    let page = w
        .linked(L::Directory {
            source: root.clone(),
            path: "".into(),
            after: None,
        })
        .unwrap();
    assert_eq!(page["entries"].as_array().unwrap().len(), 1);
    assert_eq!(page["hidden"], 1);
    assert!(w
        .linked(L::Open {
            source: root.clone(),
            path: "../escape.md".into()
        })
        .is_err());
    let opened = w
        .linked(L::Open {
            source: root.clone(),
            path: "Nested λ/doc.md".into(),
        })
        .unwrap();
    assert_eq!(opened["editable"], true, "{}", opened);
    let id = opened["documentId"].as_str().unwrap().to_string();
    let mut content = opened["content"].clone();
    content["content"][1]["content"][0]["text"] = json!("Edited paragraph.");
    let protect = |w: &mut Workspace, body: Value, sequence| {
        w.linked(L::Protect {
            id: id.clone(),
            revision: opened["revision"].as_str().unwrap().into(),
            base: original.into(),
            content: body,
            token: "writer".into(),
            sequence,
        })
    };
    protect(&mut w, opened["content"].clone(), 1).unwrap();
    let before = fs::metadata(&file).unwrap().modified().unwrap();
    w.linked(L::Save {
        id: id.clone(),
        token: "writer".into(),
        sequence: 1,
    })
    .unwrap();
    assert_eq!(fs::metadata(&file).unwrap().modified().unwrap(), before);
    protect(&mut w, content.clone(), 2).unwrap();
    drop(w);
    let mut w = Workspace::open(workspace.path()).unwrap();
    let recovered = w.linked(L::Recover { id: id.clone() }).unwrap();
    assert_eq!(recovered["draft"]["sequence"], 2);
    assert_eq!(fs::read_to_string(&file).unwrap(), original);
    let saved = w
        .linked(L::Save {
            id: id.clone(),
            token: "writer".into(),
            sequence: 2,
        })
        .unwrap();
    assert_eq!(
        fs::read_to_string(&file).unwrap(),
        original.replace("Original paragraph.", "Edited paragraph.")
    );
    assert_eq!(saved["draft"], Value::Null);
    assert_eq!(w.linked(L::Drafts).unwrap(), json!([]));
    let mut draft = saved["content"].clone();
    draft["content"][1]["content"][0]["text"] = json!("Unsaved user text.");
    w.linked(L::Protect {
        id: id.clone(),
        revision: saved["revision"].as_str().unwrap().into(),
        base: saved["base"].as_str().unwrap().into(),
        content: draft,
        token: "second".into(),
        sequence: 1,
    })
    .unwrap();
    fs::write(
        &file,
        original.replace("Original paragraph.", "External writer."),
    )
    .unwrap();
    assert!(w
        .linked(L::Save {
            id: id.clone(),
            token: "second".into(),
            sequence: 1
        })
        .unwrap_err()
        .contains("conflict"));
    assert!(fs::read_to_string(&file)
        .unwrap()
        .contains("External writer."));
    assert_eq!(w.linked(L::Drafts).unwrap().as_array().unwrap().len(), 1);
    w.linked(L::Remove { source: root }).unwrap();
    assert!(file.exists());
    assert!(w
        .linked(L::Save {
            id,
            token: "second".into(),
            sequence: 1
        })
        .is_err());
}
#[test]
fn markdown_common_structures_and_unaffected_inline_bytes() {
    let source="---\nowner: me\n---\n\n# Title\n\nKeep [reference][r] and ordinary_word plus plain text.\n\n[r]: next.md \"keep title\"\n\n* First\n* Second\n\n````rs\nlet x = 1;\n````\n\n| A | B |\n| --- | --- |\n| one | two |\n";
    let p = markdown::parse(source);
    assert!(p.reason.is_none());
    let mut changed = p.document.clone();
    let t = changed["content"][1]["content"]
        .as_array_mut()
        .unwrap()
        .iter_mut()
        .find(|n| {
            n["text"]
                .as_str()
                .is_some_and(|s| s.contains("ordinary_word"))
        })
        .unwrap();
    t["text"] = json!(t["text"]
        .as_str()
        .unwrap()
        .replace("plain text", "fresh text"));
    let out = markdown::patch(source, &changed).unwrap();
    assert_eq!(out, source.replace("plain text", "fresh text"));
    let mut list = p.document.clone();
    list["content"][2]["content"][0]["content"][0]["content"][0]["marks"] =
        json!([{"type":"bold"}]);
    let out = markdown::patch(source, &list).unwrap();
    assert!(out.contains("* **First**\n* Second"));
    assert!(out.contains("[reference][r]"));
    assert!(out.contains("[r]: next.md \"keep title\""));
    let mut table = p.document.clone();
    table["content"][4]["content"][1]["content"][0]["content"][0]["content"][0]["text"] =
        json!("edited");
    let out = markdown::patch(source, &table).unwrap();
    assert_eq!(out, source.replace("| one | two |", "| edited | two |"));
    let mut code = p.document.clone();
    code["content"][3]["content"][0]["text"] = json!("let x = 2;\n");
    assert_eq!(
        markdown::patch(source, &code).unwrap(),
        source.replace("let x = 1;", "let x = 2;")
    );
    let mut inserted = p.document.clone();
    inserted["content"].as_array_mut().unwrap().insert(
        1,
        json!({"type":"paragraph","content":[{"type":"text","text":"Inserted paragraph."}]}),
    );
    let out = markdown::patch(source, &inserted).unwrap();
    assert!(out.starts_with("---\nowner: me\n---\n\n# Title\n\nInserted paragraph."));
    assert!(out.ends_with("| one | two |\n"));
}
#[cfg(windows)]
#[test]
fn interrupted_publication_retains_gap_occupant_and_verifies_exact_outcome() {
    use crate::linked::native;
    for publish in [false, true] {
        let workspace = tempfile::tempdir().unwrap();
        let source = tempfile::tempdir().unwrap();
        let file = source.path().join("source.md");
        fs::write(&file, "Original.\n").unwrap();
        let mut w = Workspace::open(workspace.path()).unwrap();
        let root = w
            .linked(L::Register {
                path: source.path().to_string_lossy().into(),
            })
            .unwrap()["id"]
            .as_str()
            .unwrap()
            .to_string();
        let doc = w
            .linked(L::Open {
                source: root.clone(),
                path: "source.md".into(),
            })
            .unwrap();
        let id = doc["documentId"].as_str().unwrap().to_string();
        let original = doc["base"].as_str().unwrap();
        let mut proposed = doc["content"].clone();
        proposed["content"][0]["content"][0]["text"] = json!("Proposed.");
        w.linked(L::Protect {
            id: id.clone(),
            revision: doc["revision"].as_str().unwrap().into(),
            base: original.into(),
            content: proposed.clone(),
            token: "writer".into(),
            sequence: 1,
        })
        .unwrap();
        let root_pins = native::pin(source.path()).unwrap();
        let physical = native::physical(root_pins.last().unwrap()).unwrap();
        let root_id = native::identity(root_pins.last().unwrap()).unwrap();
        let original_file = native::read(&physical, &root_id, "source.md", true).unwrap();
        let stage = ".vaultor-stage-test";
        let capture = ".vaultor-capture-test";
        let candidate = markdown::patch(original, &proposed).unwrap();
        let staged = native::stage(&original_file, stage, candidate.as_bytes()).unwrap();
        let staged_id = native::identity(&staged).unwrap();
        w.db.execute("INSERT INTO linked_saves(id,status,stage,capture,original_identity,original_hash,candidate_identity,candidate_hash,candidate,token,sequence) VALUES(?1,'captured',?2,?3,?4,?5,?6,?7,?8,'writer',1)",rusqlite::params![id,physical.join(stage).to_string_lossy(),physical.join(capture).to_string_lossy(),original_file.id,original_file.revision,staged_id,native::hash(candidate.as_bytes()),candidate]).unwrap();
        native::rename(
            &original_file.file,
            original_file.pins.last().unwrap(),
            capture,
        )
        .unwrap();
        if publish {
            native::rename(&staged, original_file.pins.last().unwrap(), "source.md").unwrap();
        } else {
            fs::write(&file, "Competing gap occupant.\n").unwrap();
            assert!(
                native::rename(&staged, original_file.pins.last().unwrap(), "source.md").is_err()
            );
            assert_eq!(
                fs::read_to_string(&file).unwrap(),
                "Competing gap occupant.\n"
            );
        }
        drop(staged);
        drop(original_file);
        drop(root_pins);
        drop(w);
        let mut w = Workspace::open(workspace.path()).unwrap();
        let recovered = w
            .linked(L::Open {
                source: root.clone(),
                path: "source.md".into(),
            })
            .unwrap();
        assert_eq!(recovered["documentId"], id);
        assert!(recovered["draft"].is_object());
        if !publish {
            assert!(w.linked(L::Resolve { id: id.clone() }).is_err());
            assert_eq!(
                fs::read_to_string(&file).unwrap(),
                "Competing gap occupant.\n"
            );
            assert_eq!(
                fs::read_to_string(source.path().join(capture)).unwrap(),
                original
            );
            assert_eq!(w.linked(L::Drafts).unwrap().as_array().unwrap().len(), 1);
        } else {
            let saved = w.linked(L::Resolve { id: id.clone() }).unwrap();
            assert!(saved["draft"].is_null());
            assert_eq!(fs::read_to_string(&file).unwrap(), candidate);
            assert!(!source.path().join(capture).exists());
            assert_eq!(w.linked(L::Drafts).unwrap(), json!([]));
        }
    }
}
#[cfg(windows)]
#[test]
fn replaced_missing_readonly_streams_and_real_junction_refuse_publication() {
    let workspace = tempfile::tempdir().unwrap();
    let source = tempfile::tempdir().unwrap();
    let outside = tempfile::tempdir().unwrap();
    fs::write(outside.path().join("external.md"), "untouched").unwrap();
    let mut w = Workspace::open(workspace.path()).unwrap();
    let root = w
        .linked(L::Register {
            path: source.path().to_string_lossy().into(),
        })
        .unwrap()["id"]
        .as_str()
        .unwrap()
        .to_string();
    let junction = source.path().join("outside-junction");
    assert!(junction.starts_with(source.path()));
    let made = std::process::Command::new("cmd.exe")
        .args(["/d", "/c", "mklink", "/J"])
        .arg(&junction)
        .arg(outside.path())
        .output()
        .unwrap();
    assert!(
        made.status.success(),
        "{}",
        String::from_utf8_lossy(&made.stderr)
    );
    assert!(w
        .linked(L::Directory {
            source: root.clone(),
            path: "outside-junction".into(),
            after: None
        })
        .is_err());
    assert!(w
        .linked(L::Open {
            source: root.clone(),
            path: "outside-junction/external.md".into()
        })
        .is_err());
    fs::remove_dir(&junction).unwrap();
    assert_eq!(
        fs::read_to_string(outside.path().join("external.md")).unwrap(),
        "untouched"
    );
    fs::write(source.path().join("streams.md"), "Content\n").unwrap();
    fs::write(source.path().join("streams.md:metadata"), "secret").unwrap();
    let doc = w
        .linked(L::Open {
            source: root.clone(),
            path: "streams.md".into(),
        })
        .unwrap();
    assert_eq!(doc["editable"], false);
    assert!(doc["reason"].as_str().unwrap().contains("Alternate"));
    let file = source.path().join("old.md");
    fs::write(&file, "Old\n").unwrap();
    let doc = w
        .linked(L::Open {
            source: root.clone(),
            path: "old.md".into(),
        })
        .unwrap();
    let id = doc["documentId"].as_str().unwrap().to_string();
    let content = json!({"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"User draft"}]}]});
    w.linked(L::Protect {
        id: id.clone(),
        revision: doc["revision"].as_str().unwrap().into(),
        base: doc["base"].as_str().unwrap().into(),
        content,
        token: "writer".into(),
        sequence: 1,
    })
    .unwrap();
    fs::rename(&file, source.path().join("moved.md")).unwrap();
    assert!(w
        .linked(L::Save {
            id: id.clone(),
            token: "writer".into(),
            sequence: 1
        })
        .is_err());
    assert!(!file.exists());
    fs::write(&file, "Old\n").unwrap();
    assert!(w
        .linked(L::Save {
            id: id.clone(),
            token: "writer".into(),
            sequence: 1
        })
        .unwrap_err()
        .contains("conflict"));
    assert_eq!(fs::read_to_string(&file).unwrap(), "Old\n");
    assert_eq!(w.linked(L::Drafts).unwrap().as_array().unwrap().len(), 1);
}
#[cfg(windows)]
#[test]
fn unsupported_save_and_permission_failure_keep_durable_drafts() {
    let workspace = tempfile::tempdir().unwrap();
    let source = tempfile::tempdir().unwrap();
    let file = source.path().join("ordinary.md");
    fs::write(&file, "Keep source.\n").unwrap();
    let mut w = Workspace::open(workspace.path()).unwrap();
    let root = w
        .linked(L::Register {
            path: source.path().to_string_lossy().into(),
        })
        .unwrap()["id"]
        .as_str()
        .unwrap()
        .to_string();
    let doc = w
        .linked(L::Open {
            source: root,
            path: "ordinary.md".into(),
        })
        .unwrap();
    let id = doc["documentId"].as_str().unwrap().to_string();
    let mut body = doc["content"].clone();
    body["content"][0]["content"][0]["marks"] = json!([{"type":"underline"}]);
    w.linked(L::Protect {
        id: id.clone(),
        revision: doc["revision"].as_str().unwrap().into(),
        base: doc["base"].as_str().unwrap().into(),
        content: body.clone(),
        token: "writer".into(),
        sequence: 1,
    })
    .unwrap();
    assert!(w
        .linked(L::Save {
            id: id.clone(),
            token: "writer".into(),
            sequence: 1
        })
        .is_err());
    let recovered = w.linked(L::Recover { id: id.clone() }).unwrap();
    assert_eq!(recovered["content"], body);
    assert_eq!(recovered["draft"]["state"], "failed");
    assert!(recovered["draft"]["error"]
        .as_str()
        .unwrap()
        .contains("underline"));
    assert_eq!(fs::read_to_string(&file).unwrap(), "Keep source.\n");
    body["content"][0]["content"][0]
        .as_object_mut()
        .unwrap()
        .remove("marks");
    body["content"][0]["content"][0]["text"] = json!("Changed");
    w.linked(L::Protect {
        id: id.clone(),
        revision: doc["revision"].as_str().unwrap().into(),
        base: doc["base"].as_str().unwrap().into(),
        content: body,
        token: "writer".into(),
        sequence: 2,
    })
    .unwrap();
    let mut permissions = fs::metadata(&file).unwrap().permissions();
    permissions.set_readonly(true);
    fs::set_permissions(&file, permissions.clone()).unwrap();
    assert!(w
        .linked(L::Save {
            id: id.clone(),
            token: "writer".into(),
            sequence: 2
        })
        .is_err());
    assert_eq!(fs::read_to_string(&file).unwrap(), "Keep source.\n");
    permissions.set_readonly(false);
    fs::set_permissions(&file, permissions).unwrap();
    w.linked(L::Save {
        id,
        token: "writer".into(),
        sequence: 2,
    })
    .unwrap();
    assert_eq!(fs::read_to_string(&file).unwrap(), "Changed\n");
}
