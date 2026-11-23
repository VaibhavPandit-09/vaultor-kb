use super::*;
use crate::worker::Worker;
use rcgen::{
    BasicConstraints, CertificateParams, CertifiedIssuer, ExtendedKeyUsagePurpose, IsCa, KeyPair,
    KeyUsagePurpose,
};
use rustls::{pki_types::CertificateDer, ClientConfig, RootCertStore};
use std::path::Path;
use tokio::io::AsyncWriteExt;
use tokio::net::TcpStream;
use tokio_rustls::TlsConnector;

#[tokio::test]
async fn browser_session_checks_origin_csrf_scope_revision_and_logout() {
    let fixture = Fixture::new();
    let identity = Identity::open(&fixture.access, &fixture.ca).unwrap();
    let worker = Worker::start(fixture.root.clone(), None).unwrap();
    let note = worker.call(Request::CreateNote { title: "Browser test".into(), collection: None }).await.unwrap();
    let id = note["id"].as_str().unwrap();
    let host = Host::new(worker.storage(), fixture.root.clone(), identity).await.unwrap();
    let listener = host.clone().listen("127.0.0.1:0".parse().unwrap(), fixture.chain.clone(), fixture.key.clone()).await.unwrap();
    let client = connector(Some(fixture.authority.clone()));
    let address = listener.address();
    let origin = format!("Origin: https://{address}\r\n");
    let enroll = json!({"name":"Browser test","kind":"browser","nonce":"a".repeat(64),"fingerprint":host.fingerprint()}).to_string();
    assert_eq!(request(&client,address,"POST","/api/pairings","Origin: https://example.invalid\r\n",&enroll).await.0,403);
    assert_eq!(request(&client,address,"POST","/api/pairings","",&enroll).await.0,400);
    let pending = request(&client,address,"POST","/api/pairings",&origin,&enroll).await;
    assert_eq!(pending.0,200,"{}",pending.2);
    let p:Value = serde_json::from_str(&pending.2).unwrap();
    let pairing = p["id"].as_str().unwrap();
    let code = p["code"].as_str().unwrap();
    assert!(host.owner_command(&format!("approve {pairing} invalid")).is_err());
    host.owner_command(&format!("approve {pairing} {code}")).unwrap();
    let path = format!("/api/pairings/{pairing}/complete");
    let proof = format!("{origin}X-Vaultor-Pairing: {}\r\n",p["secret"].as_str().unwrap());
    let complete = request(&client,address,"POST",&path,&proof,"{}").await;
    assert_eq!(complete.0,200,"{}",complete.2);
    let recorded: Value = serde_json::from_str(&complete.2).unwrap();
    assert!(recorded["credential"].is_null());
    let cookie = complete.1.lines().find_map(|line| line.strip_prefix("set-cookie: ")).unwrap();
    assert!(cookie.contains("HttpOnly") && cookie.contains("Secure") && cookie.contains("SameSite=Strict"));
    let pair = cookie.split(';').next().unwrap();
    let credentials = format!("Cookie: {pair}\r\n");
    let document = request(&client,address,"GET","/",&credentials,"").await;
    if document.0 == 200 {
        let assets: Vec<_> = document.2.split('"').filter(|path| path.starts_with("/browser/assets/")).collect();
        assert!(!assets.is_empty());
        for asset in assets {
            assert_eq!(request(&client,address,"GET",asset,&format!("{credentials}{origin}"),"").await.0,200);
            assert_eq!(request(&client,address,"GET",asset,&format!("{credentials}Origin: https://example.invalid\r\n"),"").await.0,403);
        }
    }
    let token = pair.split_once('=').unwrap().1;
    assert_ne!(request(&client,address,"POST",&path,&proof,"{}").await.0,200);
    let browser = "/api/next/browser/v1";
    let note = format!("{browser}/resources/{id}");
    assert_eq!(request(&client,address,"GET",&note,&credentials,"").await.0,403);
    let device = recorded["deviceId"].as_str().unwrap();
    host.owner_command(&format!("grant {device}")).unwrap();
    assert_eq!(request(&client,address,"GET",&note,&credentials,"").await.0,200);
    assert_eq!(request(&client,address,"GET",&format!("/api/next/v1/workspaces"),&format!("Authorization: Bearer {token}\r\n"),"").await.0,401);
    let scope = format!("{credentials}X-Vaultor-Workspace: {}\r\n",host.workspace);
    let edit = format!("{browser}/notes/{id}");
    let body = json!({"revision":1,"title":"Browser save","content":{"type":"doc","content":[]}}).to_string();
    assert_eq!(request(&client,address,"PUT",&edit,&format!("{scope}{origin}"),&body).await.0,403);
    let session = request(&client,address,"GET","/api/access/session",&credentials,"").await;
    let session:Value = serde_json::from_str(&session.2).unwrap();
    let csrf = session["csrf"].as_str().unwrap();
    let signed = format!("{scope}{origin}X-Vaultor-CSRF: {csrf}\r\n");
    let collection = worker.call(Request::CreateCollection { name: "Browser collection".into(), parent_id: None }).await.unwrap();
    let create = format!("{browser}/note-creates/{}", Uuid::new_v4());
    let input = json!({"title":"New browser note","collection":collection["id"]}).to_string();
    assert_eq!(request(&client,address,"PUT",&create,&format!("{scope}{origin}"),&input).await.0,403);
    let missing = json!({"title":"New browser note","collection":Uuid::new_v4()}).to_string();
    assert_eq!(request(&client,address,"PUT",&create,&signed,&missing).await.0,409);
    let (initial, retry) = tokio::join!(
        request(&client,address,"PUT",&create,&signed,&input),
        request(&client,address,"PUT",&create,&signed,&input),
    );
    assert_eq!(initial.0,200);
    assert_eq!((retry.0,&retry.2),(200,&initial.2));
    let receipt: Value = serde_json::from_str(&initial.2).unwrap();
    let created = worker.call(Request::Read { id: receipt["id"].as_str().unwrap().into() }).await.unwrap();
    assert_eq!(created["title"], "New browser note");
    assert_eq!(created["collections"], json!([collection["id"]]));
    let destination = worker.call(Request::CreateCollection { name: "Destination".into(), parent_id: None }).await.unwrap();
    let organization = format!("{browser}/resources/{}/organization", receipt["id"].as_str().unwrap());
    let pin = json!({"operation":"pin","revision":1,"value":true}).to_string();
    assert_eq!(request(&client,address,"PUT",&organization,&format!("{scope}{origin}"),&pin).await.0,403);
    let foreign = signed.replace(&host.workspace.to_string(), &Uuid::new_v4().to_string());
    assert_eq!(request(&client,address,"PUT",&organization,&foreign,&pin).await.0,403);
    assert_eq!(request(&client,address,"PUT",&organization,&signed,&pin.replace("\"revision\":1","\"revision\":2")).await.0,409);
    let call_org = |route: String, input: Value, signed: String| {
        let client = &client;
        async move { request(client,address,"PUT",&route,&signed,&input.to_string()).await }
    };
    let make = format!("{browser}/organization/collections/{}",Uuid::new_v4());
    let input_collection = json!({"operation":"create","name":"Nested","parentId":collection["id"]});
    assert_eq!(call_org(make.clone(),input_collection.clone(),foreign.clone()).await.0,403);
    let nested = call_org(make.clone(),input_collection.clone(),signed.clone()).await;
    assert_eq!(nested.0,200,"{}",nested.2);
    assert_eq!(call_org(make.clone(),input_collection,signed.clone()).await.2,nested.2);
    assert_eq!(call_org(make,json!({"operation":"create","name":"Conflicting collection"}),signed.clone()).await.0,409);
    let nested: Value = serde_json::from_str(&nested.2).unwrap();
    let nest = format!("{browser}/organization/collections/{}",nested["id"].as_str().unwrap());
    let update = json!({"operation":"update","name":"Renamed child","parentId":destination["id"],"expectedName":"Nested","expectedParentId":collection["id"]});
    assert_eq!(call_org(nest.clone(),update.clone(),signed.clone()).await.0,200);
    let mut stale = update;
    stale["name"] = json!("Stale child name");
    assert_eq!(call_org(nest.clone(),stale,signed.clone()).await.0,409);
    let tag_endpoint = format!("{browser}/organization/tags");
    let color = "#5887ee";
    let one = call_org(tag_endpoint.clone(),json!({"operation":"create","name":"Research","color":color}),signed.clone()).await;
    assert_eq!(one.0,200);
    let same = call_org(tag_endpoint.clone(),json!({"operation":"create","name":"research","color":color}),signed.clone()).await;
    assert_eq!(same.2,one.2);
    let tag_id: Value = serde_json::from_str::<Value>(&one.2).unwrap()["id"].clone();
    let assign = json!({"operation":"tag","revision":1,"tag":tag_id,"value":true});
    assert_eq!(call_org(organization.clone(),assign,signed.clone()).await.0,200);
    let filtered = request(&client,address,"GET",&format!("{browser}/resources?tag={}",tag_id.as_str().unwrap()),&scope,"").await;
    assert!(filtered.2.contains(receipt["id"].as_str().unwrap()),"{}",filtered.2);
    assert_eq!(call_org(tag_endpoint.clone(),json!({"operation":"update","id":tag_id,"name":"Archive","color":color,"expectedName":"Research","expectedColor":color}),signed.clone()).await.0,200);
    assert_eq!(call_org(tag_endpoint,json!({"operation":"delete","id":tag_id,"expectedName":"Archive","expectedColor":color}),signed.clone()).await.0,200);
    let reviewed = call_org(nest.clone(),json!({"operation":"reviewDeletion"}),signed.clone()).await;
    let reviewed: Value = serde_json::from_str(&reviewed.2).unwrap();
    let delete = json!({"operation":"delete","review":reviewed["review"],"trash":false});
    assert_eq!(call_org(nest.clone(),delete.clone(),foreign.clone()).await.0,403);
    assert_eq!(call_org(nest.clone(),delete.clone(),signed.clone()).await.0,200);
    assert_eq!(call_org(nest,delete,signed.clone()).await.0,200);
    for _ in 0..2 {
        let response = request(&client,address,"PUT",&organization,&signed,&pin).await;
        assert_eq!(response.0,200,"{}",response.2);
        assert_eq!(serde_json::from_str::<Value>(&response.2).unwrap()["favorite"],true);
    }
    let add = json!({"operation":"membership","revision":1,"collection":destination["id"],"value":true}).to_string();
    assert_eq!(request(&client,address,"PUT",&organization,&signed,&add).await.0,200);
    let move_note = json!({"operation":"move","revision":1,"from":collection["id"],"to":destination["id"]}).to_string();
    for _ in 0..2 {
        let response = request(&client,address,"PUT",&organization,&signed,&move_note).await;
        assert_eq!(response.0,200,"{}",response.2);
        assert_eq!(serde_json::from_str::<Value>(&response.2).unwrap()["collections"][0]["id"],destination["id"]);
    }
    let remove = add.replace("\"value\":true","\"value\":false");
    assert_eq!(request(&client,address,"PUT",&organization,&signed,&remove).await.0,200);
    let trash = json!({"operation":"trash","revision":1,"value":true}).to_string();
    assert_eq!(request(&client,address,"PUT",&organization,&signed,&trash).await.0,200);
    let trash_list = request(&client,address,"GET",&format!("{browser}/resources/trash"),&scope,"").await;
    assert_eq!(trash_list.0,200);
    assert!(trash_list.2.contains(receipt["id"].as_str().unwrap()));
    let restore = trash.replace("\"value\":true","\"value\":false");
    assert_eq!(request(&client,address,"PUT",&organization,&signed,&restore).await.0,200);
    let rename = json!({"operation":"rename","revision":1,"title":"Renamed in browser"}).to_string();
    let renamed = request(&client,address,"PUT",&organization,&signed,&rename).await;
    assert_eq!(renamed.0,200);
    assert_eq!(serde_json::from_str::<Value>(&renamed.2).unwrap()["revision"],"2");
    assert_eq!(request(&client,address,"PUT",&organization,&signed,&rename).await.0,409);
    assert_eq!(request(&client,address,"PUT",&create,&signed,&input.replace("New browser note","Different note")).await.0,409);
    assert_eq!(request(&client,address,"PUT",&edit,&signed,&body).await.0,200);
    assert_eq!(request(&client,address,"PUT",&edit,&signed,&body).await.0,409);
    worker.call(Request::Draft { id:id.into(), base_revision:2, token:Uuid::new_v4().to_string(), sequence:1,
        title:"Protected desktop draft".into(), content:json!({"type":"doc","content":[]}) }).await.unwrap();
    assert_eq!(request(&client,address,"PUT",&edit,&signed,&body.replace("\"revision\":1","\"revision\":2")).await.0,409);
    assert!(!request(&client,address,"GET",&note,&credentials,"").await.2.contains("Protected desktop draft"));
    let blocked = trash.replace("\"revision\":1","\"revision\":2");
    assert_eq!(request(&client,address,"PUT",&format!("{note}/organization"),&signed,&blocked).await.0,409);
    let blocked = rename.replace("\"revision\":1","\"revision\":2");
    assert_eq!(request(&client,address,"PUT",&format!("{note}/organization"),&signed,&blocked).await.0,409);
    host.owner_command(&format!("withdraw {device}")).unwrap();
    assert_eq!(request(&client,address,"PUT",&create,&signed,&input).await.0,403);
    assert_eq!(request(&client,address,"PUT",&organization,&signed,&pin).await.0,403);
    assert_eq!(request(&client,address,"GET",&note,&credentials,"").await.0,403);
    assert_eq!(request(&client,address,"POST","/api/access/logout",&signed,"{}").await.0,204);
    assert_eq!(request(&client,address,"GET","/api/access/session",&credentials,"").await.0,401);
    listener.stop().await.unwrap();
    worker.stop();
}

