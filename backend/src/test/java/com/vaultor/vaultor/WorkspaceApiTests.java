package com.vaultor.vaultor;

import org.junit.jupiter.api.*;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.core.env.Environment;
import com.vaultor.vaultor.service.*;
import com.vaultor.vaultor.repository.*;
import org.springframework.mock.web.MockMultipartFile;
import tools.jackson.databind.*;
import java.net.*;
import java.net.http.*;
import java.nio.file.*;
import java.util.*;
import java.io.*;
import java.util.zip.*;
import static org.junit.jupiter.api.Assertions.*;

@SpringBootTest(webEnvironment=SpringBootTest.WebEnvironment.RANDOM_PORT)
class WorkspaceApiTests {
    static final Path DATA;
    static { try { DATA=Files.createTempDirectory("vaultor-api-test-"); } catch(Exception e) {throw new ExceptionInInitializerError(e);} }
    @DynamicPropertySource static void properties(DynamicPropertyRegistry p) {
        p.add("spring.datasource.url",()->"jdbc:sqlite:"+DATA.resolve("app.db"));p.add("app.storage.path",()->DATA.resolve("files").toString());
    }
    @Autowired Environment env;
    @Autowired ObjectMapper json;
    @Autowired TransferService transfers;
    @Autowired ResourceRepository resources;
    @Autowired RelationshipRepository relationships;
    @Autowired WorkspaceGate gate;
    @Autowired TransferOperationRepository operationRepository;
    @Autowired ResourceService resourceService;
    @Autowired FileImportService fileImports;
    @Autowired org.springframework.jdbc.core.JdbcTemplate jdbc;
    HttpClient client=HttpClient.newHttpClient();
    HttpResponse<String> request(String method,String path,Object body) throws Exception {
        var builder=HttpRequest.newBuilder(URI.create("http://localhost:"+env.getProperty("local.server.port")+"/api"+path)).header("X-Request-ID","test-request");
        builder.method(method,body==null?HttpRequest.BodyPublishers.noBody():HttpRequest.BodyPublishers.ofString(json.writeValueAsString(body))).header("Content-Type","application/json");
        return client.send(builder.build(),HttpResponse.BodyHandlers.ofString());
    }
    JsonNode ok(String method,String path,Object body) throws Exception {
        var response=request(method,path,body);assertTrue(response.statusCode()<300,response.body());assertEquals("test-request",response.headers().firstValue("X-Request-ID").orElseThrow());
        return response.body().isBlank()?json.createObjectNode():json.readTree(response.body());
    }
    Map<String,Object> note(String title, Object content) { return Map.of("type","note","title",title,"content",content); }
    Object empty() {return Map.of("type","doc","content",List.of());}
    TransferService.Operation await(String id) throws Exception {
        for(int i=0;i<150;i++) {var op=transfers.get(id);if(List.of("SUCCEEDED","FAILED").contains(op.status())) {assertEquals("SUCCEEDED",op.status(),op.detail());return op;}Thread.sleep(50);}
        throw new AssertionError("Transfer timed out");
    }
    @Test void fileAndNoteImportsAreRetrySafeAndNeverOverwrite() throws Exception {
        String fileId=UUID.randomUUID().toString(), noteId=UUID.randomUUID().toString();
        var csv=new MockMultipartFile("file","sample.csv","text/csv","a,b\n1,2".getBytes());
        long before=resources.count();
        try {
            var file=fileImports.create(fileId,"sample.csv",null,csv);
            assertEquals(fileId,fileImports.create(fileId,"sample.csv",null,csv).getId());
            assertEquals(file.getFilePath(),resources.findById(fileId).orElseThrow().getFilePath());
            String body="{\"type\":\"doc\",\"content\":[{\"type\":\"paragraph\",\"content\":[{\"type\":\"text\",\"text\":\"Imported text\"}]}]}";
            fileImports.create(noteId,"Same title",body,null);
            fileImports.create(noteId,"Same title",body,null);
            assertEquals(before+2,resources.count());
            assertEquals(json.readTree(body),ok("GET","/resources/"+noteId,null).get("content"));
            assertThrows(org.springframework.web.server.ResponseStatusException.class,()->fileImports.create(noteId,"Different",body,null));
            assertThrows(IllegalArgumentException.class,()->fileImports.create(UUID.randomUUID().toString(),"Invalid","{}",null));
            assertEquals(before+2,resources.count());
        } finally { if(resources.existsById(fileId)) resourceService.deleteResource(fileId); if(resources.existsById(noteId)) resourceService.deleteResource(noteId); }
    }
    @Test void pastedNumberedListCanBeSavedAndReadBack() throws Exception {
        var content=json.readTree("""
            {"type":"doc","content":[{"type":"orderedList","attrs":{"start":1,"type":null},"content":[{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"Proportional allocation"}]}]}]}]}
            """);
        String id=ok("POST","/resources",note("Paste regression",empty())).path("id").asText();
        try {
            ok("PUT","/resources/"+id+"/note",note("Paste regression",content));
            assertEquals(content,ok("GET","/resources/"+id,null).get("content"));
        } finally { ok("DELETE","/resources/"+id,null); }
    }
    @Test void fullWorkspaceFlowAndInvalidArchives() throws Exception {
        String target=ok("POST","/resources",note("Target",empty())).path("id").asText();
        Object linked=Map.of("type","doc","content",List.of(Map.of("type","paragraph","content",List.of(Map.of("type","resourceLink","attrs",Map.of("resourceId",target,"label","Target","type","note"))))));
        String source=ok("POST","/resources",note("Source",linked)).path("id").asText();
        ok("POST","/resources/"+source+"/tags/research",null);
        assertEquals(1,ok("GET","/resources/"+target+"/backlinks",null).size());
        assertTrue(ok("GET","/resources/"+source,null).path("content").isObject());
        assertEquals(1,ok("GET","/resources?page=0&size=1",null).path("items").size());
        var bad=request("POST","/resources",note("",empty()));assertEquals(400,bad.statusCode());assertEquals("INVALID_REQUEST",json.readTree(bad.body()).path("code").asText());
        String replacement=ok("POST","/resources",note("Replacement",empty())).path("id").asText();
        ok("POST","/resources/"+target+"/replace-links",Map.of("newResourceId",replacement));
        assertTrue(ok("GET","/resources/"+source,null).path("content").toString().contains(replacement));
        assertEquals(400,request("POST","/resources/"+source+"/replace-links",Map.of("newResourceId",source)).statusCode());
        var settings=ok("GET","/settings",null);ok("PUT","/settings",settings);
        var export=transfers.export("workspace","zip");await(export.id());byte[] archive=Files.readAllBytes(transfers.download(export.id()));
        var preview=transfers.preview(new MockMultipartFile("file","workspace.zip","application/zip",archive));assertEquals(2,preview.resources());
        var merge=transfers.commit(preview.operation().id(),"merge");await(merge.id());assertEquals(4,resources.count());
        assertEquals(merge.id(),transfers.commit(merge.id(),"merge").id());assertEquals(4,resources.count());
        assertTrue(ok("GET","/diagnostics/integrity",null).path("healthy").asBoolean());
        var replacementPreview=transfers.preview(new MockMultipartFile("file","workspace.zip","application/zip",archive));await(transfers.commit(replacementPreview.operation().id(),"replace").id());assertEquals(2,resources.count());
        assertTrue(ok("GET","/diagnostics/integrity",null).path("healthy").asBoolean());
        var bytes=new ByteArrayOutputStream();try(var zip=new ZipOutputStream(bytes)) {zip.putNextEntry(new ZipEntry("../escape"));zip.write(1);zip.closeEntry();}
        assertThrows(IllegalArgumentException.class,()->transfers.preview(new MockMultipartFile("file",bytes.toByteArray())));assertEquals(2,resources.count());
        assertThrows(IllegalArgumentException.class,()->transfers.preview(new MockMultipartFile("file",new byte[]{1,2,3})));assertEquals(2,resources.count());
        for(int i=0;i<12;i++) ok("POST","/diagnostics/events",java.util.stream.IntStream.range(0,20).mapToObj(n->Map.of("id","event","message","test","action","test")).toList());
        assertEquals(200,ok("GET","/diagnostics/events",null).size());
        assertEquals(400,request("POST","/diagnostics/events",Collections.nCopies(21,Map.of("message","test"))).statusCode());
        relationships.deleteAll();assertFalse(ok("GET","/diagnostics/integrity",null).path("healthy").asBoolean());
    }
    @Test void restartRecoveryCleansJournalsAndGateRejectsMutations() throws Exception {
        Files.createDirectories(DATA.resolve("files"));
        Files.writeString(DATA.resolve("files/staged-orphan"),"incomplete");
        var interrupted=new com.vaultor.vaultor.model.TransferOperation();interrupted.setKind("import");interrupted.setStatus("RUNNING");interrupted.setJournal("[\"staged-orphan\"]");operationRepository.save(interrupted);
        Files.writeString(DATA.resolve("files/obsolete"),"old");
        var cleanup=new com.vaultor.vaultor.model.TransferOperation();cleanup.setKind("import");cleanup.setStatus("CLEANUP");cleanup.setJournal("[\"obsolete\"]");operationRepository.save(cleanup);
        transfers.init();
        assertEquals("FAILED",transfers.get(interrupted.getId()).status());assertFalse(Files.exists(DATA.resolve("files/staged-orphan")));
        assertEquals("SUCCEEDED",transfers.get(cleanup.getId()).status());assertFalse(Files.exists(DATA.resolve("files/obsolete")));
        gate.exclusive(()->{
            try {var response=request("POST","/resources",note("blocked",empty()));assertEquals(409,response.statusCode());assertEquals("WORKSPACE_BUSY",json.readTree(response.body()).path("code").asText());}
            catch(Exception e) {throw new RuntimeException(e);}
        });
    }
    @Test void failedCommitRollsBackMetadataAndStagedBinaries() throws Exception {
        long original=resources.count();
        var resource=resourceService.createNote("Rollback sentinel",json.writeValueAsString(empty()));
        var binary=resourceService.uploadFile(new MockMultipartFile("file","test.txt","text/plain","bytes".getBytes()));
        var export=transfers.export("workspace","zip");await(export.id());
        byte[] archive=Files.readAllBytes(transfers.download(export.id()));
        var preview=transfers.preview(new MockMultipartFile("file",archive));
        Set<String> before;
        try(var paths=Files.list(DATA.resolve("files"))) {before=paths.map(p->p.getFileName().toString()).collect(java.util.stream.Collectors.toSet());}
        jdbc.execute("CREATE TRIGGER reject_test BEFORE INSERT ON resources WHEN NEW.title='Rollback sentinel' BEGIN SELECT RAISE(ABORT,'injected commit failure'); END");
        try {
            var op=transfers.commit(preview.operation().id(),"replace");
            for(int i=0;i<150 && !transfers.get(op.id()).status().equals("FAILED");i++) Thread.sleep(50);
            assertEquals("FAILED",transfers.get(op.id()).status());assertEquals(original+2,resources.count());
            assertTrue(resources.existsById(resource.getId()));assertTrue(resources.existsById(binary.getId()));
            try(var paths=Files.list(DATA.resolve("files"))) {assertEquals(before,paths.map(p->p.getFileName().toString()).collect(java.util.stream.Collectors.toSet()));}
        } finally {
            jdbc.execute("DROP TRIGGER reject_test");resourceService.deleteResource(resource.getId());resourceService.deleteResource(binary.getId());
        }
    }
}
