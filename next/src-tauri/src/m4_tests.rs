use crate::domain::{Request, Workspace};
use crate::search::{SearchCursor, SearchOptions};
use serde_json::{json, Value};
fn options(q: &str, content: bool, collection: Option<String>, order: &str) -> SearchOptions {
    SearchOptions {
        query: q.into(),
        content,
        collection,
        order: order.into(),
        view: String::new(),
        tag: None,
        kind:None,
    }
}
fn query(w: &Workspace, q: &str, content: bool) -> Value {
    w.search(options(q, content, None, "created"), None, None)
        .unwrap()
}
#[test]
fn committed_index_updates_revisions_recovery_and_existing_workspace_rebuild() {
    let dir = tempfile::tempdir().unwrap();
    let mut w = Workspace::open(dir.path()).unwrap();
    let n = w
        .execute(Request::CreateNote {
            title: "Café ALPHA".into(),
            collection: None,
        })
        .unwrap();
    let id = n["id"].as_str().unwrap().to_string();
    assert_eq!(query(&w, "cafe alp", false)["total"], 1);
    let doc = json!({"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Astronomy nebula"}]}]});
    w.execute(Request::Draft {
        id: id.clone(),
        base_revision: 1,
        token: "draft-owner".into(),
        sequence: 1,
        title: "Draft only".into(),
        content: doc.clone(),
    })
    .unwrap();
    assert_eq!(query(&w, "nebula", true)["total"], 0);
    w.execute(Request::DiscardDraft {
        id: id.clone(),
        token: "draft-owner".into(),
        sequence: 1,
    })
    .unwrap();
    w.execute(Request::Save {
        id: id.clone(),
        revision: 1,
        title: "Changed".into(),
        content: doc.clone(),
        proof: None,
    })
    .unwrap();
    assert_eq!(query(&w, "alpha", true)["total"], 0);
    assert_eq!(query(&w, "NEB", true)["total"], 1);
    assert_eq!(query(&w, "nebula", false)["total"], 0);
    assert!(w
        .execute(Request::Save {
            id,
            revision: 1,
            title: "Wrong".into(),
            content: json!({"type":"doc","content":[]}),
            proof: None
        })
        .is_err());
    assert_eq!(query(&w, "nebula", true)["total"], 1);
    // Simulate an existing M2/M3 workspace with notes but no search index.
    w.db.execute_batch("DROP TRIGGER search_insert;DROP TRIGGER search_update;DROP TRIGGER search_delete;DROP TRIGGER search_member_insert;DROP TRIGGER search_member_delete;DROP TABLE note_search;DROP TABLE search_generation;DROP INDEX resource_title_sort;DROP INDEX resource_updated_sort;").unwrap();
    drop(w);
    let w = Workspace::open(dir.path()).unwrap();
    assert_eq!(query(&w, "nebula", true)["total"], 1);
    assert_eq!(query(&w, "\" OR * - :", true)["total"], 0);
    assert!(w
        .search(
            options(&"x".repeat(257), false, None, "created"),
            None,
            None
        )
        .is_err());
}
#[test]
fn indexed_search_pages_scopes_and_mutable_order_cursor_invalidation() {
    let dir = tempfile::tempdir().unwrap();
    let mut w = Workspace::open(dir.path()).unwrap();
    let c = w
        .execute(Request::CreateCollection {
            name: "Scope".into(),
            parent_id: None,
        })
        .unwrap()["id"]
        .as_str()
        .unwrap()
        .to_string();
    let tx = w.db.transaction().unwrap();
    for i in 0..5000 {
        let id = format!("n{i:05}");
        tx.execute(
            "INSERT INTO resources(id,title,content) VALUES(?1,?2,?3)",
            rusqlite::params![
                id,
                format!("Entry {:05}", i / 2),
                r#"{"type":"doc","content":[{"type":"text","text":"galaxy"}]}"#
            ],
        )
        .unwrap();
        if i % 2 == 0 {
            tx.execute(
                "INSERT INTO memberships VALUES(?1,?2)",
                rusqlite::params![id, c],
            )
            .unwrap();
        }
    }
    tx.commit().unwrap();
    for order in ["created", "title", "updated"] {
        let o = options("entry", false, Some(c.clone()), order);
        let mut next = None;
        let mut ids = std::collections::HashSet::new();
        loop {
            let page = w.search(o.clone(), next, None).unwrap();
            assert_eq!(page["total"], 2500);
            for row in page["items"].as_array().unwrap() {
                assert!(row.get("content").is_none());
                assert!(ids.insert(row["id"].as_str().unwrap().to_string()));
            }
            if page["next"].is_null() {
                break;
            }
            next = Some(serde_json::from_value::<SearchCursor>(page["next"].clone()).unwrap());
        }
        assert_eq!(ids.len(), 2500);
    }
    assert_eq!(query(&w, "galaxy", true)["total"], 5000);
    assert_eq!(query(&w, "", false)["total"], 5000);
    let p = w
        .search(options("entry", false, None, "title"), None, None)
        .unwrap();
    let cursor = || Some(serde_json::from_value(p["next"].clone()).unwrap());
    assert!(w
        .search(options("galaxy", true, None, "title"), cursor(), None)
        .is_err());
    w.execute(Request::CreateNote {
        title: "Entry new".into(),
        collection: None,
    })
    .unwrap();
    assert!(w
        .search(options("entry", false, None, "title"), cursor(), None)
        .is_err());
}

#[test]
fn resource_kind_filter_is_cursor_bound_and_refuses_unsupported_types(){
 let dir=tempfile::tempdir().unwrap();let mut w=Workspace::open(dir.path()).unwrap();
 let n=w.execute(Request::CreateNote{title:"Managed file".into(),collection:None}).unwrap();
 w.db.execute("INSERT INTO managed_originals VALUES(?1,'sample.txt','hash',0,'file','test')",[n["id"].as_str().unwrap()]).unwrap();
 w.execute(Request::CreateNote{title:"Managed note".into(),collection:None}).unwrap();
 let mut o=options("",false,None,"created");o.kind=Some("file".into());let files=w.search(o.clone(),None,None).unwrap();assert_eq!(files["total"],1);assert_eq!(files["items"][0]["id"],n["id"]);
 o.kind=Some("note".into());assert_eq!(w.search(o.clone(),None,None).unwrap()["total"],1);
 o.kind=Some("unsupported".into());assert!(w.search(o,None,None).is_err());
}