#[tokio::test]
async fn mobile_projection_keeps_saved_revisions_and_checkpoint_authority() {
    let fixture = Fixture::new();
    let identity = Identity::open(&fixture.access, &fixture.ca).unwrap();
    let worker = Worker::start(fixture.root.clone(), None).unwrap();
    let collection = worker.call(Request::CreateCollection { name: "Mobile library".into(), parent_id: None }).await.unwrap();
    let note = worker.call(Request::CreateNote { title: "Visible note".into(), collection: Some(collection["id"].as_str().unwrap().into()) }).await.unwrap();
    let note_id = note["id"].as_str().unwrap();
    let worker_storage = worker.storage();
    let file_id = Uuid::new_v4().to_string();
    let file = file_id.clone();
    worker_storage.call_host(&fixture.root,move |ws| {
        use sha2::{Digest, Sha256};
        std::fs::create_dir_all(ws.root.join("managed")).unwrap();
        std::fs::write(ws.new_media_path(&file)?, b"retained bytes").unwrap();
        ws.attach_metadata(file, "retained.txt".into(), 14, hex::encode(Sha256::digest(b"retained bytes")))
    }).await.unwrap();
    let host = Host::new(worker_storage, fixture.root.clone(), identity).await.unwrap();
    let workspace = host.workspace;
    let listener = host.clone().listen("127.0.0.1:0".parse().unwrap(), fixture.chain.clone(), fixture.key.clone()).await.unwrap();
    let client = connector(Some(fixture.authority.clone()));
    let address = listener.address();
    let enroll = |nonce: char| json!({"name":"Vaultor Android","kind":"desktop","nonce":nonce.to_string().repeat(64),"fingerprint":host.fingerprint()}).to_string();
    async fn approve(host: &Host, client: &TlsConnector, address: SocketAddr, enrollment: &str) -> (String,String) {
        let pending = request(client,address,"POST","/api/pairings","",enrollment).await;
        assert_eq!(pending.0,200);
        let p:Value=serde_json::from_str(&pending.2).unwrap();
        let id=p["id"].as_str().unwrap();
        let code=p["code"].as_str().unwrap();
        host.owner_command(&format!("approve {id} {code}")).unwrap();
        let response=request(client,address,"POST",&format!("/api/pairings/{id}/complete"),
            &format!("X-Vaultor-Pairing: {}\r\n",p["secret"].as_str().unwrap()),"{}").await;
        assert_eq!(response.0,200);
        let receipt:Value=serde_json::from_str(&response.2).unwrap();
        (receipt["deviceId"].as_str().unwrap().to_owned(),format!("Authorization: Bearer {}\r\n",receipt["credential"].as_str().unwrap()))
    }
    let (device,auth)=approve(&host,&client,address,&enroll('c')).await;
    let (other,other_auth)=approve(&host,&client,address,&enroll('d')).await;
    let prefix="/api/next/mobile/v1";
    let route=|path:&str|format!("{prefix}{path}");
    let call=|method:&'static str,path:String,headers:String,body:String| {
        let client=&client;
        async move {request(client,address,method,&path,&headers,&body).await}
    };
    let workspace_path=route("/workspace/identity");
    assert_eq!(call("GET",workspace_path.clone(),"".into(),"".into()).await.0,401);
    let empty=call("GET",route("/workspaces"),auth.clone(),"".into()).await;
    assert_eq!((empty.0,empty.2.as_str()),(200,"[]"));
    assert_eq!(call("GET",workspace_path.clone(),auth.clone(),"".into()).await.0,403);
    host.owner_command(&format!("grant {device}")).unwrap();
    host.owner_command(&format!("grant {other}")).unwrap();
    assert_eq!(call("GET",workspace_path.clone(),format!("{auth}X-Vaultor-Workspace: {}\r\n",Uuid::new_v4()),"".into()).await.0,403);
    let res=call("GET",route(&format!("/resources/{note_id}")),auth.clone(),"".into()).await;
    assert_eq!(res.0,200);
    let saved:Value=serde_json::from_str(&res.2).unwrap();
    assert_eq!(saved["content"]["type"],"doc");
    assert_eq!(saved["revision"],"1");
    assert_eq!(saved["collections"][0]["id"],collection["id"]);
    let groups=call("GET",route("/collections?size=1"),auth.clone(),"".into()).await;
    assert_eq!(groups.0,200);
    assert!(groups.2.contains("Mobile library"));
    let search=call("GET",route("/resources/query?q=retained.txt&type=file"),auth.clone(),"".into()).await;
    assert_eq!(search.0,200);
    assert!(search.2.contains(&file_id));

    let checkpoint_id=Uuid::new_v4();
    let checkpoint=route(&format!("/companions/{checkpoint_id}"));
    let selection=json!({"generation":workspace,"scope":"resources","ids":[note_id,file_id],"dependencies":"images","files":"readable"});
    let prepared=call("PUT",checkpoint.clone(),auth.clone(),selection.to_string()).await;
    assert_eq!(prepared.0,200,"{}",prepared.2);
    let ready:Value=serde_json::from_str(&prepared.2).unwrap();
    assert_eq!(ready["resources"],2);
    let pin=ready["manifestSha256"].as_str().unwrap();
    assert_eq!(call("GET",checkpoint.clone(),other_auth.clone(),"".into()).await.0,404);
    let inventory=format!("{checkpoint}/inventory?page=0&size=25");
    assert_eq!(call("GET",inventory.clone(),auth.clone(),"".into()).await.0,412);
    let pinned=format!("{auth}If-Match: \"{pin}\"\r\n");
    assert_eq!(call("GET",inventory,pinned.clone(),"".into()).await.0,200);
    let bin=format!("{checkpoint}/payloads/{file_id}.bin");
    let range=call("GET",bin.clone(),format!("{pinned}Range: bytes=9-\r\n"),"".into()).await;
    assert_eq!((range.0,range.2.as_str()),(206,"bytes"));
    let content = json!({"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"New saved revision"}]}]});
    worker.call(Request::Save { id:note_id.into(),revision:1,title:"Visible note".into(),content,proof:None }).await.unwrap();
    let retained=call("GET",format!("{checkpoint}/payloads/{note_id}.json"),pinned.clone(),"".into()).await;
    assert_eq!(retained.0,200);
    assert!(!retained.2.contains("New saved revision"));

    let operation=Uuid::new_v4();
    let review_path=route(&format!("/reviews/{operation}/{note_id}"));
    let input=json!({"generation":workspace,"resourceId":note_id,"baseRevision":"1",
        "comment":"Captured earlier","quote":"","context":"","locator":{"kind":"resource"}});
    let sent=call("PUT",review_path.clone(),auth.clone(),input.to_string()).await;
    assert_eq!(sent.0,200,"{}",sent.2);
    assert_eq!(sent.2,call("PUT",review_path.clone(),auth.clone(),input.to_string()).await.2);
    assert_eq!(call("GET",review_path,other_auth.clone(),"".into()).await.0,404);

    let export_id = Uuid::new_v4();
    let export = route(&format!("/companions/exports/{export_id}"));
    let format = json!({"generation":workspace,"scope":"note","format":"md","depth":0,"ids":[note_id]});
    assert_eq!(call("PUT",export.clone(),String::new(),format.to_string()).await.0,401);
    assert_eq!(call("PUT",export.clone(),auth.clone(),format.to_string()).await.0,200);
    let status = format!("{export}?generation={workspace}");
    assert_eq!(call("GET",status.clone(),other_auth.clone(),String::new()).await.0,404);
    let mut result = Value::Null;
    for _ in 0..32 {
        let response = call("GET",status.clone(),auth.clone(),String::new()).await;
        assert_eq!(response.0,200);
        result = serde_json::from_str(&response.2).unwrap();
        if result["operation"]["status"] != "RUNNING" { break; }
        tokio::time::sleep(Duration::from_millis(100)).await;
    }
    assert_eq!(result["operation"]["status"],"SUCCEEDED","{result}");
    assert_eq!(call("PUT",export.clone(),auth.clone(),format.to_string()).await.0,200);
    assert_eq!(call("PUT",export.clone(),auth.clone(),format.to_string().replace("\"md\"","\"pdf\"")).await.0,409);
    let derivative = format!("{export}/download?generation={workspace}");
    let file = call("GET",derivative.clone(),auth.clone(),String::new()).await;
    assert_eq!(file.0,200);
    assert!(file.2.contains("New saved revision"));
    assert!(!file.2.contains("Captured earlier"));

    for (targets, review_expected) in [(vec![note_id], true), (vec![file_id.as_str()], false)] {
        let export = route(&format!("/companions/exports/{}", Uuid::new_v4()));
        let intent = json!({"generation":workspace,"scope":"resources","format":"partial","depth":0,"ids":targets}).to_string();
        assert_eq!(call("PUT",export.clone(),auth.clone(),intent.clone()).await.0,200);
        let status = format!("{export}?generation={workspace}");
        let mut result = Value::Null;
        for _ in 0..32 {
            let response = call("GET",status.clone(),auth.clone(),String::new()).await;
            assert_eq!(response.0,200);
            result = serde_json::from_str(&response.2).unwrap();
            if result["operation"]["status"] == "SUCCEEDED" { break; }
            assert_ne!(result["operation"]["status"],"FAILED","{result}");
            tokio::time::sleep(Duration::from_millis(100)).await;
        }
        assert_eq!(result["operation"]["status"],"SUCCEEDED","{result}");
        assert_eq!(call("PUT",export.clone(),auth.clone(),intent).await.0,200);
        let download = format!("{export}/download?generation={workspace}");
        assert_eq!(call("GET",download.clone(),other_auth.clone(),String::new()).await.0,404);
        use sha2::{Digest, Sha256};
        let payload = request_bytes(&client,address,"GET",&download,&auth,"").await;
        assert_eq!(payload.0,200);
        assert_eq!(format!("{:x}",Sha256::digest(&payload.2)),result["sha256"].as_str().unwrap());
        assert_eq!(&payload.2[..8],b"VAULTOR1");
        let manifest_end = 48 + u64::from_le_bytes(payload.2[8..16].try_into().unwrap()) as usize;
        let manifest: Value = serde_json::from_slice(&payload.2[48..manifest_end]).unwrap();
        assert_eq!(manifest["reviews"].as_array().map_or(0, Vec::len),usize::from(review_expected));
        if review_expected {
            let review = &manifest["reviews"][0];
            assert_eq!(review["evidence"]["id"],operation.to_string());
            assert_eq!(review["evidence"]["resourceId"],note_id);
            assert_eq!(review["evidence"]["comment"],"Captured earlier");
            assert_eq!(review["evidence"]["baseRevision"],1);
            assert!(!manifest.to_string().contains(auth.trim().trim_start_matches("Authorization: Bearer ")));
        }
    }
    host.owner_command(&format!("withdraw {device}")).unwrap();
    assert_eq!(call("GET",derivative,auth.clone(),String::new()).await.0,403);
    assert_eq!(call("GET",bin,pinned,"".into()).await.0,403);
    host.owner_command(&format!("revoke {device}")).unwrap();
    assert_eq!(call("GET",workspace_path,auth,"".into()).await.0,401);
    listener.stop().await.unwrap();
    worker.stop();
}

#[cfg(all(windows, feature = "desktop"))]
#[tokio::test]
async fn managed_identity_survives_leaf_rotation_and_refuses_damaged_keys() {
    use rustls::pki_types::UnixTime;
    use time::OffsetDateTime;

    let fixture = tempfile::tempdir().unwrap();
    let access = fixture.path().join("access");
    let root = fixture.path().join("workspace");
    let (identity, authority) = Authority::open(&access).unwrap();
    let id = identity.id;
    let trusted = identity.certificate.clone();
    let fingerprint = identity.fingerprint.clone();
    let worker = Worker::start(root.clone(), None).unwrap();
    worker.call(Request::Snapshot).await.unwrap();
    let host = Host::new(worker.storage(), root, identity).await.unwrap();
    let ip = "127.0.0.1".parse().unwrap();
    let now = OffsetDateTime::now_utc();
    let (first, first_key, expires) = authority.as_ref().unwrap().issue(ip, now).unwrap();
    let time_at = |time: OffsetDateTime| {
        UnixTime::since_unix_epoch(Duration::from_secs(time.unix_timestamp() as u64))
    };
    assert!(!Authority::needs_renewal(expires, now));
    assert!(Authority::needs_renewal(
        expires,
        expires - time::Duration::days(7)
    ));
    assert!(host
        .tls_config(ip, first.clone(), first_key.clone_key(), time_at(now))
        .is_ok());
    assert!(host
        .tls_config(
            ip,
            first.clone(),
            first_key,
            time_at(expires + time::Duration::hours(1))
        )
        .is_err());
    let next_ip = "127.0.0.2".parse().unwrap();
    let next_time = expires - time::Duration::days(7);
    let (second, second_key, next_expiry) = authority
        .as_ref()
        .unwrap()
        .issue(next_ip, next_time)
        .unwrap();
    assert_eq!(first[1], second[1]);
    assert_ne!(first[0], second[0]);
    assert!(next_expiry > expires);
    assert!(host
        .tls_config(
            ip,
            second.clone(),
            second_key.clone_key(),
            time_at(next_time)
        )
        .is_err());
    assert!(host
        .tls_config(next_ip, second, second_key, time_at(next_time))
        .is_ok());

    let listener = host
        .clone()
        .listen_automatic("127.0.0.1:0".parse().unwrap(), authority.unwrap())
        .await
        .unwrap();
    let client = connector(Some(trusted));
    let response = request(
        &client,
        listener.address(),
        "GET",
        "/api/access/host",
        "",
        "",
    )
    .await;
    assert_eq!(response.0, 200);
    assert!(response.2.contains(&fingerprint));
    listener.stop().await.unwrap();
    drop(host);

    let (reopened, _) = Authority::open(&access).unwrap();
    assert_eq!(reopened.id, id);
    assert_eq!(reopened.fingerprint, fingerprint);
    drop(reopened);
    let key = access.join("authority.dpapi");
    std::fs::write(&key, b"damaged").unwrap();
    assert!(Authority::open(&access).is_err());
    assert_eq!(std::fs::read(key).unwrap(), b"damaged");
}

struct Fixture {
    _dir: tempfile::TempDir,
    access: PathBuf,
    root: PathBuf,
    ca: PathBuf,
    chain: PathBuf,
    key: PathBuf,
    authority: CertificateDer<'static>,
}

fn tls_fixture(path: &Path) -> (PathBuf, PathBuf, PathBuf, CertificateDer<'static>) {
    let mut ca = CertificateParams::new(Vec::new()).unwrap();
    ca.is_ca = IsCa::Ca(BasicConstraints::Constrained(0));
    ca.key_usages = vec![KeyUsagePurpose::KeyCertSign, KeyUsagePurpose::CrlSign];
    let authority = CertifiedIssuer::self_signed(ca, KeyPair::generate().unwrap()).unwrap();
    let mut params = CertificateParams::new(vec!["127.0.0.1".into()]).unwrap();
    params.extended_key_usages = vec![ExtendedKeyUsagePurpose::ServerAuth];
    let key = KeyPair::generate().unwrap();
    let leaf = params.signed_by(&key, &authority).unwrap();
    let ca = path.join("ca.pem");
    let chain = path.join("chain.pem");
    let server_key = path.join("server-key.pem");
    std::fs::write(&ca, authority.pem()).unwrap();
    std::fs::write(&chain, format!("{}{}", leaf.pem(), authority.pem())).unwrap();
    std::fs::write(&server_key, key.serialize_pem()).unwrap();
    (ca, chain, server_key, authority.der().clone())
}

impl Fixture {
    fn new() -> Self {
        let dir = tempfile::tempdir().unwrap();
        let access = dir.path().join("access");
        let root = dir.path().join("workspace");
        std::fs::create_dir(&access).unwrap();
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            std::fs::set_permissions(&access, std::fs::Permissions::from_mode(0o700)).unwrap();
        }
        let (ca, chain, key, authority) = tls_fixture(dir.path());
        Identity::initialize(&access, &ca).unwrap();
        Self {
            _dir: dir,
            access,
            root,
            ca,
            chain,
            key,
            authority,
        }
    }
}

