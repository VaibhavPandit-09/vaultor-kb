package com.vaultor.vaultor;
import com.vaultor.vaultor.service.*;
import com.vaultor.vaultor.repository.*;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.transaction.support.TransactionTemplate;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.ObjectMapper;
import java.nio.file.*;
import java.util.*;
import java.io.*;
import java.util.zip.*;
import java.sql.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

@SpringBootTest
class ResourceLifecycleTest {
 static final Path DATA;
 static {try {DATA=Files.createTempDirectory("vaultor-lifecycle-");
  try(var connection=DriverManager.getConnection("jdbc:sqlite:"+DATA.resolve("app.db"));var statement=connection.createStatement()) {
   statement.execute("create table resources(id varchar primary key,type varchar not null,title varchar not null,content TEXT,file_path varchar,mime_type varchar,size bigint,favorite boolean,revision_number bigint not null default 0,revision_seed varchar,import_fingerprint varchar,created_at timestamp not null,updated_at timestamp not null,last_opened_at timestamp)");
   try(var insert=connection.prepareStatement("insert into resources(id,type,title,content,revision_seed,created_at,updated_at) values('legacy','note','Legacy','{\"type\":\"doc\",\"content\":[]}','old-seed',?,?)")){insert.setTimestamp(1,new Timestamp(System.currentTimeMillis()));insert.setTimestamp(2,new Timestamp(System.currentTimeMillis()));insert.executeUpdate();}
  }
 }catch(Exception e){throw new ExceptionInInitializerError(e);}}
 @DynamicPropertySource static void properties(DynamicPropertyRegistry p) {p.add("spring.datasource.url",()->"jdbc:sqlite:"+DATA.resolve("app.db"));p.add("app.storage.path",()->DATA.resolve("files").toString());p.add("app.host.path",()->DATA.resolve("host").toString());}
 @Autowired ResourceService service; @Autowired ResourceLifecycleService lifecycle; @Autowired ResourceRepository resources;
 @Autowired ResourceBrowseService browse; @Autowired OrganizationService organization; @Autowired TagService tags;
 @Autowired ResourceSearchService search; @Autowired TransferService transfers; @Autowired ObjectMapper json;
 @Autowired TransactionTemplate tx;
 @Autowired FileImportService imports;
 @Autowired com.vaultor.vaultor.controller.ResourceController controller;
 @MockitoSpyBean FileStorageService files;
 String doc(String text){return "{\"type\":\"doc\",\"content\":[{\"type\":\"paragraph\",\"content\":[{\"type\":\"text\",\"text\":\""+text+"\"}]}]}";}
 ResourceLifecycleService.Item item(String id,String action){return new ResourceLifecycleService.Item(UUID.randomUUID().toString(),id,action,resources.findById(id).orElseThrow().getRevision());}
 @Test void additiveMigrationKeepsLegacyActiveAndRevisionConflictDoesNotMutate() {
  var legacy=resources.findById("legacy").orElseThrow();assertNull(legacy.getTrashedAt());assertNotNull(browse.byIds(List.of("legacy")).get("legacy").revision());
  var stale=item("legacy","trash");service.updateNote("legacy","Changed",doc("new"));assertThrows(RuntimeException.class,()->lifecycle.apply(stale));assertNull(resources.findById("legacy").orElseThrow().getTrashedAt());
 }
 @Test void oldDestructiveContractsAreRetiredAndLifecycleRequiresProtocolThree() {
  var note=service.createNote("Compatibility",doc("protected original"));
  assertEquals(405,assertThrows(org.springframework.web.server.ResponseStatusException.class,()->controller.delete(note.getId())).getStatusCode().value());
  assertEquals(405,assertThrows(org.springframework.web.server.ResponseStatusException.class,()->controller.replace(note.getId(),Map.of("newResourceId","anything"))).getStatusCode().value());
  assertEquals(426,assertThrows(org.springframework.web.server.ResponseStatusException.class,()->controller.lifecycle(List.of(item(note.getId(),"trash")),2)).getStatusCode().value());
  assertNull(resources.findById(note.getId()).orElseThrow().getTrashedAt());
 }
 @Test void lateImportRetryCannotResurrectTrashedOrPurgedOriginal() throws Exception {
  String id=UUID.randomUUID().toString(),content=doc("retry original");imports.create(id,"Original",content,null);
  lifecycle.apply(item(id,"trash"));assertThrows(org.springframework.web.server.ResponseStatusException.class,()->imports.create(id,"Original",content,null));
  lifecycle.apply(item(id,"purge"));assertThrows(org.springframework.web.server.ResponseStatusException.class,()->imports.create(id,"Original",content,null));assertFalse(resources.existsById(id));
 }
 @Test void trashRestoreRetainsIdentityBytesOrganizationAndReferences() throws Exception {
  var file=service.uploadFile(new MockMultipartFile("file","original.txt","text/plain","original bytes".getBytes()));
  var note=service.createNote("Referrer","{\"type\":\"doc\",\"content\":[{\"type\":\"paragraph\",\"content\":[{\"type\":\"resourceLink\",\"attrs\":{\"resourceId\":\""+file.getId()+"\",\"label\":\"Original\",\"type\":\"file\"}}]}]}");
  var col=organization.createOnce(UUID.randomUUID().toString(),new OrganizationService.CreationInput("Disposable membership",List.of(file.getId())));
  tags.addTagToResource(file.getId(),"lifecycle-tag");browse.favorite(file.getId(),true);
  var request=item(file.getId(),"trash");assertEquals("trashed",lifecycle.apply(request).status());assertEquals("trashed",lifecycle.apply(request).status());assertEquals(1,lifecycle.usage(file.getId()).sources());
  assertFalse(browse.byIds(List.of(file.getId())).containsKey(file.getId()));assertEquals(0,organization.get(col.id()).count());assertThrows(RuntimeException.class,()->service.getResourceOrThrow(file.getId()));
  assertEquals("original bytes",Files.readString(files.getFile(file.getFilePath())));
  organization.delete(col.id());var restored=lifecycle.apply(item(file.getId(),"restore"));assertTrue(restored.warnings().contains("No longer available: Collection: Disposable membership"));
  assertTrue(browse.byIds(List.of(file.getId())).get(file.getId()).favorite());assertEquals(1,lifecycle.usage(file.getId()).sources());assertTrue(service.getResourceOrThrow(note.getId()).getContent().contains(file.getId()));
 }
 @Test void partialBulkAndRollbackLeaveSavedContentSafe() {
  var first=service.createNote("Lifecycle active",doc("uniquelifecycleword"));var second=service.createNote("Second",doc("text"));
  var request=item(first.getId(),"trash");var failed=new ResourceLifecycleService.Item(UUID.randomUUID().toString(),second.getId(),"trash","stale");
  var results=lifecycle.bulk(List.of(request,failed));assertEquals("trashed",results.get(0).status());assertEquals("failed",results.get(1).status());assertNull(resources.findById(second.getId()).orElseThrow().getTrashedAt());
  assertEquals(0,search.search("uniquelifecycleword",0,20,null,List.of(),null,false).totalItems());assertThrows(RuntimeException.class,()->service.updateNote(first.getId(),"Resurrect",doc("bad")));
  var restore=item(first.getId(),"restore");tx.executeWithoutResult(status->{lifecycle.apply(restore);status.setRollbackOnly();});assertNotNull(resources.findById(first.getId()).orElseThrow().getTrashedAt());
 }
 @Test void failedBinaryCleanupRetainsDurableRetryAndNeverRestoresHalfPurge() throws Exception {
  var file=service.uploadFile(new MockMultipartFile("file","cleanup.txt","text/plain","bytes".getBytes()));lifecycle.apply(item(file.getId(),"trash"));var purge=item(file.getId(),"purge");
  doThrow(new IOException("Disposable injected cleanup failure")).when(files).deleteFile(file.getFilePath());assertEquals("cleanup-pending",lifecycle.apply(purge).status());
  assertEquals(purge,lifecycle.pending(file.getId()));assertTrue(resources.findById(file.getId()).orElseThrow().getPurgePending());assertThrows(RuntimeException.class,()->lifecycle.apply(item(file.getId(),"restore")));
  doCallRealMethod().when(files).deleteFile(file.getFilePath());assertEquals("purged",lifecycle.apply(lifecycle.pending(file.getId())).status());assertEquals("purged",lifecycle.apply(purge).status());assertFalse(resources.existsById(file.getId()));
 }
 void waitFor(String id) throws Exception {for(int i=0;i<400;i++){var op=transfers.get(id);if(op.status().equals("SUCCEEDED"))return;if(op.status().equals("FAILED"))fail(op.detail());Thread.sleep(25);}fail("Transfer timeout");}
 @Test void completeArchivePreservesTrashAcrossMergeAndReplace() throws Exception {
  var note=service.createNote("Portable Trash",doc("archiveword"));lifecycle.apply(item(note.getId(),"trash"));
  var export=transfers.export("workspace","zip");waitFor(export.id());byte[] archive=Files.readAllBytes(transfers.download(export.id()));
  try(var zip=new ZipInputStream(new ByteArrayInputStream(archive))){ZipEntry entry;boolean version=false,metadata=false;while((entry=zip.getNextEntry())!=null){byte[] data=zip.readAllBytes();if(entry.getName().equals("manifest.json"))version=json.readTree(data).path("version").asInt()==3;if(entry.getName().equals("workspace.json"))metadata=new String(data).contains("trashedAt");}assertTrue(version&&metadata);}
  var preview=transfers.preview(new MockMultipartFile("file","baseline.zip","application/zip",archive));transfers.commit(preview.operation().id(),"merge");waitFor(preview.operation().id());assertTrue(browse.trash(0,100,"Portable Trash").totalItems()>=2);
  var replacement=transfers.preview(new MockMultipartFile("file","baseline.zip","application/zip",archive));transfers.commit(replacement.operation().id(),"replace");waitFor(replacement.operation().id());assertNotNull(resources.findById(note.getId()).orElseThrow().getTrashedAt());
 }
}
