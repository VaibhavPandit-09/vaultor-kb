//! Offline benchmark seed for a new disposable workspace. No renderer submission command.
use serde_json::json;
use std::{path::PathBuf,time::Instant};
use uuid::Uuid;
use vaultor_next::{domain::{Request,Workspace},reviews::{AuthorizedSubmitter,Locator,Submission}};

fn main() -> Result<(), String> {
    let root=PathBuf::from(std::env::args_os().nth(1).ok_or("Missing temporary workspace path")?);
    let parent=root.parent().ok_or("Missing disposable parent")?;
    if root.exists() || root.file_name().and_then(|name|name.to_str())!=Some("workspace")
        || !parent.file_name().is_some_and(|name|name.to_string_lossy().starts_with("vaultor-next-bench-"))
        || parent.parent().and_then(|path|path.canonicalize().ok())!=std::env::temp_dir().canonicalize().ok()
    {
        return Err("Only a new workspace in a disposable benchmark directory is supported".into());
    }
    let mut w=Workspace::open(&root)?;
    let saved=json!({"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"The original benchmark evidence and context."}]}]});
    let note=w.execute(Request::CreateNote{title:"M23 review fixture".into(),collection:None})?;
    let resource=note["id"].as_str().unwrap().to_owned();
    w.execute(Request::Save{id:resource.clone(),revision:1,title:"M23 review fixture".into(),content:saved,proof:None})?;
    let generation=w.review_generation()?;
    let grant=AuthorizedSubmitter{generation:&generation,resource_id:&resource,principal:"benchmark-fixture",label:"Fixture reviewer"};
    let mut timings=vec![];
    for index in 0..100 {
        let start=Instant::now();
        w.submit_review(&grant,Submission {id:Uuid::new_v4().to_string(),resource_id:resource.clone(),
            base_revision:2,comment:format!("Check fixture statement {index}."),quote:"benchmark evidence".into(),
            context:"original benchmark evidence and context".into(),locator:Some(Locator::Block{path:"0".into()})})?;
        timings.push(start.elapsed().as_secs_f64()*1000.);
    }
    println!("{}",json!({"resource":resource,"submissionMs":timings}));
    Ok(())
}