fn connector(cert: Option<CertificateDer<'static>>) -> TlsConnector {
    let mut roots = RootCertStore::empty();
    if let Some(cert) = cert {
        roots.add(cert).unwrap();
    }
    TlsConnector::from(Arc::new(
        ClientConfig::builder_with_provider(Arc::new(rustls::crypto::ring::default_provider()))
            .with_safe_default_protocol_versions()
            .unwrap()
            .with_root_certificates(roots)
            .with_no_client_auth(),
    ))
}

async fn request(
    client: &TlsConnector,
    address: SocketAddr,
    method: &str,
    path: &str,
    headers: &str,
    body: &str,
) -> (u16, String, String) {
    let (status, head, body) = request_bytes(client,address,method,path,headers,body).await;
    (status, head, String::from_utf8(body).unwrap())
}

async fn request_bytes(
    client: &TlsConnector,
    address: SocketAddr,
    method: &str,
    path: &str,
    headers: &str,
    body: &str,
) -> (u16, String, Vec<u8>) {
    request_body(client,address,method,path,headers,"application/json",body.as_bytes()).await
}

async fn request_body(
    client: &TlsConnector, address: SocketAddr, method: &str, path: &str, headers: &str,
    content_type: &str, body: &[u8],
) -> (u16, String, Vec<u8>) {
    tokio::time::timeout(Duration::from_secs(8), async {
        let socket = TcpStream::connect(address).await.unwrap();
        let mut client = client.connect(address.ip().into(), socket).await.unwrap();
        client.write_all(format!(
            "{method} {path} HTTP/1.1\r\nHost: {address}\r\nConnection: close\r\nContent-Type: {content_type}\r\nContent-Length: {}\r\n{headers}\r\n", body.len(),
        ).as_bytes()).await.unwrap();
        client.write_all(body).await.unwrap();
        let mut bytes = Vec::new();
        client.read_to_end(&mut bytes).await.unwrap();
        let separator = bytes.windows(4).position(|slice| slice == b"\r\n\r\n").unwrap();
        let head = std::str::from_utf8(&bytes[..separator]).unwrap();
        let status = head.split_whitespace().nth(1).unwrap().parse().unwrap();
        (status, head.to_owned(), bytes.split_off(separator + 4))
    }).await.unwrap()
}

