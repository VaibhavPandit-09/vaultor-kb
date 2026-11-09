use crate::domain::{Request, Workspace};
use rusqlite::params;
use serde_json::json;
#[test]
fn bulk_moves_preserve_content_and_other_memberships_and_report_noops() {
    let temp = tempfile::tempdir().unwrap();
    let mut w = Workspace::open(temp.path()).unwrap();
    let a = w.collection(None, "A".into(), None).unwrap()["id"]
        .as_str()
        .unwrap()
        .to_owned();
    let b = w.collection(None, "B".into(), None).unwrap()["id"]
        .as_str()
        .unwrap()
        .to_owned();
    let c = w.collection(None, "Other".into(), None).unwrap()["id"]
        .as_str()
        .unwrap()
        .to_owned();
    let mut ids = Vec::new();
    for _ in 0..100 {
        ids.push(
            w.execute(Request::CreateNote {
                title: "Original".into(),
                collection: Some(a.clone()),
            })
            .unwrap()["id"]
                .as_str()
                .unwrap()
                .to_owned(),
        );
    }
    w.bulk_membership(ids.clone(), Some(c.clone()), None)
        .unwrap();
    let result = w
        .bulk_membership(ids.clone(), Some(b.clone()), Some(a.clone()))
        .unwrap();
    assert_eq!(
        result,
        json!({"requested":100,"added":100,"removed":100,"unchanged":0})
    );
    let result = w
        .bulk_membership(ids.clone(), Some(b.clone()), None)
        .unwrap();
    assert_eq!(result["unchanged"], 100);
    assert_eq!(
        w.bulk_membership(ids.clone(), Some(b.clone()), Some(b.clone()))
            .unwrap()["unchanged"],
        100
    );
    w.bulk_membership(ids.clone(), None, Some(b.clone()))
        .unwrap();
    assert_eq!(w.list(Some(a), None, None).unwrap()["total"], 0);
    assert_eq!(w.list(Some(b), None, None).unwrap()["total"], 0);
    assert_eq!(w.list(Some(c), None, None).unwrap()["total"], 100);
    assert_eq!(w.list(None, None, None).unwrap()["total"], 100);
    let note = w.execute(Request::Read { id: ids[0].clone() }).unwrap();
    assert_eq!(note["title"], "Original");
    assert_eq!(note["revision"], 1);
}
#[test]
fn bulk_validation_and_late_failure_roll_back_every_membership() {
    let temp = tempfile::tempdir().unwrap();
    let mut w = Workspace::open(temp.path()).unwrap();
    let c = w.collection(None, "Destination".into(), None).unwrap()["id"]
        .as_str()
        .unwrap()
        .to_owned();
    for id in ["a", "b", "c"] {
        w.db.execute(
            "INSERT INTO resources(id,title,content) VALUES(?1,'Note',?2)",
            params![id, r#"{"type":"doc","content":[{"type":"paragraph"}]}"#],
        )
        .unwrap();
    }
    assert!(w.bulk_membership(vec![], Some(c.clone()), None).is_err());
    assert!(w
        .bulk_membership(vec!["a".into(); 101], Some(c.clone()), None)
        .is_err());
    assert!(w
        .bulk_membership(vec!["a".into(), "missing".into()], Some(c.clone()), None)
        .is_err());
    assert!(w
        .bulk_membership(vec!["a".into()], Some("missing".into()), None)
        .is_err());
    w.db.execute_batch("CREATE TEMP TRIGGER refuse_last BEFORE INSERT ON memberships WHEN NEW.resource_id='c' BEGIN SELECT RAISE(ABORT,'late failure'); END;").unwrap();
    assert!(w
        .bulk_membership(
            vec!["a".into(), "b".into(), "c".into()],
            Some(c.clone()),
            None
        )
        .is_err());
    assert_eq!(w.list(Some(c.clone()), None, None).unwrap()["total"], 0);
    w.db.execute_batch("DROP TRIGGER refuse_last").unwrap();
    assert_eq!(
        w.bulk_membership(vec!["a".into(), "a".into()], Some(c.clone()), None)
            .unwrap()["requested"],
        1
    );
    drop(w);
    let w = Workspace::open(temp.path()).unwrap();
    assert_eq!(w.list(Some(c), None, None).unwrap()["total"], 1);
}
