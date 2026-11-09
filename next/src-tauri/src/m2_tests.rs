use crate::{
    domain::{Request, Workspace},
    editing::Proof,
};
use rusqlite::params;
use serde_json::{json, Value};
fn doc(text: &str) -> Value {
    json!({"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":text}]}]})
}
fn create(w: &mut Workspace) -> String {
    w.execute(Request::CreateNote {
        title: "Note".into(),
        collection: None,
    })
    .unwrap()["id"]
        .as_str()
        .unwrap()
        .into()
}
#[test]
fn protected_conflict_restart_rebase_and_exact_cleanup() {
    let temp = tempfile::tempdir().unwrap();
    let mut w = Workspace::open(temp.path()).unwrap();
    let id = create(&mut w);
    w.draft(
        id.clone(),
        1,
        "editor".into(),
        1,
        "My version".into(),
        doc("recover λ"),
    )
    .unwrap();
    assert_eq!(
        w.execute(Request::Read { id: id.clone() }).unwrap()["revision"],
        1
    );
    drop(w);
    let mut w = Workspace::open(temp.path()).unwrap();
    assert_eq!(
        w.read_draft(id.clone()).unwrap()["content"],
        doc("recover λ")
    );
    w.save(id.clone(), 1, "External".into(), doc("new saved"), None)
        .unwrap();
    assert!(w
        .save(
            id.clone(),
            1,
            "My version".into(),
            doc("recover λ"),
            Some(Proof {
                token: "editor".into(),
                sequence: 1
            })
        )
        .is_err());
    assert_eq!(
        w.execute(Request::Read { id: id.clone() }).unwrap()["content"],
        doc("new saved")
    );
    assert!(w.discard_draft(id.clone(), "editor".into(), 2).is_err());
    assert!(w.rebase_draft(id.clone(), "editor".into(), 1, 1).is_err());
    w.rebase_draft(id.clone(), "editor".into(), 1, 2).unwrap();
    assert!(w
        .save(
            id.clone(),
            2,
            "My version".into(),
            doc("wrong body"),
            Some(Proof {
                token: "editor".into(),
                sequence: 1
            })
        )
        .is_err());
    w.save(
        id.clone(),
        2,
        "My version".into(),
        doc("recover λ"),
        Some(Proof {
            token: "editor".into(),
            sequence: 1,
        }),
    )
    .unwrap();
    assert_eq!(w.drafts().unwrap(), json!([]));
    w.draft(
        id.clone(),
        3,
        "editor".into(),
        2,
        "Draft".into(),
        doc("discard"),
    )
    .unwrap();
    assert!(w
        .draft(
            id.clone(),
            3,
            "another".into(),
            3,
            "Draft".into(),
            doc("overwrite")
        )
        .is_err());
    assert!(w
        .draft(
            id.clone(),
            3,
            "editor".into(),
            2,
            "Draft".into(),
            doc("wrong retry")
        )
        .is_err());
    w.discard_draft(id.clone(), "editor".into(), 2).unwrap();
    assert_eq!(w.drafts().unwrap(), json!([]));
    assert_eq!(
        w.execute(Request::Read { id }).unwrap()["content"],
        doc("recover λ")
    );
}
#[test]
fn cursor_walk_5000_is_stable_across_edits_and_new_notes() {
    let temp = tempfile::tempdir().unwrap();
    let mut w = Workspace::open(temp.path()).unwrap();
    let tx = w.db.transaction().unwrap();
    for i in 0..5000 {
        tx.execute(
            "INSERT INTO resources(id,title,content) VALUES(?1,?2,?3)",
            params![
                format!("id-{i}"),
                format!("Note {i}"),
                doc("body").to_string()
            ],
        )
        .unwrap();
    }
    tx.commit().unwrap();
    let mut page = w.list(None, None, Some(100)).unwrap();
    assert_eq!(page["total"], 5000);
    let mut ids = std::collections::HashSet::new();
    let mut pages = 0;
    create(&mut w);
    w.save("id-200".into(), 1, "Updated".into(), doc("new body"), None)
        .unwrap();
    loop {
        pages += 1;
        for row in page["items"].as_array().unwrap() {
            assert!(row.get("content").is_none());
            assert!(ids.insert(row["id"].as_str().unwrap().to_string()));
        }
        if page["next"].is_null() {
            break;
        }
        let cursor = serde_json::from_value(page["next"].clone()).unwrap();
        page = w.list(None, Some(cursor), Some(100)).unwrap();
    }
    assert_eq!(pages, 50);
    assert_eq!(ids.len(), 5000);
    assert_eq!(w.list(None, None, None).unwrap()["total"], 5001);
}
#[test]
fn hierarchy_and_membership_transactions_preserve_identity() {
    let temp = tempfile::tempdir().unwrap();
    let mut w = Workspace::open(temp.path()).unwrap();
    let id = create(&mut w);
    let root = w.collection(None, "Projects".into(), None).unwrap()["id"]
        .as_str()
        .unwrap()
        .to_string();
    let child = w
        .collection(None, "Notes".into(), Some(root.clone()))
        .unwrap()["id"]
        .as_str()
        .unwrap()
        .to_string();
    assert!(w
        .collection(Some(root.clone()), "Cycle".into(), Some(child.clone()))
        .is_err());
    w.collection(Some(child.clone()), "Renamed".into(), Some(root.clone()))
        .unwrap();
    w.membership(id.clone(), Some(root.clone()), None).unwrap();
    w.membership(id.clone(), Some(child.clone()), None).unwrap();
    assert_eq!(
        w.memberships(id.clone()).unwrap()["members"]
            .as_array()
            .unwrap()
            .len(),
        2
    );
    assert!(w
        .membership(id.clone(), Some("missing".into()), Some(root.clone()))
        .is_err());
    assert_eq!(w.list(Some(root.clone()), None, None).unwrap()["total"], 1);
    w.membership(id.clone(), Some(child.clone()), Some(root.clone()))
        .unwrap();
    assert_eq!(w.list(Some(root), None, None).unwrap()["total"], 0);
    let cursor = w.list(None, None, Some(1)).unwrap()["next"].clone();
    assert!(cursor.is_null());
    drop(w);
    let mut w = Workspace::open(temp.path()).unwrap();
    assert_eq!(w.list(Some(child.clone()), None, None).unwrap()["total"], 1);
    w.membership(id.clone(), None, Some(child)).unwrap();
    assert_eq!(w.list(None, None, None).unwrap()["total"], 1);
    assert_eq!(w.execute(Request::Read { id }).unwrap()["revision"], 1);
}
#[test]
fn recovery_quota_refuses_without_evicting_older_evidence() {
    let temp = tempfile::tempdir().unwrap();
    let mut w = Workspace::open(temp.path()).unwrap();
    for i in 0..64 {
        let id = create(&mut w);
        w.draft(
            id,
            1,
            format!("token-{i}"),
            1,
            "Draft".into(),
            doc("protected"),
        )
        .unwrap();
    }
    let id = create(&mut w);
    assert!(w
        .draft(id, 1, "overflow".into(), 1, "New".into(), doc("refused"))
        .is_err());
    assert_eq!(w.drafts().unwrap().as_array().unwrap().len(), 64);
}