#[tokio::test]
async fn collected_zip_survives_restart_and_publishes_only_after_exact_owner_review() {
    use sha2::{Digest, Sha256};
    let fixture = Fixture::new();
    let worker = Worker::start(fixture.root.clone(), None).unwrap();
    worker.call(Request::Snapshot).await.unwrap();
    let start = || async {
        let identity = Identity::open(&fixture.access, &fixture.ca).unwrap();
        let host = Host::new(worker.storage(), fixture.root.clone(), identity).await.unwrap();
        let listener = host.clone().listen("127.0.0.1:0".parse().unwrap(), fixture.chain.clone(), fixture.key.clone()).await.unwrap();
        (host,listener)
    };
    let (host, listener) = start().await;
    let client = connector(Some(fixture.authority.clone()));
    let device = Uuid::new_v4();
    let token = access::new_credential().unwrap();
    access::add(&fixture.access,&token,&access::Record {
        workspaces:[host.workspace].into(),device,label:"ZIP fixture".into(),browser_expires:None,
    }).unwrap();
    let headers = format!("Authorization: Bearer {token}\r\nX-Vaultor-Workspace: {}\r\n",host.workspace);
    let zip = include_bytes!("../../fixtures/electron-workspace-v5.zip");
    let id = Uuid::new_v4();
    let path = |id| format!("/api/next/mobile/v1/collected-zips/{id}");
    let intent = json!({"hostId":host.host_id(),"workspaceId":host.workspace,"generation":host.workspace,
        "filename":"fixture.zip","sha256":hex::encode(Sha256::digest(zip)),"bytes":zip.len(),"name":"Independent fixture"});
    let multipart = |intent: &Value, bytes: &[u8]| {
        let mut body = format!("--vaultor-zip\r\nContent-Disposition: form-data; name=\"intent\"\r\n\r\n{intent}\r\n--vaultor-zip\r\nContent-Disposition: form-data; name=\"file\"; filename=\"fixture.zip\"\r\n\r\n").into_bytes();
        body.extend_from_slice(bytes);
        body.extend_from_slice(b"\r\n--vaultor-zip--\r\n");
        body
    };
    let upload = |address, id, auth: String, body: Vec<u8>| {
        let client = &client;
        async move {
            request_body(client,address,"PUT",&path(id),&auth,"multipart/form-data; boundary=vaultor-zip",&body).await
        }
    };
    let result = |response: (u16,String,Vec<u8>)| -> Value {
        assert_eq!(response.0,200,"{}",String::from_utf8_lossy(&response.2));
        serde_json::from_slice(&response.2).unwrap()
    };
    let address = listener.address();
    assert_eq!(upload(address,id,String::new(),multipart(&intent,zip)).await.0,401);
    assert_eq!(upload(address,id,headers.clone(),multipart(&intent,&zip[..24])).await.0,400);
    assert!(request(&client,address,"GET",&path(id),&headers,"").await.2.contains("RECEIVING"));
    listener.stop().await.unwrap();
    drop(host);
    let (host, listener) = start().await;
    let address = listener.address();
    let accepted = result(upload(address,id,headers.clone(),multipart(&intent,zip)).await);
    assert_eq!(accepted["state"],"AWAITING_OWNER");
    assert!(accepted.get("destination").is_none());
    let mut changed = intent.clone();
    changed["name"] = json!("Different request");
    assert_eq!(upload(address,id,headers.clone(),multipart(&changed,zip)).await.0,409);
    assert_eq!(result(upload(address,id,headers.clone(),multipart(&intent,zip)).await),accepted);
    let destination = fixture.root.parent().unwrap().join("restored");
    assert!(host.workspace_zip_owner("approve",Some(id),Some(destination.clone())).is_err());
    assert!(!destination.exists());
    let cancel_id = Uuid::new_v4();
    result(upload(address,cancel_id,headers.clone(),multipart(&intent,zip)).await);
    assert!(request(&client,address,"DELETE",&path(cancel_id),&headers,"").await.2.contains("CANCELLED"));
    assert!(host.workspace_zip_owner("approve",Some(cancel_id),Some(destination.clone())).is_err());
    let reject_id = Uuid::new_v4();
    result(upload(address,reject_id,headers.clone(),multipart(&intent,zip)).await);
    host.workspace_zip_owner("reject",Some(reject_id),None).unwrap();
    assert_eq!(result(upload(address,reject_id,headers.clone(),multipart(&intent,zip)).await)["state"],"REJECTED");
    assert_eq!(host.workspace_zip_owner("preview",Some(id),None).unwrap()["state"],"PREVIEWED");
    host.owner_command(&format!("withdraw {device}")).unwrap();
    assert!(host.workspace_zip_owner("approve",Some(id),Some(destination.clone())).is_err());
    assert_eq!(upload(address,id,headers.clone(),multipart(&intent,zip)).await.0,403);
    host.owner_command(&format!("grant {device}")).unwrap();
    listener.stop().await.unwrap();
    drop(host);
    let (host, listener) = start().await;
    let address = listener.address();
    assert_eq!(host.workspace_zip_owner("approve",Some(id),Some(destination.clone())).unwrap()["state"],"APPROVED");
    let mut complete = Value::Null;
    for _ in 0..80 {
        let response = request(&client,address,"GET",&path(id),&headers,"").await;
        complete = serde_json::from_str(&response.2).unwrap();
        if complete["state"] == "SUCCEEDED" {break;}
        assert_ne!(complete["state"],"FAILED","{complete}");
        tokio::time::sleep(Duration::from_millis(25)).await;
    }
    assert_eq!(complete["destinationWorkspaceId"],id.to_string());
    assert_eq!(host.workspace_zip_owner("approve",Some(id),None).unwrap()["state"],"SUCCEEDED");
    let restored = crate::domain::Workspace::open_existing(&destination).unwrap();
    assert_eq!(restored.review_generation().unwrap(),id.to_string());
    let file: String = restored.db.query_row("SELECT resource_id FROM managed_originals",[],|r|r.get(0)).unwrap();
    let original = crate::transfers::original_path(&destination,&file).unwrap();
    let bytes = std::fs::read(original).unwrap();
    assert_eq!(bytes,b"unchanged-original");
    drop(restored);
    assert_eq!(result(upload(address,id,headers,multipart(&intent,zip)).await), complete);
    listener.stop().await.unwrap();
    worker.stop();
}

