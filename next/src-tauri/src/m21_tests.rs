use crate::{
    domain::{Request, Workspace},
    organization::Request as Org,
    search::SearchOptions,
};
use serde_json::{json, Value};

fn search(workspace: &mut Workspace, query: &str, options: Value) -> Value {
    let mut filter =
        json!({"query":query,"content":true,"collection":null,"order":"title","view":"library"});
    filter
        .as_object_mut()
        .unwrap()
        .extend(options.as_object().unwrap().clone());
    workspace
        .execute(Request::Search {
            options: serde_json::from_value::<SearchOptions>(filter).unwrap(),
            cursor: None,
            limit: Some(30),
        })
        .unwrap()
}

#[test]
fn combined_search_and_reference_occurrences_share_stable_ids() {
    let dir = tempfile::tempdir().unwrap();
    let mut w = Workspace::open(dir.path()).unwrap();
    let first = w
        .execute(Request::CreateNote {
            title: "Prose note".into(),
            collection: None,
        })
        .unwrap();
    let target = w
        .execute(Request::CreateNote {
            title: "Referenced note".into(),
            collection: None,
        })
        .unwrap();
    let id = first["id"].as_str().unwrap().to_string();
    let to = target["id"].as_str().unwrap().to_string();
    let link = json!({"type":"resourceLink","attrs":{"resourceId":to,"label":"Reference"}});
    let content = json!({"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Unicode 🗺 café quercus <img src='x'>"},link,link]}]});
    w.execute(Request::Save {
        id: id.clone(),
        title: "Prose note".into(),
        revision: 1,
        content,
        proof: None,
    })
    .unwrap();
    let mut tags = Vec::new();
    for name in ["Alpha", "Beta"] {
        let tag = w
            .organization(Org::Tag {
                id: None,
                name: name.into(),
                color: "#333333".into(),
            })
            .unwrap()["id"]
            .as_str()
            .unwrap()
            .to_string();
        w.organization(Org::Tagging {
            ids: vec![id.clone()],
            tag: tag.clone(),
            add: true,
        })
        .unwrap();
        tags.push(tag);
    }
    let hit = search(&mut w, "cafe quer", json!({"tags":tags,"anyTag":false}));
    assert_eq!(hit["total"], 1);
    let snippet = &hit["items"][0]["searchSnippet"];
    assert!(snippet["text"].as_str().unwrap().contains("café"));
    assert!(snippet["highlights"].as_array().unwrap().len() >= 2);
    assert_eq!(
        search(
            &mut w,
            "quercus",
            json!({"tags":[tags[0],"nonexistent"],"anyTag":false})
        )["total"],
        0
    );
    assert_eq!(
        search(
            &mut w,
            "quercus",
            json!({"tags":[tags[0],"nonexistent"],"anyTag":true})
        )["total"],
        1
    );
    let references = w
        .media(json!({"op":"references","id":to,"direction":"incoming","page":0}))
        .unwrap();
    assert_eq!(references["totalItems"], 1);
    assert_eq!(references["totalOccurrences"], 2);
    assert_eq!(references["items"][0]["occurrences"][0]["path"], "0/1");
    assert_eq!(references["items"][0]["id"], id);
    w.organization(Org::Trash {
        ids: vec![id],
        restore: false,
    })
    .unwrap();
    assert_eq!(
        w.media(json!({"op":"references","id":to,"direction":"incoming","page":0}))
            .unwrap()["totalItems"],
        0
    );
}

#[cfg(windows)]
#[test]
fn windows_monitor_reconciles_create_edit_rename_and_delete() {
    use crate::{activity::Activity, worker::Worker, LinkedMonitor, LinkedRequest};
    use std::{
        fs,
        sync::{mpsc, Arc},
        time::{Duration, Instant},
    };
    let temp = tempfile::tempdir().unwrap();
    let path = temp.path().join("workspace");
    let source = temp.path().join("external");
    fs::create_dir(&source).unwrap();
    let worker = Worker::start(path.clone(), None).unwrap();
    let call = |request| tauri::async_runtime::block_on(worker.call(request)).unwrap();
    let workspace = call(Request::Snapshot)["path"]
        .as_str()
        .unwrap()
        .to_string();
    let storage = worker.storage();
    let activity =
        Activity::new(temp.path().join("activity.json"), storage.clone(), |_| {}).unwrap();
    let (changed, events) = mpsc::channel();
    let monitor = LinkedMonitor::start(workspace, storage, Arc::clone(&activity), move |_| {
        let _ = changed.send(());
    })
    .unwrap();
    let registered = call(Request::Linked {
        request: LinkedRequest::Register {
            path: source.to_string_lossy().into(),
        },
    });
    monitor.reconfigure(None);
    let until = Instant::now() + Duration::from_secs(10);
    while !activity
        .list()
        .iter()
        .any(|task| task.kind == "linked-index" && task.state == "completed")
    {
        assert!(
            Instant::now() < until,
            "Source watch did not run its initial index: {:?}",
            activity.list()
        );
        std::thread::sleep(Duration::from_millis(25));
    }
    let search = |word: &str| {
        call(Request::Search{options:serde_json::from_value(json!({"query":word,"content":true,"order":"created","view":"source:".to_string()+registered["id"].as_str().unwrap()})).unwrap(),cursor:None,limit:Some(5)})
    };
    let wait = |word: &str, count: i64| {
        let end = Instant::now() + Duration::from_secs(10);
        loop {
            let result = search(word);
            if result["total"] == count {
                return result;
            }
            assert!(
                Instant::now() < end,
                "Search did not converge for {word}: {result}"
            );
            let _ = events.recv_timeout(Duration::from_millis(100));
        }
    };
    let file = source.join("original.md");
    fs::write(&file, "# Cinnabar discovery\n").unwrap();
    let id = wait("cinnabar", 1)["items"][0]["id"].clone();
    fs::write(&file, "# Vermilion discovery\n").unwrap();
    assert_eq!(wait("vermilion", 1)["items"][0]["id"], id);
    assert_eq!(wait("cinnabar", 0)["total"], 0);
    let renamed = source.join("renamed.md");
    fs::rename(&file, &renamed).unwrap();
    assert_eq!(wait("renamed", 1)["items"][0]["id"], id);
    fs::remove_file(renamed).unwrap();
    wait("vermilion", 0);
    monitor.shutdown();
    activity.shutdown();
    worker.stop();
}
