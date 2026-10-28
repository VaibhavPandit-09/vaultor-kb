package com.vaultor.vaultor;
import com.vaultor.vaultor.service.*;
import com.vaultor.vaultor.repository.*;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.jdbc.core.JdbcTemplate;
import org.junit.jupiter.api.Test;
import java.nio.file.*;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

@SpringBootTest
class TrashPurgeTest {
 static final Path DATA;static{try{DATA=Files.createTempDirectory("vaultor-trash-snapshot-");}catch(Exception e){throw new ExceptionInInitializerError(e);}}
 @DynamicPropertySource static void properties(DynamicPropertyRegistry p){p.add("spring.datasource.url",()->"jdbc:sqlite:"+DATA.resolve("app.db"));p.add("app.storage.path",()->DATA.resolve("files").toString());p.add("app.host.path",()->DATA.resolve("host").toString());}
 @Autowired TrashPurgeService purge;@Autowired ResourceLifecycleService lifecycle;@Autowired ResourceService service;@Autowired ResourceRepository resources;@Autowired WorkspaceIdentityService identity;@Autowired JdbcTemplate jdbc;
 @Autowired LinkedReferences linked;@Autowired tools.jackson.databind.ObjectMapper json;
 @MockitoSpyBean FileStorageService files;
 String doc(){return "{\"type\":\"doc\",\"content\":[]}";}
 ResourceLifecycleService.Item item(String id,String action){return new ResourceLifecycleService.Item(UUID.randomUUID().toString(),id,action,resources.findById(id).orElseThrow().getRevision());}
 @Test void allPagesExactSnapshotProtectsNewEntriesAndReplaysDurableBatches() {
  for(int count:new int[]{0,1,100,101,274,2000}){
   // Disposable real SQLite, metadata fixture avoids fetching document bodies.
   jdbc.update("delete from resources");
   var input=new ArrayList<Object[]>();for(int n=0;n<count;n++)input.add(new Object[]{UUID.randomUUID().toString(),UUID.randomUUID().toString()});
   jdbc.batchUpdate("insert into resources(id,type,title,content,revision_seed,revision_number,created_at,updated_at,trashed_at,purge_pending) values(?,'note','Disposable trash','{\"type\":\"doc\",\"content\":[]}',?,0,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,0)",input);
   String id=UUID.randomUUID().toString();var snapshot=purge.preview(id);assertEquals(count,snapshot.total());assertEquals(snapshot,purge.preview(id));assertThrows(Exception.class,()->purge.step(id));
   assertThrows(Exception.class,()->purge.confirm(id,new TrashPurgeService.Confirmation(snapshot.generation(),count+1)));
   var late=service.createNote("New trash after snapshot",doc());lifecycle.apply(item(late.getId(),"trash"));
   purge.confirm(id,new TrashPurgeService.Confirmation(snapshot.generation(),count));
   TrashPurgeService.Status status=purge.get(id);for(int batch=0;status.pending()>0&&batch<50;batch++)status=purge.step(id);
   assertEquals(count,status.done());assertEquals(0,status.pending());assertTrue(resources.existsById(late.getId()));assertEquals(status,purge.step(id));assertEquals(status,purge.get(id));
   lifecycle.apply(item(late.getId(),"purge"));
  }
 }
 @Test void restoredAndChangedRevisionsAreNeverSweptAndCleanupRetryUsesOriginalReceipt()throws Exception {
  jdbc.update("delete from resources");
  var note=service.createNote("Restored",doc());lifecycle.apply(item(note.getId(),"trash"));var file=service.uploadFile(new MockMultipartFile("file","owned.txt","text/plain","original".getBytes()));lifecycle.apply(item(file.getId(),"trash"));
  String id=UUID.randomUUID().toString();var snapshot=purge.preview(id);lifecycle.apply(item(note.getId(),"restore"));
  purge.confirm(id,new TrashPurgeService.Confirmation(snapshot.generation(),snapshot.total()));
  doThrow(new java.io.IOException("Injected disposable failure")).when(files).deleteFile(file.getFilePath());var status=purge.step(id);assertTrue(status.failures().stream().anyMatch(value->value.status().equals("cleanup-pending")));var receipt=lifecycle.pending(file.getId());
  doCallRealMethod().when(files).deleteFile(file.getFilePath());status=purge.step(id);assertFalse(resources.existsById(file.getId()));assertEquals("purged",lifecycle.apply(receipt).status());assertNull(resources.findById(note.getId()).orElseThrow().getTrashedAt());assertEquals(1,status.pending());
 }
 @Test void replacementGenerationRefusesOldSnapshots(){String id=UUID.randomUUID().toString();purge.preview(id);identity.replaced();assertThrows(Exception.class,()->purge.get(id));assertThrows(Exception.class,()->purge.step(id));}
 @Test void linkedMetadataPurgePreservesExternalOriginalAndUnconfirmedPreviewCanBeCancelled()throws Exception{
  jdbc.update("delete from resources");Path external=DATA.resolve("external/original.md");Files.createDirectories(external.getParent());Files.writeString(external,"# External original remains owned by its folder\n");byte[] before=Files.readAllBytes(external);
  var reference=linked.register(UUID.randomUUID().toString(),new LinkedReferences.Input("Original",json.valueToTree(Map.of("type","linkedDocument","version",1,"sourceId",UUID.randomUUID().toString(),"sourceName","External","relativePath","original.md"))));lifecycle.apply(item(reference.getId(),"trash"));
  String cancelled=UUID.randomUUID().toString();purge.preview(cancelled);purge.cancelPreview(cancelled);assertThrows(Exception.class,()->purge.get(cancelled));assertTrue(resources.existsById(reference.getId()));
  String id=UUID.randomUUID().toString();var snapshot=purge.preview(id);purge.confirm(id,new TrashPurgeService.Confirmation(snapshot.generation(),snapshot.total()));assertThrows(Exception.class,()->purge.cancelPreview(id));assertEquals(1,purge.step(id).done());assertFalse(resources.existsById(reference.getId()));assertArrayEquals(before,Files.readAllBytes(external));
 }
}