#[tokio::test]
async fn loopback_owner_handoff_is_single_use_expiring_and_connector_bound() {
    let fixture = Fixture::new();
    let identity = Identity::open(&fixture.access, &fixture.ca).unwrap();
    let worker = Worker::start(fixture.root.clone(), None).unwrap();
    worker.call(Request::Snapshot).await.unwrap();
    let host = Host::new(worker.storage(),fixture.root.clone(),identity).await.unwrap();
    let listener = host.clone().listen("127.0.0.1:0".parse().unwrap(),fixture.chain.clone(),fixture.key.clone()).await.unwrap();
    let open = || async {
        let url = host.owner_browser_url().await.unwrap();
        let (address, token) = url.strip_prefix("http://").unwrap().split_once("/access#ticket=").unwrap();
        (address.parse::<SocketAddr>().unwrap(),json!({"ticket":token}).to_string())
    };
    async fn local(address: SocketAddr, method: &str, path: &str, headers: &str, body: &str) -> (u16,String,String) {
        let mut stream = TcpStream::connect(address).await.unwrap();
        stream.write_all(format!("{method} {path} HTTP/1.1\r\nHost: {address}\r\nConnection: close\r\nContent-Type: application/json\r\nContent-Length: {}\r\n{headers}\r\n{body}",body.len()).as_bytes()).await.unwrap();
        let mut text = String::new();
        stream.read_to_string(&mut text).await.unwrap();
        let (head,body)=text.split_once("\r\n\r\n").unwrap();
        (head.split_whitespace().nth(1).unwrap().parse().unwrap(),head.into(),body.into())
    }
    let (address, cancelled) = open().await;
    assert!(address.ip().is_loopback());
    let bootstrap="/api/access/bootstrap";
    let origin=format!("Origin: http://{address}\r\n");
    host.cancel_owner_browser(false).unwrap();
    assert_eq!(local(address,"POST",bootstrap,&origin,&cancelled).await.0,401);
    let (_,expired)=open().await;
    host.owner_browser.expire_pending();
    assert_eq!(local(address,"POST",bootstrap,&origin,&expired).await.0,401);
    let (_,ticket)=open().await;
    assert_eq!(local(address,"POST",bootstrap,"Origin: https://example.invalid\r\n",&ticket).await.0,403);
    let client=connector(Some(fixture.authority.clone()));
    assert_ne!(request(&client,listener.address(),"POST",bootstrap,"",&ticket).await.0,200);
    let (one,two)=tokio::join!(local(address,"POST",bootstrap,&origin,&ticket),local(address,"POST",bootstrap,&origin,&ticket));
    assert!(matches!((one.0,two.0),(200,401)|(401,200)));
    let accepted=if one.0==200 {one} else {two};
    let cookie=accepted.1.lines().find_map(|line|line.strip_prefix("set-cookie: ")).unwrap();
    assert!(cookie.contains("HttpOnly")&&cookie.contains("SameSite=Strict"));
    let name_value=cookie.split(';').next().unwrap();
    let credentials=format!("Cookie: {name_value}\r\n");
    let auth=local(address,"GET","/api/access/session",&credentials,"").await;
    assert_eq!(auth.0,200);
    let state:Value=serde_json::from_str(&auth.2).unwrap();
    assert_eq!(state["role"],"OWNER");
    assert_eq!(local(address,"GET","/api/owner/pairings",&credentials,"").await.0,200);
    assert_eq!(local(address,"GET","/api/next/browser/v1/workspaces",&credentials,"").await.0,200);
    let internal=format!("Authorization: {}{}\r\n",owner_browser::INTERNAL_AUTH,name_value.split_once('=').unwrap().1);
    assert_eq!(request(&client,listener.address(),"GET","/api/next/mobile/v1/workspaces",&internal,"").await.0,403);
    assert_eq!(local(address,"POST","/api/access/logout",&format!("{credentials}{origin}"),"").await.0,403);
    let signed=format!("{credentials}{origin}X-Vaultor-CSRF: {}\r\n",state["csrf"].as_str().unwrap());
    assert_eq!(local(address,"POST","/api/access/logout",&signed,"").await.0,204);
    assert_eq!(local(address,"GET","/api/access/session",&credentials,"").await.0,401);
    if let Some(executable) = std::env::var_os("VAULTOR_BENCH_CHROMIUM") {
        let url = host.owner_browser_url().await.unwrap();
        let profile = tempfile::tempdir().unwrap();
        let output = tokio::task::spawn_blocking(move || {
            std::process::Command::new(executable)
                .args(["--headless", "--disable-gpu", "--no-first-run", "--disable-extensions",
                    "--disable-background-networking", "--virtual-time-budget=6000", "--dump-dom"])
                .arg(format!("--user-data-dir={}",profile.path().display()))
                .arg(url).output()
        }).await.unwrap().unwrap();
        assert!(output.status.success());
        assert!(String::from_utf8_lossy(&output.stdout).contains("Owner browser connected."));
    }
    listener.stop().await.unwrap();
    worker.stop();
}

