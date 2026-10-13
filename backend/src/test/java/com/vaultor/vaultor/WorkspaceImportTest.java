package com.vaultor.vaultor;
import com.vaultor.vaultor.host.*;
import com.vaultor.vaultor.workspaces.*;
import com.vaultor.vaultor.service.*;
import com.vaultor.vaultor.repository.*;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.mock.web.MockMultipartFile;
import java.nio.file.*;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
@SpringBootTest(webEnvironment=SpringBootTest.WebEnvironment.RANDOM_PORT)
@TestMethodOrder(MethodOrderer.OrderAnnotation.class)
class WorkspaceImportTest {
 static final Path DATA;static {try{DATA=Files.createTempDirectory("vaultor-fork-test-");}catch(Exception e){throw new ExceptionInInitializerError(e);}}
 @DynamicPropertySource static void properties(DynamicPropertyRegistry p){p.add("app.host.network-port",()->"0");p.add("app.host.path",()->DATA.resolve("host-access").toString());p.add("spring.datasource.url",()->"jdbc:sqlite:"+DATA.resolve("app.db"));p.add("app.storage.path",()->DATA.resolve("files").toString());}
 @Autowired org.springframework.core.env.Environment env;@Autowired tools.jackson.databind.ObjectMapper json;
 @Autowired WorkspaceImports imports;@Autowired WorkspaceCatalog catalog;@Autowired WorkspaceRegistry registry;@Autowired TransferService transfers;@Autowired FileImportService files;
 static byte[] archive;static String resource=UUID.randomUUID().toString(),destination=UUID.randomUUID().toString();
 WorkspaceImports.Receipt waitFor(String id)throws Exception{for(int n=0;n<200;n++){var r=imports.get(id);if(List.of("SUCCEEDED","FAILED").contains(r.state()))return r;Thread.sleep(50);}throw new AssertionError("Import timeout");}
 @Test @Order(1) void previewDoesNotPublishCommitIsAtomicAndRetriesPreserveIds()throws Exception{
  files.create(resource,"Original bytes",null,new MockMultipartFile("file","original.txt","text/plain","unchanged-original".getBytes()),null);
  var op=transfers.export("workspace","zip");for(int n=0;n<200&&!transfers.get(op.id()).status().equals("SUCCEEDED");n++)Thread.sleep(50);archive=Files.readAllBytes(transfers.download(op.id()));
  var input=new MockMultipartFile("file","workspace.zip","application/zip",archive);var first=imports.preview(destination,"Independent",null,input);assertEquals("PREVIEW",first.state());assertEquals(1,catalog.list(null).size());assertThrows(AccessFailure.class,()->catalog.require(destination));assertThrows(AccessFailure.class,()->catalog.create(destination,"Independent"));
  assertEquals(first,imports.preview(destination,"Independent",null,input));assertThrows(AccessFailure.class,()->imports.preview(destination,"Different",null,input));
  imports.commit(destination);imports.commit(destination);assertEquals("SUCCEEDED",waitFor(destination).state());assertEquals(2,catalog.list(null).size());assertEquals(destination,registry.open(destination).context().getBean(WorkspaceIdentityService.class).current().id());
  var r=registry.open(destination).context().getBean(ResourceRepository.class).findById(resource).orElseThrow();assertEquals("Original bytes",r.getTitle());assertEquals("unchanged-original",Files.readString(registry.open(destination).context().getBean(FileStorageService.class).getFile(r.getFilePath())));
  assertEquals("SUCCEEDED",imports.commit(destination).state());assertEquals(2,catalog.list(null).size());assertEquals("SUCCEEDED",imports.preview(destination,"Independent",null,input).state());
 }
 @Test @Order(2) void damagedArchiveStaysPrivateAndCancellationReleasesReservation()throws Exception{
  String id=UUID.randomUUID().toString();assertThrows(Exception.class,()->imports.preview(id,"Bad ZIP",null,new MockMultipartFile("file","bad.zip","application/zip","invalid".getBytes())));assertEquals("FAILED",imports.get(id).state());assertEquals(2,catalog.list(null).size());assertEquals("CANCELLED",imports.cancel(id).state());assertEquals("CANCELLED",imports.cancel(id).state());
  String retry=UUID.randomUUID().toString();imports.preview(retry,"Retry after cancel",null,new MockMultipartFile("file","workspace.zip","application/zip",archive));imports.cancel(retry);assertEquals(2,catalog.list(null).size());
 }
 @Test @Order(3) void replacementCheckpointIncludesPreviousOriginals()throws Exception{
  var preview=transfers.preview(new MockMultipartFile("file","workspace.zip","application/zip",archive));var before=registry.open(catalog.defaultId()).context().getBean(WorkspaceIdentityService.class).current();transfers.commit(preview.operation().id(),"replace");for(int n=0;n<200&&!transfers.get(preview.operation().id()).status().equals("SUCCEEDED");n++)Thread.sleep(50);assertEquals("SUCCEEDED",transfers.get(preview.operation().id()).status());assertTrue(Files.size(DATA.resolve("operations").resolve(preview.operation().id()).resolve("replacement-before.zip"))>0);assertNotEquals(before.generation(),registry.open(catalog.defaultId()).context().getBean(WorkspaceIdentityService.class).current().generation());
 }
 @Test @Order(4) void readyPublicationAndPreviewReservationResumeAfterRestart()throws Exception{
  String id=UUID.randomUUID().toString();var receipt=imports.preview(id,"Resume",null,new MockMultipartFile("file","workspace.zip","application/zip",archive));
  var interrupted=new WorkspaceImports.Receipt(1,id,receipt.name(),receipt.sha256(),"COMMITTING",receipt.operationId(),receipt.preview(),null,receipt.copiedAt(),"Interrupted before worker dispatch");Files.write(catalog.directory.resolveSibling("workspace-imports").resolve(id).resolve("receipt.json"),json.writeValueAsBytes(interrupted));assertEquals("FAILED",imports.get(id).state());
  var t=registry.prepare(id,catalog.directory.resolveSibling("workspace-imports").resolve(id).resolve("staging")).context().getBean(TransferService.class);t.commit(receipt.operationId(),"replace");for(int n=0;n<200&&!t.get(receipt.operationId()).status().equals("SUCCEEDED");n++)Thread.sleep(50);assertEquals("SUCCEEDED",t.get(receipt.operationId()).status());
  var ready=new WorkspaceImports.Receipt(1,id,receipt.name(),receipt.sha256(),"READY",receipt.operationId(),receipt.preview(),null,receipt.copiedAt(),"Ready before interrupted publication");Path path=catalog.directory.resolveSibling("workspace-imports").resolve(id).resolve("receipt.json");Files.write(path,json.writeValueAsBytes(ready));
  var restarted=new WorkspaceImports(catalog,registry,json,536870912);try{assertEquals("SUCCEEDED",restarted.get(id).state());catalog.rename(id,"Renamed after import");assertEquals("SUCCEEDED",restarted.get(id).state());assertEquals("Renamed after import",catalog.require(id).name());}finally{restarted.stop();}
 }
 @Test @Order(5) void ownerMultipartRouteAndPrivateReceiptAccess()throws Exception{
  String id=UUID.randomUUID().toString(),boundary="vaultor-w3-boundary",base="http://127.0.0.1:"+env.getProperty("local.server.port")+"/api";var client=java.net.http.HttpClient.newHttpClient();
  var denied=java.net.http.HttpRequest.newBuilder(java.net.URI.create(base+"/workspace-imports")).GET().build();assertEquals(401,client.send(denied,java.net.http.HttpResponse.BodyHandlers.ofString()).statusCode());
  var body=new java.io.ByteArrayOutputStream();body.write(("--"+boundary+"\r\nContent-Disposition: form-data; name=\"name\"\r\n\r\nHTTP import\r\n--"+boundary+"\r\nContent-Disposition: form-data; name=\"file\"; filename=\"workspace.zip\"\r\nContent-Type: application/zip\r\n\r\n").getBytes());body.write(archive);body.write(("\r\n--"+boundary+"--\r\n").getBytes());
  var request=java.net.http.HttpRequest.newBuilder(java.net.URI.create(base+"/workspace-imports/"+id)).header("X-Vaultor-Owner",Files.readString(DATA.resolve("host-access/owner.key"))).header("Content-Type","multipart/form-data; boundary="+boundary).PUT(java.net.http.HttpRequest.BodyPublishers.ofByteArray(body.toByteArray())).build();var result=client.send(request,java.net.http.HttpResponse.BodyHandlers.ofString());assertEquals(200,result.statusCode(),result.body());assertEquals("PREVIEW",json.readTree(result.body()).path("state").asText());imports.cancel(id);
 }

 @Test @Order(6) void reservationConsumesCapacityAndCancelReturnsIt()throws Exception {
  String id=UUID.randomUUID().toString();imports.preview(id,"Reserved",null,new MockMultipartFile("file","workspace.zip","application/zip",archive));assertThrows(AccessFailure.class,()->imports.preview(UUID.randomUUID().toString(),"Another",null,new MockMultipartFile("file","workspace.zip","application/zip",archive)));
  while(catalog.list(null).size()<WorkspaceCatalog.LIMIT-1)catalog.create(UUID.randomUUID().toString(),"Bounded");assertThrows(AccessFailure.class,()->catalog.create(UUID.randomUUID().toString(),"No remaining slot"));imports.cancel(id);catalog.create(UUID.randomUUID().toString(),"Released slot");assertEquals(WorkspaceCatalog.LIMIT,catalog.list(null).size());
 }

}
