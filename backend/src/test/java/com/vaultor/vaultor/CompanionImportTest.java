package com.vaultor.vaultor;
import com.vaultor.vaultor.service.*;
import com.vaultor.vaultor.host.*;
import com.vaultor.vaultor.workspaces.*;
import com.vaultor.vaultor.repository.*;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.*;
import org.springframework.mock.web.MockMultipartFile;
import tools.jackson.databind.ObjectMapper;
import java.nio.file.*;
import java.nio.charset.StandardCharsets;
import java.net.*;
import java.net.http.*;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;

@SpringBootTest(webEnvironment=SpringBootTest.WebEnvironment.RANDOM_PORT)
class CompanionImportTest {
 static final Path DATA;static{try{DATA=Files.createTempDirectory("vaultor-collected-imports-");}catch(Exception e){throw new ExceptionInInitializerError(e);}}
 @DynamicPropertySource static void properties(DynamicPropertyRegistry p){p.add("app.host.network-port",()->"0");p.add("app.host.path",()->DATA.resolve("host-access").toString());p.add("spring.datasource.url",()->"jdbc:sqlite:"+DATA.resolve("app.db"));p.add("app.storage.path",()->DATA.resolve("files").toString());}
 @Autowired CompanionImports imports;@Autowired ResourceRepository resources;@Autowired WorkspaceIdentityService identity;@Autowired ResourceService notes;@Autowired ResourceLifecycleService lifecycle;@Autowired TransferService transfers;@Autowired FileStorageService storage;@Autowired ObjectMapper json;@Autowired CollectedZips zips;@Autowired HostAccess access;@Autowired WorkspaceCatalog catalog;
 @Autowired HostListener listener;
 MockMultipartFile file(String name,String content){return new MockMultipartFile("file",name,"text/plain",content.getBytes(StandardCharsets.UTF_8));}
 CompanionImports.Intent intent(MockMultipartFile f,String mode,String collection)throws Exception{return new CompanionImports.Intent(identity.current().generation(),f.getOriginalFilename(),f.getContentType(),CompanionImports.hash(f.getInputStream()),f.getSize(),mode,collection);}
 String id(){return UUID.randomUUID().toString();}
 TransferService.Operation await(String id)throws Exception{for(int n=0;n<400;n++){try{var r=transfers.get(id);if(Set.of("SUCCEEDED","FAILED").contains(r.status()))return r;}catch(org.springframework.web.server.ResponseStatusException e){if(e.getStatusCode().value()!=409)throw e;}Thread.sleep(25);}throw new AssertionError("Transfer did not settle");}
 @Test void exactReceiptSurvivesEditTrashRestoreAndPurgeWithoutRecreation()throws Exception {
  var f=file("original.txt","Original\r\nexact bytes");var input=intent(f,"text",null);String id=id();var receipt=imports.create(id,input,f,"device");assertEquals(1,receipt.version());assertEquals("note",receipt.kind());assertArrayEquals(f.getBytes(),Files.readAllBytes(imports.original(id)));
  var r=resources.findById(id).orElseThrow();notes.updateNote(id,"Edited note","{\"type\":\"doc\",\"content\":[{\"type\":\"paragraph\"}]}",'"'+r.getRevision()+'"');assertEquals(receipt,imports.create(id,input,f,"device"));
  r=resources.findById(id).orElseThrow();lifecycle.apply(new ResourceLifecycleService.Item(id(),id,"trash",r.getRevision()));assertArrayEquals(f.getBytes(),Files.readAllBytes(imports.original(id)));r=resources.findById(id).orElseThrow();lifecycle.apply(new ResourceLifecycleService.Item(id(),id,"restore",r.getRevision()));
  r=resources.findById(id).orElseThrow();lifecycle.apply(new ResourceLifecycleService.Item(id(),id,"trash",r.getRevision()));r=resources.findById(id).orElseThrow();assertEquals("purged",lifecycle.apply(new ResourceLifecycleService.Item(id(),id,"purge",r.getRevision())).status());assertEquals(receipt,imports.get(id,input.generation(),"device"));assertEquals(receipt,imports.create(id,input,f,"device"));assertFalse(resources.existsById(id));
 }
 @Test void sameUuidDifferentIntentOrDeviceNeverOverwrites()throws Exception {
  var f=file("same.txt","same");var in=intent(f,"original",null);String id=id();var receipt=imports.create(id,in,f,"device");assertEquals(receipt,imports.create(id,in,f,"device"));assertEquals(409,assertThrows(AccessFailure.class,()->imports.create(id,in,f,"other-device")).status);var different=file("same.txt","different");assertEquals(409,assertThrows(AccessFailure.class,()->imports.create(id,intent(different,"original",null),different,"device")).status);assertEquals(404,assertThrows(AccessFailure.class,()->imports.get(id,in.generation(),"other-device")).status);
 }
 @Test void duplicateNamesCreateDistinctItemsAndRemovedCollectionDoesNotFallBack()throws Exception {
  var f=file("duplicate.txt","original");String first=id(),second=id();imports.create(first,intent(f,"original",null),f,"device");imports.create(second,intent(f,"original",null),f,"device");assertNotEquals(first,second);String missing=id();assertThrows(Exception.class,()->imports.create(missing,intent(f,"original",id()),f,"device"));assertFalse(resources.existsById(missing));assertEquals(404,assertThrows(AccessFailure.class,()->imports.get(missing,identity.current().generation(),"device")).status);
 }
 @Test void conversionIsStructuredAndInertWithOriginalEncodingRetained()throws Exception {
  var f=file("safe.md","# Heading\n\n- **bold**\n- [bad](javascript:alert)\n\n![original](http://unfetched/image)\n\n<script>alert(1)</script>\n\n```java\ncode();\n```\n");String id=id();var result=imports.create(id,intent(f,"markdown",null),f,"device");var content=resources.findById(id).orElseThrow().getContent();assertTrue(content.contains("heading"));assertTrue(content.contains("bulletList"));assertTrue(content.contains("bold"));assertFalse(content.contains("\"type\":\"image\""));assertTrue(result.warnings().size()>=2);assertArrayEquals(f.getBytes(),Files.readAllBytes(imports.original(id)));
  var utf16=new MockMultipartFile("file","utf16.txt","text/plain",new byte[]{(byte)255,(byte)254,65,0,13,0,10,0,66,0});String other=id();imports.create(other,intent(utf16,"text",null),utf16,"device");assertArrayEquals(utf16.getBytes(),Files.readAllBytes(imports.original(other)));
 }
 @Test void wrongHashEncodingLimitAndModeFailBeforeResourceCreation()throws Exception {
  var bad=new MockMultipartFile("file","binary.txt","text/plain",new byte[]{(byte)0xc3,0x28});assertEquals("IMPORT_ENCODING_UNSUPPORTED",assertThrows(AccessFailure.class,()->imports.create(id(),intent(bad,"text",null),bad,"device")).code);
  var f=file("good.txt","good");var in=intent(f,"text",null);assertEquals(400,assertThrows(AccessFailure.class,()->imports.create(id(),new CompanionImports.Intent(in.generation(),in.filename(),in.mime(),"0".repeat(64),in.bytes(),in.mode(),null),f,"device")).status);
  var huge=new MockMultipartFile("file","huge.txt","text/plain",new byte[5*1024*1024+1]);assertEquals(413,assertThrows(AccessFailure.class,()->imports.create(id(),intent(huge,"text",null),huge,"device")).status);
  assertEquals(400,assertThrows(AccessFailure.class,()->imports.create(id(),intent(f,"unsupported",null),f,"device")).status);
 }
 @Test void generationRefusalIsInsideCommitAndReceiptsAreNotRetargeted()throws Exception {
  var f=file("generation.txt","source");var in=intent(f,"text",null);var old=new CompanionImports.Intent(id(),in.filename(),in.mime(),in.sha256(),in.bytes(),in.mode(),null);String id=id();assertEquals("IMPORT_GENERATION_CHANGED",assertThrows(AccessFailure.class,()->imports.create(id,old,f,"device")).code);assertFalse(resources.existsById(id));
 }
 @Test void workspaceTransferPreservesHiddenOriginalBytesAndRemapsWithNote()throws Exception {
  var f=file("portable.md","# Portable original\r\nExact input");String original=id();imports.create(original,intent(f,"markdown",null),f,"device");var exported=transfers.export("workspace","zip");assertEquals("SUCCEEDED",await(exported.id()).status());byte[] bytes=Files.readAllBytes(transfers.download(exported.id()));
  try(var zip=new java.util.zip.ZipInputStream(new java.io.ByteArrayInputStream(bytes))){boolean found=false;java.util.zip.ZipEntry entry;while((entry=zip.getNextEntry())!=null){if(entry.getName().equals("originals/"+original)){assertArrayEquals(f.getBytes(),zip.readAllBytes());found=true;}if(entry.getName().equals("manifest.json"))assertEquals(5,json.readTree(zip.readAllBytes()).path("version").asInt());}assertTrue(found);}
  var preview=transfers.preview(new MockMultipartFile("file","portable.zip","application/zip",bytes));var result=transfers.commit(preview.operation().id(),"merge");assertEquals("SUCCEEDED",await(result.id()).status());var copied=resources.findAll().stream().filter(r->!r.getId().equals(original)&&"portable.md".equals(r.getImportOriginalName())).findFirst().orElseThrow();assertArrayEquals(f.getBytes(),Files.readAllBytes(imports.original(copied.getId())));assertEquals("note",copied.getType());assertEquals(1,resources.findAll().stream().filter(r->r.getId().equals(copied.getId())).count());
 }
 Map<String,String> pair()throws Exception{var e=access.enroll(new HostAccess.Enrollment("Collecting phone","agent",HostAccess.secret(),access.trust.fingerprint()));access.decide((String)e.get("id"),(String)e.get("code"),true);var d=access.complete((String)e.get("id"),(String)e.get("secret"));catalog.grant(catalog.defaultId(),d.get("deviceId"),true);return d;}
 @Test void zipWaitsForOwnerDangerousArchiveRejectsAndRevocationRetainsRequest()throws Exception {
  var paired=pair();String device=paired.get("deviceId"),id=id();byte[] bad="not a workspace ZIP".getBytes();var input=new CollectedZips.Input(access.hostId,catalog.defaultId(),identity.current().generation(),"workspace.zip",CompanionImports.hash(new java.io.ByteArrayInputStream(bad)),bad.length,"Proposed workspace");var f=new MockMultipartFile("file","workspace.zip","application/zip",bad);
  int before=catalog.list(null).size();assertEquals("AWAITING_OWNER",zips.submit(id,input,f,device).state());assertEquals("AWAITING_OWNER",zips.submit(id,input,f,device).state());assertEquals(409,assertThrows(AccessFailure.class,()->zips.approve(id)).status);assertThrows(Exception.class,()->zips.preview(id));assertEquals(before,catalog.list(null).size());catalog.grant(catalog.defaultId(),device,false);assertEquals(404,assertThrows(AccessFailure.class,()->zips.get(id,device)).status);assertTrue(Files.exists(DATA.resolve("collected-zips").resolve(id).resolve("archive.zip")));catalog.grant(catalog.defaultId(),device,true);zips.reject(id);
 }
 @Test void realPairedHttpsCannotAuthorizeZipOrUseOwnerImportRoutes()throws Exception {
  var d=pair();var store=java.security.KeyStore.getInstance("PKCS12");store.load(null,null);store.setCertificateEntry("host",access.trust.ca());var tm=javax.net.ssl.TrustManagerFactory.getInstance(javax.net.ssl.TrustManagerFactory.getDefaultAlgorithm());tm.init(store);var ssl=javax.net.ssl.SSLContext.getInstance("TLS");ssl.init(null,tm.getTrustManagers(),null);var client=HttpClient.newBuilder().sslContext(ssl).build();String base="https://127.0.0.1:"+listener.set(true).get("port")+"/api";
  try{for(String path:List.of("/owner/collected-zips/"+id()+"/approve","/workspace-imports/"+id()+"/commit")){var response=client.send(HttpRequest.newBuilder(URI.create(base+path)).header("Authorization","Bearer "+d.get("credential")).POST(HttpRequest.BodyPublishers.noBody()).build(),HttpResponse.BodyHandlers.ofString());assertEquals(403,response.statusCode());}}finally{listener.set(false);}
 }
}