#[tokio::test]
async fn tls_pairing_scope_saved_reads_review_and_restart() {
    let fixture = Fixture::new();
    let identity = Identity::open(&fixture.access, &fixture.ca).unwrap();
    let host_id = identity.id;
    assert!(Identity::open(&fixture.access, &fixture.ca).is_err());
    let worker = Worker::start(fixture.root.clone(), None).unwrap();
    let note = worker
        .call(Request::CreateNote {
            title: "Saved title".into(),
            collection: None,
        })
        .await
        .unwrap();
    let id = note["id"].as_str().unwrap().to_owned();
    worker
        .call(Request::Draft {
            id: id.clone(),
            base_revision: 1,
            token: Uuid::new_v4().to_string(),
            sequence: 1,
            title: "Protected draft".into(),
            content: json!({"type":"doc","content":[]}),
        })
        .await
        .unwrap();
    assert!(crate::domain::Workspace::open(&fixture.root).is_err());
    let file_id = Uuid::new_v4().to_string();
    let asset = file_id.clone();
    worker
        .storage()
        .call_host(&fixture.root, move |ws| {
            std::fs::create_dir_all(ws.root.join("managed")).unwrap();
            std::fs::write(ws.new_media_path(&asset)?, b"0123456789").unwrap();
            use sha2::{Digest, Sha256};
            ws.attach_metadata(
                asset,
                "sample.bin".into(),
                10,
                hex::encode(Sha256::digest(b"0123456789")),
            )
        })
        .await
        .unwrap();
    let host = Host::new(worker.storage(), fixture.root.clone(), identity)
        .await
        .unwrap();
    let bind = "127.0.0.1:0".parse().unwrap();
    let listener = host
        .clone()
        .listen(bind, fixture.chain.clone(), fixture.key.clone())
        .await
        .unwrap();
    let address = listener.address();
    let client = connector(Some(fixture.authority.clone()));
    let untrusted = connector(None);
    let socket = TcpStream::connect(address).await.unwrap();
    assert!(untrusted
        .connect(address.ip().into(), socket)
        .await
        .is_err());

    let workspace = host.workspace;
    let base = format!("/api/next/v1/workspaces/{workspace}");
    let saved = format!("{base}/notes/{id}");
    assert_eq!(
        request(&client, address, "GET", &saved, "", "").await.0,
        401
    );
    assert_eq!(
        request(&client, address, "GET", "/api/owner/devices", "", "")
            .await
            .0,
        404
    );
    assert_eq!(
        request(
            &client,
            address,
            "GET",
            "/api/access/host",
            "Origin: https://unexpected.test\r\n",
            ""
        )
        .await
        .0,
        403
    );
    let descriptor = request(&client, address, "GET", "/api/access/host", "", "").await;
    let descriptor: Value = serde_json::from_str(&descriptor.2).unwrap();
    assert_eq!(descriptor["hostId"], host_id.to_string());
    let enrollment = json!({
        "name":"Android fixture", "kind":"desktop", "nonce":"a".repeat(64),
        "fingerprint":descriptor["fingerprint"]
    })
    .to_string();
    let (_, _, response) =
        request(&client, address, "POST", "/api/pairings", "", &enrollment).await;
    let pending: Value = serde_json::from_str(&response).unwrap();
    let pairing_id = pending["id"].as_str().unwrap();
    let code = pending["code"].as_str().unwrap();
    let secret_header = format!(
        "X-Vaultor-Pairing: {}\r\n",
        pending["secret"].as_str().unwrap()
    );
    let pairing_url = format!("/api/pairings/{pairing_id}");
    let complete = format!("{pairing_url}/complete");
    assert_eq!(
        request(&client, address, "GET", &pairing_url, "", "")
            .await
            .0,
        404
    );
    assert_eq!(
        request(&client, address, "POST", &complete, &secret_header, "{}")
            .await
            .0,
        409
    );
    assert!(host
        .owner_command(&format!("approve {pairing_id} wrong"))
        .is_err());
    host.owner_command(&format!("approve {pairing_id} {code}"))
        .unwrap();
    let completed = request(&client, address, "POST", &complete, &secret_header, "{}").await;
    assert_eq!(completed.0, 200);
    assert_eq!(
        completed.2,
        request(&client, address, "POST", &complete, &secret_header, "{}")
            .await
            .2
    );
    let receipt: Value = serde_json::from_str(&completed.2).unwrap();
    let device = receipt["deviceId"].as_str().unwrap();
    let auth = format!(
        "Authorization: Bearer {}\r\n",
        receipt["credential"].as_str().unwrap()
    );
    assert_eq!(
        request(&client, address, "GET", &saved, &auth, "").await.0,
        403
    );
    host.owner_command(&format!("grant {device}")).unwrap();
    let wrong = format!("/api/next/v1/workspaces/{}/notes/{id}", Uuid::new_v4());
    assert_eq!(
        request(&client, address, "GET", &wrong, &auth, "").await.0,
        403
    );
    let response = request(&client, address, "GET", &saved, &auth, "").await;
    assert_eq!(response.0, 200);
    assert!(response.2.contains("Saved title"));
    assert!(!response.2.contains("Protected draft"));
    let search = request(
        &client,
        address,
        "GET",
        &format!("{base}/resources?query=Saved"),
        &auth,
        "",
    )
    .await;
    assert_eq!(search.0, 200);
    assert!(search.2.contains(&id));
    let ranged = request(
        &client,
        address,
        "GET",
        &format!("{base}/files/{file_id}"),
        &format!("{auth}Range: bytes=3-6\r\n"),
        "",
    )
    .await;
    assert_eq!((ranged.0, ranged.2.as_str()), (206, "3456"));
    std::fs::write(
        fixture.root.join("managed").join(format!("{file_id}.bin")),
        b"9876543210",
    )
    .unwrap();
    assert_eq!(
        request(
            &client,
            address,
            "GET",
            &format!("{base}/files/{file_id}"),
            &auth,
            ""
        )
        .await
        .0,
        404
    );
    let operation = Uuid::new_v4();
    let review = format!("{base}/resources/{id}/review/{operation}");
    let payload = json!({"id":operation,"resourceId":id,"baseRevision":1,"comment":"Feedback",
        "quote":"","context":"","locator":{"kind":"resource"}})
    .to_string();
    let response = request(&client, address, "PUT", &review, &auth, &payload).await;
    assert_eq!(response.0, 200);
    assert!(response.2.contains("Android fixture"));
    assert_eq!(
        response.2,
        request(&client, address, "PUT", &review, &auth, &payload)
            .await
            .2
    );
    assert_eq!(
        response.2,
        request(&client, address, "GET", &review, &auth, "").await.2
    );

    let socket = TcpStream::connect(address).await.unwrap();
    let mut events = client.connect(address.ip().into(), socket).await.unwrap();
    let mut event_buffer = vec![0; 4096];
    events
        .write_all(
            format!("GET {base}/changes HTTP/1.1\r\nHost: {address}\r\n{auth}\r\n").as_bytes(),
        )
        .await
        .unwrap();
    async fn wait_reset(
        stream: &mut tokio_rustls::client::TlsStream<TcpStream>,
        buffer: &mut [u8],
    ) {
        tokio::time::timeout(Duration::from_secs(4), async {
            let mut received = Vec::new();
            loop {
                let count = stream.read(buffer).await.unwrap();
                assert!(count > 0);
                received.extend_from_slice(&buffer[..count]);
                if String::from_utf8_lossy(&received).contains("event: reset") {
                    return;
                }
            }
        })
        .await
        .unwrap();
    }
    wait_reset(&mut events, &mut event_buffer).await;
    worker
        .call(Request::CreateNote {
            title: "Committed after subscription".into(),
            collection: None,
        })
        .await
        .unwrap();
    wait_reset(&mut events, &mut event_buffer).await;
    host.owner_command(&format!("withdraw {device}")).unwrap();
    tokio::time::timeout(Duration::from_secs(4), async {
        let mut received = Vec::new();
        while !String::from_utf8_lossy(&received).contains("0\r\n\r\n") {
            let count = events.read(&mut event_buffer).await.unwrap();
            if count == 0 {
                break;
            }
            received.extend_from_slice(&event_buffer[..count]);
        }
    })
    .await
    .unwrap();
    assert_eq!(
        request(&client, address, "GET", &saved, &auth, "").await.0,
        403
    );
    host.owner_command(&format!("grant {device}")).unwrap();
    listener.stop().await.unwrap();
    assert!(TcpStream::connect(address).await.is_err());
    drop(host);
    let different_ca = tempfile::tempdir().unwrap();
    let (changed, _, _, _) = tls_fixture(different_ca.path());
    assert!(matches!(
        Identity::open(&fixture.access, &changed),
        Err(error) if error.to_string().contains("Host authority changed")
    ));
    let identity = Identity::open(&fixture.access, &fixture.ca).unwrap();
    assert_eq!(host_id, identity.id);
    let host = Host::new(worker.storage(), fixture.root.clone(), identity)
        .await
        .unwrap();
    let listener = host
        .clone()
        .listen(bind, fixture.chain.clone(), fixture.key.clone())
        .await
        .unwrap();
    assert_eq!(
        request(&client, listener.address(), "GET", &saved, &auth, "")
            .await
            .0,
        200
    );
    host.owner_command(&format!("revoke {device}")).unwrap();
    assert_eq!(
        request(&client, listener.address(), "GET", &saved, &auth, "")
            .await
            .0,
        401
    );
    listener.stop().await.unwrap();
}
