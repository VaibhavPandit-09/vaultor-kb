use crate::{domain::{Workspace,Request as D},organization::{Request as O,Archive},search::SearchOptions};
use serde_json::json;
use std::collections::HashSet;
fn create(w:&mut Workspace)->String {w.execute(D::CreateNote{title:"A note".into(),collection:None}).unwrap()["id"].as_str().unwrap().into()}
fn pins(w:&mut Workspace,kind:&str,offset:usize,limit:usize)->serde_json::Value {w.organization(O::Pins{query:"".into(),kind:kind.into(),offset,limit}).unwrap()}
#[test]
fn mixed_pins_keep_entity_identity_page_and_survive_restart_and_archive(){
 let dir=tempfile::tempdir().unwrap();let mut w=Workspace::open(dir.path()).unwrap();let id=create(&mut w);
 // Equal text IDs in different entity namespaces must never become fake notes.
 w.db.execute("INSERT INTO collections(id,name,normalized) VALUES(?1,'A collection','a collection')",[&id]).unwrap();
 w.organization(O::Pin{ids:vec![id.clone()],value:true}).unwrap();w.organization(O::PinCollection{id:id.clone(),value:true}).unwrap();
 let page=pins(&mut w,"all",0,1);assert_eq!(page["total"],2);assert_eq!(page["items"][0]["kind"],"collection");assert_eq!(page["next"],1);
 assert_eq!(pins(&mut w,"all",1,1)["items"][0]["kind"],"note");assert_eq!(pins(&mut w,"collection",0,100)["total"],1);
 let archive=Archive::capture(&w.db,&HashSet::from([id.clone()])).unwrap();assert_eq!(archive.collection_pins,vec![id.clone()]);
 let old:Archive=serde_json::from_value(json!({"tags":[],"assignments":[],"states":[]})).unwrap();assert!(old.collection_pins.is_empty());
 let copy=tempfile::tempdir().unwrap();let w2=Workspace::open(copy.path()).unwrap();w2.db.execute("INSERT INTO resources(id,title,content) VALUES(?1,'Copy','{\"type\":\"doc\",\"content\":[] }')",[&id]).unwrap();w2.db.execute("INSERT INTO collections(id,name,normalized) VALUES(?1,'A collection','a collection')",[&id]).unwrap();archive.restore(&w2.db).unwrap();drop(w2);
 w.organization(O::PinCollection{id:id.clone(),value:false}).unwrap();assert_eq!(pins(&mut w,"all",0,100)["total"],1);drop(w);
 let mut w=Workspace::open(dir.path()).unwrap();assert_eq!(pins(&mut w,"note",0,100)["total"],1);assert_eq!(w.execute(D::Read{id}).unwrap()["title"],"A note");
}
#[test]
fn file_filters_use_original_identity_and_reject_unsupported_kind(){
 let dir=tempfile::tempdir().unwrap();let mut w=Workspace::open(dir.path()).unwrap();create(&mut w);let mut ids=Vec::new();
 for name in ["Photo.PNG","report.PDF","source.txt","sound.mp3","movie.mp4","opaque.bin"] {let id=uuid::Uuid::new_v4().to_string();w.attach_metadata(id.clone(),name.into(),16,"0".repeat(64)).unwrap();ids.push(id);}
 w.db.execute("UPDATE resources SET title='Renamed display' WHERE id=?1",[&ids[1]]).unwrap();
 for kind in ["image","pdf","text","audio","video","other","note"] {let o=SearchOptions{query:"".into(),kind:Some(kind.into()),content:false,collection:None,order:"created".into(),view:"library".into(),tag:None};let p=w.search(o,None,Some(1)).unwrap();assert_eq!(p["total"],1,"{kind}");if kind=="pdf"{assert_eq!(p["items"][0]["fileCategory"],"pdf");assert_eq!(p["items"][0]["title"],"Renamed display");}}
 w.organization(O::Pin{ids,value:true}).unwrap();assert_eq!(pins(&mut w,"image",0,100)["total"],1);assert_eq!(pins(&mut w,"file",0,100)["total"],6);
 assert!(w.organization(O::Pins{query:"".into(),kind:"future".into(),offset:0,limit:10}).is_err());
}
#[test]
fn workspace_behavior_is_root_bound_validated_and_persistent(){
 let dir=tempfile::tempdir().unwrap();let mut w=Workspace::open(dir.path()).unwrap();let value=json!({"maxVisiblePanes":1,"noteOpening":"fill","autosaveDelay":0,"focusMode":true});
 w.execute(D::Behavior{path:dir.path().to_string_lossy().into(),value:value.clone()}).unwrap();
 for bad in [json!({"maxVisiblePanes":3}),json!({"autosaveDelay":50}),json!({"opacity":0.6}),json!({"focusMode":"yes"})] {assert!(w.execute(D::Behavior{path:dir.path().to_string_lossy().into(),value:bad}).is_err());}
 assert!(w.execute(D::Behavior{path:dir.path().join("other").to_string_lossy().into(),value:json!({})}).is_err());drop(w);
 let mut w=Workspace::open(dir.path()).unwrap();assert_eq!(w.execute(D::Snapshot).unwrap()["settings"]["behavior"],value);
}
