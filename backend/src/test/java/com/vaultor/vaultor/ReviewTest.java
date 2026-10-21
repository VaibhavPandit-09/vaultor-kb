package com.vaultor.vaultor;

import com.vaultor.vaultor.service.*;
import com.vaultor.vaultor.repository.ResourceRepository;
import com.vaultor.vaultor.workspaces.*;
import com.vaultor.vaultor.host.AccessFailure;
import com.vaultor.vaultor.host.WorkspaceCatalog;
import com.vaultor.vaultor.host.HostAccess;
import com.vaultor.vaultor.host.HostListener;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.*;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.core.env.Environment;
import org.springframework.transaction.support.TransactionTemplate;
import tools.jackson.databind.ObjectMapper;
import java.nio.file.*;
import java.net.*;
import java.net.http.*;
import java.util.*;
import java.util.zip.*;
import static org.junit.jupiter.api.Assertions.*;

@SpringBootTest(webEnvironment=SpringBootTest.WebEnvironment.RANDOM_PORT)
class ReviewTest {
    static final Path DATA;static{try{DATA=Files.createTempDirectory("vaultor-reviews-");}catch(Exception e){throw new ExceptionInInitializerError(e);}}
    @DynamicPropertySource static void properties(DynamicPropertyRegistry p){p.add("app.host.network-port",()->"0");p.add("app.host.path",()->DATA.resolve("host-access").toString());p.add("spring.datasource.url",()->"jdbc:sqlite:"+DATA.resolve("app.db"));p.add("app.storage.path",()->DATA.resolve("files").toString());}
    @Autowired ReviewService reviews;@Autowired ResourceService notes;@Autowired ResourceRepository resources;@Autowired WorkspaceIdentityService identity;@Autowired ObjectMapper json;@Autowired Environment env;@Autowired WorkspaceCatalog catalog;@Autowired WorkspaceRegistry registry;@Autowired TransactionTemplate tx;@Autowired TransferService transfers;@Autowired NoteExportGraph graph;@Autowired NoteRenderer renderer;@Autowired WorkspaceGate gate;
    @Autowired HostAccess access;@Autowired HostListener listener;
    @Autowired com.vaultor.vaultor.host.WorkspaceImports workspaceImports;
    @Autowired FileImportService fileImports;
    // Completion can become visible before the exclusive maintenance lease is released.
    TransferService.Operation transferState(TransferService service,String id) throws InterruptedException {
        for(int n=0;n<200;n++) {
            try{return service.get(id);}catch(org.springframework.web.server.ResponseStatusException e){
                if(e.getStatusCode().value()!=409)throw e;
                Thread.sleep(25);
            }
        }
        throw new AssertionError("Transfer maintenance admission did not settle");
    }
    String doc(String text){return "{\"type\":\"doc\",\"content\":[{\"type\":\"paragraph\",\"content\":[{\"type\":\"text\",\"text\":\""+text+"\"}]}]}";}
    ReviewService.Input input(String id,String revision){return new ReviewService.Input(identity.current().generation(),id,"Please check <script>this</script>","Original text","Original",new ReviewService.Locator("block","0",null),revision);}
    String etag(ReviewService.Item r){return '"'+r.revision()+'"';}
    @Test void archivesOneThroughThreeWithoutReviewSectionRemainImportable() throws Exception {
        for(int version:new int[]{1,2,3}) {
            var workspace=json.createObjectNode();workspace.putArray("resources");workspace.putArray("tags");workspace.putObject("settings");
            if(version>=2){var organization=workspace.putObject("organization");organization.putArray("collections");organization.putArray("favorites");}
            byte[] payload=json.writeValueAsBytes(workspace);
            String checksum=HexFormat.of().formatHex(java.security.MessageDigest.getInstance("SHA-256").digest(payload));
            var manifest=new TransferService.Manifest(version,"2026-10-15T00:00:00Z",0,0,Map.of("workspace.json",checksum));
            var bytes=new java.io.ByteArrayOutputStream();
            try(var zip=new ZipOutputStream(bytes)) {
                zip.putNextEntry(new ZipEntry("workspace.json"));zip.write(payload);zip.closeEntry();
                zip.putNextEntry(new ZipEntry("manifest.json"));zip.write(json.writeValueAsBytes(manifest));zip.closeEntry();
            }
            long before=reviews.list("all",null,0,100).totalItems();
            var preview=transfers.preview(new MockMultipartFile("file","legacy.zip","application/zip",bytes.toByteArray()));assertEquals(0,preview.reviews());
            var operation=transfers.commit(preview.operation().id(),"merge");
            for(int n=0;n<200&&!Set.of("SUCCEEDED","FAILED").contains(transferState(transfers,operation.id()).status());n++)Thread.sleep(25);
            assertEquals("SUCCEEDED",transferState(transfers,operation.id()).status());assertEquals(before,reviews.list("all",null,0,100).totalItems());
        }
    }
    @Test void receiptReconcilesUncertainCreationWithoutTouchingNote() {
        var note=notes.createNote("Review target",doc("Original text"));String id=UUID.randomUUID().toString();var in=input(note.getId(),note.getRevision());var one=reviews.create(id,in,"Test device");var two=reviews.create(id,in,"Another label after reconnect");assertEquals(one,two);assertEquals("attached",one.attachment());assertEquals("Test device",two.author());assertEquals(note.getRevision(),resources.findById(note.getId()).orElseThrow().getRevision());
        var other=new ReviewService.Input(in.generation(),in.resourceId(),"Different",in.quote(),in.context(),in.locator(),in.baseRevision());assertEquals(409,assertThrows(AccessFailure.class,()->reviews.create(id,other,"Test")).status);assertEquals(404,assertThrows(AccessFailure.class,()->reviews.get(UUID.randomUUID().toString())).status);
    }
    @Test void conditionalStatusNeverResolvesOnOriginalEdit() {
        var note=notes.createNote("Status",doc("Original text"));var r=reviews.create(UUID.randomUUID().toString(),input(note.getId(),note.getRevision()),"Test");assertEquals(428,assertThrows(AccessFailure.class,()->reviews.status(r.id(),"resolved",null,identity.current().generation())).status);
        var next=reviews.status(r.id(),"resolved",etag(r),identity.current().generation());assertNotEquals(r.revision(),next.revision());assertEquals(412,assertThrows(AccessFailure.class,()->reviews.status(r.id(),"dismissed",etag(r),identity.current().generation())).status);
        notes.updateNote(note.getId(),"Changed title",doc("New text"),'"'+note.getRevision()+'"');var changed=reviews.get(r.id());assertEquals("resolved",changed.status());assertEquals("changed",changed.attachment());assertEquals("Original text",changed.quote());
        assertEquals("open",reviews.status(r.id(),"open",etag(changed),identity.current().generation()).status());
    }
    @Test void purgeRetainsEvidenceAndPagingIsBounded() {
        var note=notes.createNote("Purge evidence",doc("Original text"));for(int n=0;n<3;n++)reviews.create(UUID.randomUUID().toString(),input(note.getId(),note.getRevision()),"Test");var page=reviews.list("open",note.getId(),0,2);assertEquals(3,page.totalItems());assertEquals(2,page.totalPages());assertEquals(3,page.counts().get("open"));assertEquals(1,reviews.list("open",note.getId(),1,2).items().size());
        resources.deleteById(note.getId());assertTrue(reviews.list("all",note.getId(),0,100).items().stream().allMatch(r->r.availability().equals("missing") && r.targetTitle().equals("Purge evidence") && r.quote().equals("Original text")));
        assertEquals(400,assertThrows(AccessFailure.class,()->reviews.list("all",null,0,101)).status);
    }
    @Test void generationAndLocatorSafety() {
        var note=notes.createNote("Safety",doc("Original text"));var in=input(note.getId(),note.getRevision());assertEquals(409,assertThrows(AccessFailure.class,()->reviews.create(UUID.randomUUID().toString(),new ReviewService.Input("former-generation",in.resourceId(),in.comment(),in.quote(),in.context(),in.locator(),in.baseRevision()),"Test")).status);
        assertEquals(400,assertThrows(AccessFailure.class,()->reviews.create(UUID.randomUUID().toString(),new ReviewService.Input(in.generation(),in.resourceId(),"x".repeat(5001),"","",null,""),"Test")).status);
        assertEquals(400,assertThrows(AccessFailure.class,()->reviews.create(UUID.randomUUID().toString(),new ReviewService.Input(in.generation(),in.resourceId(),"Check","","",new ReviewService.Locator("page",null,0),""),"Test")).status);
    }
    @Test void incompleteCommentsCannotBecomeCompletedReviews() {
        var note=notes.createNote("Draft boundary",doc("Original text"));var generation=identity.current().generation();
        for(String comment:Arrays.asList(null,""," \n\t")) {
            var failure=assertThrows(AccessFailure.class,()->reviews.create(UUID.randomUUID().toString(),new ReviewService.Input(generation,note.getId(),comment,"Original text","",new ReviewService.Locator("resource",null,null),note.getRevision()),"Phone"));
            assertEquals(400,failure.status);
        }
        assertEquals(0,reviews.list("all",note.getId(),0,100).totalItems());
        assertEquals(note.getRevision(),resources.findById(note.getId()).orElseThrow().getRevision());
    }
    @Test void fileReviewsKeepPageEvidenceSeparateFromOriginals() throws Exception {
        String id=UUID.randomUUID().toString();var file=fileImports.create(id,"Review.pdf",null,new MockMultipartFile("file","Review.pdf","application/pdf","%PDF-1.4\nDiscretionary fixture".getBytes(java.nio.charset.StandardCharsets.UTF_8)),null);
        var item=reviews.create(UUID.randomUUID().toString(),new ReviewService.Input(identity.current().generation(),id,"Check page three","","PDF context",new ReviewService.Locator("page",null,3),file.getRevision()),"Phone");assertEquals("file",item.targetType());assertEquals(3,item.locator().page());assertEquals("resource",item.attachment());reviews.status(item.id(),"resolved",etag(item),identity.current().generation());assertEquals(file.getRevision(),resources.findById(id).orElseThrow().getRevision());
        assertEquals(400,assertThrows(AccessFailure.class,()->reviews.create(UUID.randomUUID().toString(),new ReviewService.Input(identity.current().generation(),id,"Check block","","",new ReviewService.Locator("block","0",null),file.getRevision()),"Phone")).status);
    }
    @Test void portableRemappingRetainsProvenanceWithoutRoutingIdentity() {
        var note=notes.createNote("Portable",doc("Original text"));var item=reviews.create(UUID.randomUUID().toString(),input(note.getId(),note.getRevision()),"Original device label");var portable=reviews.snapshot(Set.of(note.getId()));String payload=json.writeValueAsString(portable);assertFalse(payload.contains(identity.current().generation()));assertFalse(payload.contains(note.getRevision()));assertFalse(payload.contains("fingerprint"));
        String target=UUID.randomUUID().toString();tx.executeWithoutResult(s->reviews.restore(portable,new HashMap<>(Map.of(note.getId(),target)),false));var copy=reviews.list("all",target,0,100).items().getFirst();assertNotEquals(item.id(),copy.id());assertEquals("Original device label",copy.author());assertEquals("missing",copy.availability());assertEquals(item.comment(),copy.comment());
    }
    @Test void fullArchive4RoundTripAndScopedAssetExport() throws Exception {
        var note=notes.createNote("Archive review",doc("Original text"));reviews.create(UUID.randomUUID().toString(),input(note.getId(),note.getRevision()),"Test");var other=notes.createNote("Outside",doc("Original text"));reviews.create(UUID.randomUUID().toString(),input(other.getId(),other.getRevision()),"Test");
        var linked=(tools.jackson.databind.node.ObjectNode)json.readTree(doc("Original text"));((tools.jackson.databind.node.ArrayNode)linked.path("content").get(0).path("content")).addObject().put("type","resourceLink").putObject("attrs").put("resourceId",other.getId()).put("label","Outside");notes.updateNote(note.getId(),note.getTitle(),linked.toString(),'"'+note.getRevision()+'"');
        var scoped=graph.collect(note.getId(),false);assertEquals(1,scoped.workspace().reviews().size());assertEquals(2,graph.collect(note.getId(),true).workspace().reviews().size());Path out=DATA.resolve("scoped.zip");renderer.write(scoped.workspace(),scoped.binaries(),out,"md-assets");try(var zip=new ZipFile(out.toFile())){var rows=json.readTree(zip.getInputStream(zip.getEntry("reviews.json")).readAllBytes());assertEquals(1,rows.size());assertEquals(note.getId(),rows.get(0).path("resourceId").asText());}
        var op=transfers.export("workspace","zip");for(int n=0;n<200 && !Set.of("SUCCEEDED","FAILED").contains(transferState(transfers,op.id()).status());n++)Thread.sleep(25);assertEquals("SUCCEEDED",transferState(transfers,op.id()).status());Path archive=transfers.download(op.id());try(var zip=new ZipFile(archive.toFile())){assertEquals(4,json.readTree(zip.getInputStream(zip.getEntry("manifest.json")).readAllBytes()).path("version").asInt());}
        var preview=transfers.preview(new MockMultipartFile("file","workspace.zip","application/zip",Files.readAllBytes(archive)));long before=reviews.list("all",null,0,100).totalItems();assertEquals(before,preview.reviews());var applied=transfers.commit(preview.operation().id(),"merge");for(int n=0;n<200 && !Set.of("SUCCEEDED","FAILED").contains(transferState(transfers,applied.id()).status());n++)Thread.sleep(25);assertEquals("SUCCEEDED",transferState(transfers,applied.id()).status());assertEquals(before*2,reviews.list("all",null,0,100).totalItems());
    }
    HttpResponse<String> request(String method,String path,Object body,String workspace,boolean owner) throws Exception {
        var b=HttpRequest.newBuilder(URI.create("http://localhost:"+env.getProperty("local.server.port")+"/api"+path)).header("Content-Type","application/json");if(owner)b.header("X-Vaultor-Owner",Files.readString(DATA.resolve("host-access/owner.key")));if(workspace!=null)b.header("X-Vaultor-Workspace",workspace);return HttpClient.newHttpClient().send(b.method(method,body==null?HttpRequest.BodyPublishers.noBody():HttpRequest.BodyPublishers.ofString(json.writeValueAsString(body))).build(),HttpResponse.BodyHandlers.ofString());
    }
    @Test void routesRequireApprovalAndIsolateChildWorkspace() throws Exception {
        assertEquals(401,request("GET","/reviews",null,null,false).statusCode());String child=UUID.randomUUID().toString();catalog.create(child,"Review isolation");var runtime=registry.open(child);var childNotes=runtime.context().getBean(ResourceService.class);var childIdentity=runtime.context().getBean(WorkspaceIdentityService.class);var note=childNotes.createNote("Only child",doc("Original text"));String review=UUID.randomUUID().toString();var body=new ReviewService.Input(childIdentity.current().generation(),note.getId(),"Check","","",null,note.getRevision());assertEquals(200,request("PUT","/reviews/"+review,body,child,true).statusCode());assertEquals(404,request("GET","/reviews/"+review,null,catalog.defaultId(),true).statusCode());assertEquals(200,request("GET","/reviews/"+review,null,child,true).statusCode());
        assertEquals("This computer",json.readTree(request("GET","/reviews/"+review,null,child,true).body()).path("author").asText());
    }
    @Test void pairedHttpsUsesTrustedAuthorAndRevokedWorkspaceRefusesReadsAndWrites() throws Exception {
        var enrollment=access.enroll(new HostAccess.Enrollment("Review phone","agent",HostAccess.secret(),access.trust.fingerprint()));access.decide((String)enrollment.get("id"),(String)enrollment.get("code"),true);var approved=access.complete((String)enrollment.get("id"),(String)enrollment.get("secret"));String device=approved.get("deviceId");
        var store=java.security.KeyStore.getInstance("PKCS12");store.load(null,null);store.setCertificateEntry("host",access.trust.ca());var tm=javax.net.ssl.TrustManagerFactory.getInstance(javax.net.ssl.TrustManagerFactory.getDefaultAlgorithm());tm.init(store);var ssl=javax.net.ssl.SSLContext.getInstance("TLS");ssl.init(null,tm.getTrustManagers(),null);var client=HttpClient.newBuilder().sslContext(ssl).build();String base="https://127.0.0.1:"+listener.set(true).get("port")+"/api/reviews/"+UUID.randomUUID();
        var note=notes.createNote("Paired review",doc("Original text"));var b=HttpRequest.newBuilder(URI.create(base)).header("Authorization","Bearer "+approved.get("credential")).header("X-Vaultor-Workspace",catalog.defaultId()).header("Content-Type","application/json");
        try {var put=b.PUT(HttpRequest.BodyPublishers.ofString(json.writeValueAsString(input(note.getId(),note.getRevision())))).build();var reply=client.send(put,HttpResponse.BodyHandlers.ofString());assertEquals(200,reply.statusCode());assertEquals("Review phone",json.readTree(reply.body()).path("author").asText());catalog.grant(catalog.defaultId(),device,false);assertEquals(404,client.send(b.GET().build(),HttpResponse.BodyHandlers.ofString()).statusCode());assertEquals(404,client.send(put,HttpResponse.BodyHandlers.ofString()).statusCode());}
        finally{catalog.grant(catalog.defaultId(),device,true);access.revoke(device);listener.set(false);}
    }
    @Test void replacementRestoresEvidenceClearsOldReviewsAndRejectsOlderGeneration() throws Exception {
        var note=notes.createNote("Replacement source",doc("Original text"));var item=reviews.create(UUID.randomUUID().toString(),input(note.getId(),note.getRevision()),"Preserved provenance");var op=transfers.export("workspace","zip");for(int n=0;n<200&&!Set.of("SUCCEEDED","FAILED").contains(transferState(transfers,op.id()).status());n++)Thread.sleep(25);assertEquals("SUCCEEDED",transferState(transfers,op.id()).status());byte[] archive=Files.readAllBytes(transfers.download(op.id()));
        String child=UUID.randomUUID().toString();catalog.create(child,"Replacement target");var context=registry.open(child).context();var local=context.getBean(ReviewService.class);var localNotes=context.getBean(ResourceService.class);var localIdentity=context.getBean(WorkspaceIdentityService.class);var localTransfers=context.getBean(TransferService.class);var oldNote=localNotes.createNote("Former",doc("Former"));String generation=localIdentity.current().generation();var old=local.create(UUID.randomUUID().toString(),new ReviewService.Input(generation,oldNote.getId(),"Former concern","","",null,""),"Test");var preview=localTransfers.preview(new MockMultipartFile("file","replacement.zip","application/zip",archive));localTransfers.commit(preview.operation().id(),"replace");for(int n=0;n<200&&!Set.of("SUCCEEDED","FAILED").contains(transferState(localTransfers,preview.operation().id()).status());n++)Thread.sleep(25);assertEquals("SUCCEEDED",transferState(localTransfers,preview.operation().id()).status());assertNotEquals(generation,localIdentity.current().generation());assertEquals(404,assertThrows(AccessFailure.class,()->local.get(old.id())).status);assertEquals(item.comment(),local.get(item.id()).comment());assertEquals("changed",local.get(item.id()).attachment());assertEquals(409,assertThrows(AccessFailure.class,()->local.create(old.id(),new ReviewService.Input(generation,oldNote.getId(),"Former concern","","",null,""),"Test")).status);
    }
    @Test void importAsIndependentWorkspaceRetainsReviewProvenanceInNewNamespace() throws Exception {
        var note=notes.createNote("Fork source",doc("Original text"));var review=reviews.create(UUID.randomUUID().toString(),input(note.getId(),note.getRevision()),"Phone provenance");var op=transfers.export("workspace","zip");for(int n=0;n<200&&!Set.of("SUCCEEDED","FAILED").contains(transferState(transfers,op.id()).status());n++)Thread.sleep(25);assertEquals("SUCCEEDED",transferState(transfers,op.id()).status());byte[] archive=Files.readAllBytes(transfers.download(op.id()));String fork=UUID.randomUUID().toString();workspaceImports.preview(fork,"Independent review copy",null,new MockMultipartFile("file","fork.zip","application/zip",archive));workspaceImports.commit(fork);for(int n=0;n<300&&!Set.of("SUCCEEDED","FAILED").contains(workspaceImports.get(fork).state());n++)Thread.sleep(25);assertEquals("SUCCEEDED",workspaceImports.get(fork).state());var context=registry.open(fork).context();var copy=context.getBean(ReviewService.class).get(review.id());assertEquals(review.resourceId(),copy.resourceId());assertEquals("Phone provenance",copy.author());assertNotEquals(review.revision(),copy.revision());assertNotEquals(identity.current().id(),context.getBean(WorkspaceIdentityService.class).current().id());
        for(int version:new int[]{3,5}) {
            var bytes=new java.io.ByteArrayOutputStream();try(var output=new ZipOutputStream(bytes);var input=new ZipInputStream(new java.io.ByteArrayInputStream(archive))){ZipEntry entry;while((entry=input.getNextEntry())!=null){byte[] body=input.readAllBytes();if(entry.getName().equals("manifest.json")){var m=(tools.jackson.databind.node.ObjectNode)json.readTree(body);m.put("version",version);body=json.writeValueAsBytes(m);}output.putNextEntry(new ZipEntry(entry.getName()));output.write(body);output.closeEntry();}}
            assertThrows(IllegalArgumentException.class,()->transfers.preview(new MockMultipartFile("file","unsupported.zip","application/zip",bytes.toByteArray())));
        }
    }
    @Test void formerGenerationCannotLeakEvenAfterReviewUnawareReplacement() throws Exception {
        String child=UUID.randomUUID().toString();catalog.create(child,"Generation isolation");var context=registry.open(child).context();var local=context.getBean(ReviewService.class);var ids=context.getBean(WorkspaceIdentityService.class);var note=context.getBean(ResourceService.class).createNote("Same identifier",doc("Original text"));String prior=ids.current().generation();var old=local.create(UUID.randomUUID().toString(),new ReviewService.Input(prior,note.getId(),"Former evidence","","",null,""),"Phone");
        ids.replaced();assertEquals(0,local.list("all",null,0,100).totalItems());assertEquals(404,assertThrows(AccessFailure.class,()->local.get(old.id())).status);assertTrue(local.snapshot(null).isEmpty());assertEquals(409,assertThrows(AccessFailure.class,()->local.create(old.id(),new ReviewService.Input(ids.current().generation(),note.getId(),"Reassigned","","",null,""),"Phone")).status);
        var current=local.create(UUID.randomUUID().toString(),new ReviewService.Input(ids.current().generation(),note.getId(),"New concern","","",null,""),"Phone");assertEquals(1,local.list("all",null,0,100).totalItems());assertEquals(current.id(),local.snapshot(null).getFirst().id());assertEquals(2,context.getBean(org.springframework.jdbc.core.JdbcTemplate.class).queryForObject("SELECT COUNT(*) FROM review_items",Integer.class));
    }
    @Test void unpublishedUnscopedMigrationQuarantinesInsteadOfGuessing() throws Exception {
        var source=new org.springframework.jdbc.datasource.DriverManagerDataSource("jdbc:sqlite:"+DATA.resolve("unscoped-review.db"));var jdbc=new org.springframework.jdbc.core.JdbcTemplate(source);jdbc.execute("CREATE TABLE review_items(id TEXT PRIMARY KEY,resource_id TEXT,fingerprint TEXT,evidence TEXT,status TEXT,revision TEXT,created_at TEXT,updated_at TEXT)");String old=UUID.randomUUID().toString();jdbc.update("INSERT INTO review_items VALUES(?,?,?,?,?,?,?,?)",old,UUID.randomUUID().toString(),"unchanged-fingerprint","{}","open","validator","2026-10-14T00:00:00Z","2026-10-14T00:00:00Z");var scopedIdentity=org.mockito.Mockito.mock(WorkspaceIdentityService.class);org.mockito.Mockito.when(scopedIdentity.current()).thenReturn(new WorkspaceIdentityService.Identity("workspace","current"));var store=new ReviewService(jdbc,org.mockito.Mockito.mock(ResourceRepository.class),scopedIdentity,json,org.mockito.Mockito.mock(ChangeFeed.class));org.springframework.test.util.ReflectionTestUtils.invokeMethod(store,"init");org.springframework.test.util.ReflectionTestUtils.invokeMethod(store,"init");assertEquals(1,jdbc.queryForObject("SELECT COUNT(*) FROM review_items",Integer.class));assertEquals("unscoped",jdbc.queryForObject("SELECT generation FROM review_items WHERE id=?",String.class,old));assertEquals(0,store.list("all",null,0,100).totalItems());assertEquals(404,assertThrows(AccessFailure.class,()->store.get(old)).status);
    }
}
