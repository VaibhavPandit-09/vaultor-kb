package com.vaultor.vaultor;

import com.vaultor.vaultor.service.*;
import com.vaultor.vaultor.repository.*;
import com.vaultor.vaultor.host.*;
import com.vaultor.vaultor.workspaces.*;
import org.junit.jupiter.api.*;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.context.*;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.mock.web.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.core.env.Environment;
import tools.jackson.databind.*;
import java.nio.file.*;
import java.net.*;
import java.net.http.*;
import java.security.*;
import java.util.*;
import java.util.concurrent.*;
import java.io.*;
import static org.junit.jupiter.api.Assertions.*;

@SpringBootTest(webEnvironment=SpringBootTest.WebEnvironment.RANDOM_PORT)
class CompanionSnapshotsTest {
    static final Path DATA;static {try{DATA=Files.createTempDirectory("vaultor-companion-");}catch(Exception e){throw new ExceptionInInitializerError(e);}}
    @DynamicPropertySource static void properties(DynamicPropertyRegistry p){p.add("app.host.network-port",()->"0");p.add("app.host.path",()->DATA.resolve("host-access").toString());p.add("spring.datasource.url",()->"jdbc:sqlite:"+DATA.resolve("app.db"));p.add("app.storage.path",()->DATA.resolve("files").toString());}
    @Autowired CompanionSnapshots snapshots;@Autowired ResourceService service;@Autowired ResourceRepository resources;
    @Autowired FileImportService imports;@Autowired FileStorageService files;@Autowired DocumentService documents;@Autowired OrganizationService organization;
    @Autowired WorkspaceIdentityService identity;@Autowired WorkspaceGate gate;@Autowired WorkspaceCatalog catalog;@Autowired WorkspaceRegistry registry;
    @Autowired HostAccess access;@Autowired HostListener listener;@Autowired ObjectMapper json;@Autowired Environment env;@Autowired JdbcTemplate jdbc;@Autowired TransactionTemplate transaction;
    final List<String> made=new ArrayList<>();final HttpClient client=HttpClient.newHttpClient();
    @AfterEach void cancel() throws Exception {for(String id:made)snapshots.cancel(id,null);}
    CompanionSnapshots.Selection selection(String scope,List<String> ids,String deps,String policy){return new CompanionSnapshots.Selection(identity.current().generation(),scope,ids,deps,policy);}
    <T> T retry(Callable<T> work) throws Exception {for(int n=0;n<200;n++){try{return work.call();}catch(AccessFailure e){if(!e.code.equals("WORKSPACE_BUSY"))throw e;Thread.sleep(10);}}throw new AssertionError("Short maintenance admission did not settle");}
    CompanionSnapshots.Status ready(CompanionSnapshots instance,String id,String device) throws Exception {for(int n=0;n<200;n++){var status=retry(()->instance.status(id,device));if(!Set.of("RUNNING","QUEUED").contains(status.status())){assertEquals("READY",status.status(),status.detail());return status;}Thread.sleep(25);}throw new AssertionError("Checkpoint timed out");}
    CompanionSnapshots.Status create(CompanionSnapshots.Selection s) throws Exception {String id=UUID.randomUUID().toString();made.add(id);retry(()->snapshots.create(id,s,null));return ready(snapshots,id,null);}
    CompanionSnapshots.Manifest manifest(CompanionSnapshots.Status s) throws Exception{return retry(()->snapshots.manifest(s.id(),null,match(s)));}
    String match(CompanionSnapshots.Status s){return '"'+s.manifestSha256()+'"';}
    String doc(String text){return "{\"type\":\"doc\",\"content\":[{\"type\":\"paragraph\",\"content\":[{\"type\":\"text\",\"text\":\""+text+"\"}]}]}";}
    String linked(String id,String text){return "{\"type\":\"doc\",\"content\":[{\"type\":\"paragraph\",\"content\":[{\"type\":\"text\",\"text\":\""+text+"\"},{\"type\":\"resourceLink\",\"attrs\":{\"resourceId\":\""+id+"\",\"label\":\"Linked\"}}]}]}";}
    HttpResponse<byte[]> request(String method,String path,Object body,Map<String,String> headers) throws Exception {
        var b=HttpRequest.newBuilder(URI.create("http://localhost:"+env.getProperty("local.server.port")+"/api"+path)).timeout(java.time.Duration.ofSeconds(15)).header("X-Vaultor-Owner",Files.readString(DATA.resolve("host-access/owner.key"))).header("Content-Type","application/json");headers.forEach(b::header);var request=b.method(method,body==null?HttpRequest.BodyPublishers.noBody():HttpRequest.BodyPublishers.ofString(json.writeValueAsString(body))).build();for(int n=0;n<100;n++){var response=client.send(request,HttpResponse.BodyHandlers.ofByteArray());if(!path.startsWith("/companions/")||response.statusCode()!=409||!json.readTree(response.body()).path("code").asText().equals("WORKSPACE_BUSY"))return response;Thread.sleep(10);}throw new AssertionError("Companion admission did not settle");
    }
    @Test void immutableNotesFilesRangeResumeAndValidators() throws Exception {
        String file=UUID.randomUUID().toString();byte[] original=new byte[600000];new Random(12).nextBytes(original);imports.create(file,"original.txt",null,new MockMultipartFile("file","original.txt","text/plain",original),null);
        var note=service.createNote("Captured",linked(file,"Before"));var state=create(selection("resources",List.of(note.getId()),"linked","originals"));
        var inventory=snapshots.inventory(state.id(),null,match(state),0,1);assertEquals(2,inventory.totalItems());assertEquals(2,inventory.totalPages());assertEquals(1,inventory.items().size());assertFalse(json.writeValueAsString(inventory).contains("filePath"));assertFalse(json.writeValueAsString(inventory).contains("Before"));
        service.updateNote(note.getId(),"Changed",doc("After"),'"'+note.getRevision()+'"');
        var body=request("GET","/companions/"+state.id()+"/payloads/"+note.getId()+".json",null,Map.of("If-Match",match(state)));assertEquals(200,body.statusCode());assertTrue(new String(body.body()).contains("Before"));assertFalse(new String(body.body()).contains("After"));
        var first=request("GET","/companions/"+state.id()+"/payloads/"+file+".bin",null,Map.of("If-Match",match(state),"Range","bytes=0-299999"));
        var rest=request("GET","/companions/"+state.id()+"/payloads/"+file+".bin",null,Map.of("If-Match",match(state),"Range","bytes=300000-"));assertEquals(206,first.statusCode());assertEquals(206,rest.statusCode());var joined=new ByteArrayOutputStream();joined.write(first.body());joined.write(rest.body());assertArrayEquals(original,joined.toByteArray());
        var descriptor=manifest(state).resources().stream().filter(e->e.id().equals(file)).findFirst().orElseThrow().binary();assertEquals(descriptor.sha256(),HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(joined.toByteArray())));
        var raw=request("GET","/companions/"+state.id()+"/payloads/manifest.json",null,Map.of("If-Match",match(state)));assertEquals(200,raw.statusCode());assertEquals(state.manifestSha256(),HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(raw.body())));
        assertEquals(428,request("GET","/companions/"+state.id()+"/inventory",null,Map.of()).statusCode());assertEquals(412,request("GET","/companions/"+state.id()+"/inventory",null,Map.of("If-Match","\"wrong\"")).statusCode());
        assertEquals(416,request("GET","/companions/"+state.id()+"/payloads/"+file+".bin",null,Map.of("If-Match",match(state),"Range","bytes=0-1,4-5")).statusCode());
        assertEquals(400,assertThrows(AccessFailure.class,()->snapshots.stream(state.id(),"../../owner.key",null,match(state),null,new MockHttpServletResponse())).status);
        assertEquals(200,request("GET","/companions/"+state.id()+"/inventory",null,Map.of("If-Match",match(state))).statusCode());
    }
    @Test void collectionScopeDependenciesCoverageAndMissingBytes() throws Exception {
        String file=UUID.randomUUID().toString();var uploaded=imports.create(file,"document.bin",null,new MockMultipartFile("file","document.bin","application/octet-stream",new byte[]{1,2}),null);
        var target=service.createNote("Outside",doc("Outside body"));var source=service.createNote("Inside",linked(target.getId(),"Inside body"));String collection=UUID.randomUUID().toString();organization.createOnce(collection,new OrganizationService.CreationInput("Companion selection",List.of(source.getId(),file)));
        var s=selection("collections",List.of(collection),"none","readable");assertFalse(snapshots.estimate(s,null).exactBytes());var state=create(s);var m=manifest(state);assertEquals(2,m.resources().size());assertEquals("policy-omitted",m.resources().stream().filter(e->e.id().equals(file)).findFirst().orElseThrow().binary().state());assertEquals(target.getId(),snapshots.coverage(state.id(),null,match(state),0,100).items().getFirst().id());
        snapshots.cancel(state.id(),null);Files.delete(files.getFile(uploaded.getFilePath()));var missing=create(selection("resources",List.of(file),"none","originals"));assertEquals("missing",manifest(missing).resources().getFirst().binary().state());
    }
    @Test void deltaAndTrashDoNotRewriteEarlierCheckpoint() throws Exception {
        var note=service.createNote("Before delta",doc("Original"));var s=selection("resources",List.of(note.getId()),"linked","readable");var first=create(s);
        service.updateNote(note.getId(),"After delta",doc("New"),'"'+note.getRevision()+'"');var second=create(s);var delta=snapshots.delta(second.id(),first.id(),null,match(second),match(first),0,100);assertEquals(1,delta.totalItems());assertEquals("changed",delta.items().getFirst().change());
        var lifecycle=registry.open(catalog.defaultId()).context().getBean(ResourceLifecycleService.class);var updated=resources.findById(note.getId()).orElseThrow();assertEquals("trashed",lifecycle.apply(new ResourceLifecycleService.Item(UUID.randomUUID().toString(),note.getId(),"trash",updated.getRevision())).status());
        snapshots.cancel(second.id(),null);var third=create(s);assertEquals("trashed",manifest(third).resources().getFirst().state());assertEquals("Before delta",manifest(first).resources().getFirst().title());
        assertEquals(400,assertThrows(AccessFailure.class,()->snapshots.delta(third.id(),first.id(),null,match(third),match(first),0,201)).status); // page bounds are rejected, never unbounded.
    }
    @Test void cancellationRetryIdentityAndInterruptedPreparation() throws Exception {
        var note=service.createNote("Cancellation",doc("Preserved"));var s=selection("resources",List.of(note.getId()),"none","readable");String id=UUID.randomUUID().toString();made.add(id);
        ExecutorService executor=(ExecutorService)ReflectionTestUtils.getField(snapshots,"worker");var release=new CountDownLatch(1);var entered=new CountDownLatch(1);var block=executor.submit(()->{entered.countDown();try{release.await(5,TimeUnit.SECONDS);}catch(InterruptedException e){Thread.currentThread().interrupt();}});assertTrue(entered.await(2,TimeUnit.SECONDS));
        try{snapshots.create(id,s,null);snapshots.create(id,s,null);assertEquals("QUEUED",snapshots.status(id,null).status());snapshots.cancel(id,null);assertEquals(409,assertThrows(AccessFailure.class,()->snapshots.create(id,selection("resources",List.of(note.getId()),"linked","readable"),null)).status);}finally{release.countDown();block.get(6,TimeUnit.SECONDS);}
        for(int i=0;i<100&&Set.of("QUEUED","RUNNING").contains(snapshots.status(id,null).status());i++)Thread.sleep(20);assertEquals("CANCELLED",snapshots.status(id,null).status());assertEquals("Preserved",json.readTree(resources.findById(note.getId()).orElseThrow().getContent()).path("content").get(0).path("content").get(0).path("text").asText());
    }
    @Test void expiryRestartAndGenerationNeverMixDatasets() throws Exception {
        var note=service.createNote("Restart",doc("Stable"));var state=create(selection("resources",List.of(note.getId()),"none","readable"));
        var reopened=new CompanionSnapshots(resources,documents,files,identity,gate,transaction,jdbc,json,access,catalog);ReflectionTestUtils.setField(reopened,"storagePath",DATA.resolve("files").toString());reopened.init();
        try{assertEquals(state.manifestSha256(),reopened.status(state.id(),null).manifestSha256());assertEquals(1,reopened.inventory(state.id(),null,match(state),0,100).totalItems());}finally{reopened.shutdown();}
        String previous=identity.current().generation();identity.replaced();try{assertEquals("COMPANION_GENERATION_CHANGED",assertThrows(AccessFailure.class,()->snapshots.inventory(state.id(),null,match(state),0,100)).code);}finally{jdbc.update("UPDATE settings SET value=? WHERE key_name='workspace_generation'",previous);}
        Path path=DATA.resolve("companions").resolve(state.id()).resolve("receipt.json");var r=json.readValue(Files.readAllBytes(path),CompanionSnapshots.Receipt.class);var expired=new CompanionSnapshots.Receipt(r.id(),r.workspaceId(),r.device(),r.selection(),r.createdAt(),System.currentTimeMillis()-1,"READY",r.detail(),r.manifestSha256(),r.resources(),r.bytes());Files.write(path,json.writeValueAsBytes(expired));
        var restart=new CompanionSnapshots(resources,documents,files,identity,gate,transaction,jdbc,json,access,catalog);ReflectionTestUtils.setField(restart,"storagePath",DATA.resolve("files").toString());restart.init();try{assertEquals("EXPIRED",restart.status(state.id(),null).status());assertEquals(410,assertThrows(AccessFailure.class,()->restart.inventory(state.id(),null,match(state),0,100)).status);}finally{restart.shutdown();}
    }
    @Test void interruptedStartupRemovesPartialBytesWithoutClaimingReady() throws Exception {
        var note=service.createNote("Interrupted restart",doc("Original retained"));var state=create(selection("resources",List.of(note.getId()),"none","readable"));Path path=DATA.resolve("companions").resolve(state.id()).resolve("receipt.json");var r=json.readValue(Files.readAllBytes(path),CompanionSnapshots.Receipt.class);Files.write(path,json.writeValueAsBytes(new CompanionSnapshots.Receipt(r.id(),r.workspaceId(),r.device(),r.selection(),r.createdAt(),r.expiresAt(),"RUNNING","Interrupted",null,0,0)));
        var restart=new CompanionSnapshots(resources,documents,files,identity,gate,transaction,jdbc,json,access,catalog);ReflectionTestUtils.setField(restart,"storagePath",DATA.resolve("files").toString());restart.init();try{assertEquals("FAILED",restart.status(state.id(),null).status());assertFalse(Files.exists(path.getParent().resolve("blobs")));assertFalse(Files.exists(path.getParent().resolve("manifest.json")));assertEquals("Original retained",json.readTree(resources.findById(note.getId()).orElseThrow().getContent()).path("content").get(0).path("content").get(0).path("text").asText());}finally{restart.shutdown();}
    }
    @Test void equalResourceIdsCannotCrossWorkspace() throws Exception {
        String other=UUID.randomUUID().toString(),same=UUID.randomUUID().toString();catalog.create(other,"Snapshot isolation");var child=registry.open(other).context();
        imports.create(same,"Default",doc("Default bytes"),null,null);child.getBean(FileImportService.class).create(same,"Other",doc("Other bytes"),null,null);
        var first=create(selection("resources",List.of(same),"none","originals"));var otherService=child.getBean(CompanionSnapshots.class);var otherIdentity=child.getBean(WorkspaceIdentityService.class).current();String id=UUID.randomUUID().toString();
        retry(()->otherService.create(id,new CompanionSnapshots.Selection(otherIdentity.generation(),"resources",List.of(same),"none","originals"),null));try{var state=ready(otherService,id,null);assertEquals("Other",retry(()->otherService.manifest(id,null,match(state))).resources().getFirst().title());assertEquals("Default",manifest(first).resources().getFirst().title());assertEquals(404,assertThrows(AccessFailure.class,()->otherService.status(first.id(),null)).status);assertEquals(404,request("GET","/companions/"+first.id(),null,Map.of("X-Vaultor-Workspace",other)).statusCode());}finally{otherService.cancel(id,null);}
    }
    @Test void approvedTlsClientOwnershipAndRevocationStopByteDelivery() throws Exception {
        var enrollment=access.enroll(new HostAccess.Enrollment("Companion check","agent",HostAccess.secret(),access.trust.fingerprint()));access.decide((String)enrollment.get("id"),(String)enrollment.get("code"),true);var completed=access.complete((String)enrollment.get("id"),(String)enrollment.get("secret"));String device=completed.get("deviceId");
        var store=KeyStore.getInstance("PKCS12");store.load(null,null);store.setCertificateEntry("host",access.trust.ca());var tm=javax.net.ssl.TrustManagerFactory.getInstance(javax.net.ssl.TrustManagerFactory.getDefaultAlgorithm());tm.init(store);var ssl=javax.net.ssl.SSLContext.getInstance("TLS");ssl.init(null,tm.getTrustManagers(),null);var secure=HttpClient.newBuilder().sslContext(ssl).build();String base="https://127.0.0.1:"+listener.set(true).get("port")+"/api";
        String file=UUID.randomUUID().toString();imports.create(file,"Revocation",null,new MockMultipartFile("file","revoke.txt","text/plain",new byte[600000]),null);String id=UUID.randomUUID().toString();
        try {
            retry(()->snapshots.create(id,selection("resources",List.of(file),"none","originals"),device));var state=ready(snapshots,id,device);String validator=match(state);
            assertEquals(404,assertThrows(AccessFailure.class,()->snapshots.status(id,null)).status);
            while(!gate.enterRequest())Thread.sleep(10);try {
            var req=HttpRequest.newBuilder(URI.create(base+"/companions/"+id+"/inventory")).header("Authorization","Bearer "+completed.get("credential")).header("If-Match",validator).GET().build();assertEquals(200,secure.send(req,HttpResponse.BodyHandlers.ofString()).statusCode());
            var output=new ByteArrayOutputStream();var response=new MockHttpServletResponse(){@Override public jakarta.servlet.ServletOutputStream getOutputStream(){return new jakarta.servlet.ServletOutputStream(){public boolean isReady(){return true;}public void setWriteListener(jakarta.servlet.WriteListener l){}public void write(int b){output.write(b);}public void write(byte[] bytes,int offset,int length) throws IOException {output.write(bytes,offset,length);try{catalog.grant(catalog.defaultId(),device,false);}catch(Exception e){throw new IOException(e);}}};}};
            assertEquals("COMPANION_ACCESS_REVOKED",assertThrows(AccessFailure.class,()->snapshots.stream(id,file+".bin",device,validator,null,response)).code);assertTrue(output.size()<=262144);assertEquals(404,secure.send(req,HttpResponse.BodyHandlers.ofString()).statusCode());
            }finally{gate.leaveRequest();}
        }finally {catalog.grant(catalog.defaultId(),device,true);snapshots.cancel(id,device);access.revoke(device);listener.set(false);}
    }
    @Test void captureSerializesConcurrentEditsAndStreamsCanResumeAfterDisconnect() throws Exception {
        String file=UUID.randomUUID().toString();byte[] bytes=new byte[600000];new Random(23).nextBytes(bytes);imports.create(file,"Concurrent original",null,new MockMultipartFile("file","concurrent.txt","text/plain",bytes),null);var note=service.createNote("Concurrent saved",linked(file,"Before capture"));
        var entered=new CountDownLatch(1);var release=new CountDownLatch(1);FileStorageService blocked=org.mockito.Mockito.mock(FileStorageService.class);org.mockito.Mockito.when(blocked.getFile(org.mockito.ArgumentMatchers.anyString())).thenAnswer(invocation->{entered.countDown();assertTrue(release.await(8,TimeUnit.SECONDS));return files.getFile(invocation.getArgument(0));});
        var capture=new CompanionSnapshots(resources,documents,blocked,identity,gate,transaction,jdbc,json,access,catalog);ReflectionTestUtils.setField(capture,"storagePath",DATA.resolve("concurrent/files").toString());capture.init();String id=UUID.randomUUID().toString();
        try{
            capture.create(id,selection("resources",List.of(note.getId()),"linked","originals"),null);assertTrue(entered.await(4,TimeUnit.SECONDS));assertFalse(capture.idle());
            try{assertEquals(409,request("PUT","/resources/"+note.getId()+"/note",Map.of("title","Concurrent edit","content",json.readTree(doc("After capture"))),Map.of("If-Match",'"'+note.getRevision()+'"')).statusCode());assertEquals(409,request("PUT","/resources/lifecycle",List.of(Map.of("operationId",UUID.randomUUID().toString(),"resourceId",note.getId(),"action","trash","revision",note.getRevision())),Map.of("X-Vaultor-Protocol","3")).statusCode());}finally{release.countDown();}
            CompanionSnapshots.Status status=null;for(int i=0;i<200;i++){try{status=capture.status(id,null);if(status.status().equals("READY"))break;}catch(AccessFailure e){if(!e.code.equals("WORKSPACE_BUSY"))throw e;}Thread.sleep(20);}assertNotNull(status);assertEquals("READY",status.status());var readyStatus=status;assertEquals("Concurrent saved",retry(()->capture.manifest(id,null,match(readyStatus))).resources().stream().filter(e->e.id().equals(note.getId())).findFirst().orElseThrow().title());
            String validator=match(status);var part=new ByteArrayOutputStream();var broken=new MockHttpServletResponse(){@Override public jakarta.servlet.ServletOutputStream getOutputStream(){return new jakarta.servlet.ServletOutputStream(){public boolean isReady(){return true;}public void setWriteListener(jakarta.servlet.WriteListener l){}public void write(int b){}public void write(byte[] b,int o,int n) throws IOException {part.write(b,o,n);throw new IOException("Disposable client disconnected");}};}};
            assertThrows(IOException.class,()->capture.stream(id,file+".bin",null,validator,null,broken));assertEquals("READY",capture.status(id,null).status());var rest=new MockHttpServletResponse();capture.stream(id,file+".bin",null,validator,"bytes="+part.size()+"-",rest);part.write(rest.getContentAsByteArray());assertArrayEquals(bytes,part.toByteArray());
        }finally{release.countDown();capture.cancel(id,null);capture.shutdown();}
    }
    @Test void boundsAndTamperedManifestCannotBecomeAValidDownload() throws Exception {
        var note=service.createNote("Limits",doc("Original"));var s=selection("resources",List.of(note.getId()),"none","readable");var state=create(s);assertEquals(400,assertThrows(AccessFailure.class,()->snapshots.estimate(selection("resources",List.of("../../escape"),"none","originals"),null)).status);
        Path manifest=DATA.resolve("companions").resolve(state.id()).resolve("manifest.json");byte[] original=Files.readAllBytes(manifest);try{Files.writeString(manifest,"{\"resources\":[{\"key\":\"../host-access/owner.key\",\"bytes\":-1}]}");assertEquals("COMPANION_DAMAGED",assertThrows(AccessFailure.class,()->manifest(state)).code);}finally{Files.write(manifest,original);}
        String file=UUID.randomUUID().toString();var uploaded=imports.create(file,"Oversized",null,new MockMultipartFile("file","oversized.bin","application/octet-stream",new byte[]{1}),null);try(var sparse=new RandomAccessFile(files.getFile(uploaded.getFilePath()).toFile(),"rw")){sparse.setLength(CompanionSnapshots.MAX_FILE+1);}var large=create(selection("resources",List.of(file),"none","originals"));assertEquals("too-large",manifest(large).resources().getFirst().binary().state());
        var oversized=service.createNote("Oversized document",doc("x".repeat(1024*1024)));assertEquals(413,assertThrows(AccessFailure.class,()->snapshots.estimate(selection("resources",List.of(oversized.getId()),"none","readable"),null)).status);
    }
    @Test void imagePolicyAndTableProvenanceKeepReferenceMeaning() throws Exception {
        String file=UUID.randomUUID().toString();imports.create(file,"Table source.csv",null,new MockMultipartFile("file","source.csv","text/csv","a,b\n1,2".getBytes()),null);var note=service.createNote("Table provenance","{\"type\":\"doc\",\"content\":[{\"type\":\"paragraph\",\"attrs\":{\"sourceResourceId\":\""+file+"\"},\"content\":[{\"type\":\"text\",\"text\":\"Imported table provenance\"}]}]}");
        var mistaken=service.createNote("Not an image",doc("Must not download this body in image-only mode"));var content=json.readTree(note.getContent()).deepCopy();((tools.jackson.databind.node.ArrayNode)content.path("content")).add(json.readTree("{\"type\":\"image\",\"attrs\":{\"resourceId\":\""+mistaken.getId()+"\"}}"));service.updateNote(note.getId(),note.getTitle(),content.toString(),null);var images=create(selection("resources",List.of(note.getId()),"images","readable"));assertEquals(2,images.resources());var rejected=manifest(images).resources().stream().filter(e->e.id().equals(mistaken.getId())).findFirst().orElseThrow();assertEquals("unsupported-reference",rejected.state());assertNull(rejected.document());assertEquals(file,snapshots.coverage(images.id(),null,match(images),0,100).items().getFirst().id());var linked=create(selection("resources",List.of(note.getId()),"linked","originals"));assertEquals(3,linked.resources());assertTrue(manifest(linked).resources().stream().anyMatch(e->e.id().equals(file)&&e.binary()!=null));
    }
    @Test void corruptOptionalCheckpointStorageDoesNotDisableOriginalWorkspace() throws Exception {
        var note=service.createNote("Readable despite cache damage",doc("Retained original"));String id=UUID.randomUUID().toString();Path receipt=DATA.resolve("damaged/companions").resolve(id).resolve("receipt.json");Files.createDirectories(receipt.getParent());Files.writeString(receipt,"{}");
        var damaged=new CompanionSnapshots(resources,documents,files,identity,gate,transaction,jdbc,json,access,catalog);ReflectionTestUtils.setField(damaged,"storagePath",DATA.resolve("damaged/files").toString());assertDoesNotThrow(damaged::init);
        try{assertEquals("COMPANION_STORAGE_UNAVAILABLE",assertThrows(AccessFailure.class,()->damaged.estimate(selection("workspace",List.of(),"none","readable"),null)).code);assertEquals(503,assertThrows(AccessFailure.class,()->damaged.create(UUID.randomUUID().toString(),selection("resources",List.of(note.getId()),"none","readable"),null)).status);assertEquals("Readable despite cache damage",service.getResourceOrThrow(note.getId()).getTitle());assertEquals("{}",Files.readString(receipt));}finally{damaged.shutdown();}
    }
    @Test void routineIndexMaintenanceCannotTruncateAnAdmittedPayload() throws Exception {
        String file=UUID.randomUUID().toString();byte[] original=new byte[600000];imports.create(file,"Stream lease",null,new MockMultipartFile("file","lease.txt","text/plain",original),null);var state=create(selection("resources",List.of(file),"none","originals"));var output=new ByteArrayOutputStream();var once=new java.util.concurrent.atomic.AtomicBoolean();var attempted=new CountDownLatch(1);var entered=new java.util.concurrent.atomic.AtomicBoolean();var maintenance=new java.util.concurrent.atomic.AtomicReference<CompletableFuture<Void>>();
        var response=new MockHttpServletResponse(){
            @Override public jakarta.servlet.ServletOutputStream getOutputStream(){
                return new jakarta.servlet.ServletOutputStream(){
                    public boolean isReady(){return true;}
                    public void setWriteListener(jakarta.servlet.WriteListener listener){}
                    public void write(int b){output.write(b);}
                    public void write(byte[] b,int off,int size) throws IOException {
                        output.write(b,off,size);
                        if(once.compareAndSet(false,true)){
                            maintenance.set(CompletableFuture.runAsync(()->{attempted.countDown();gate.exclusive(()->entered.set(true));}));
                            try{assertTrue(attempted.await(2,TimeUnit.SECONDS));Thread.sleep(40);assertFalse(entered.get(),"Maintenance must wait until the immutable stream finishes");}
                            catch(InterruptedException e){Thread.currentThread().interrupt();throw new IOException(e);}
                        }
                    }
                };
            }
        };
        retry(()->{snapshots.stream(state.id(),file+".bin",null,match(state),null,response);return true;});assertArrayEquals(original,output.toByteArray());maintenance.get().get(2,TimeUnit.SECONDS);assertTrue(entered.get());
    }
}
