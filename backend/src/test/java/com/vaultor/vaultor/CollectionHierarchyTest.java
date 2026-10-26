package com.vaultor.vaultor;

import com.vaultor.vaultor.service.*;
import com.vaultor.vaultor.service.OrganizationService.*;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.web.server.ResponseStatusException;
import java.nio.file.*;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;

@SpringBootTest
class CollectionHierarchyTest {
 static final Path DATA;
 static {try{DATA=Files.createTempDirectory("vaultor-hierarchy-");}catch(Exception e){throw new ExceptionInInitializerError(e);}}
 @DynamicPropertySource static void properties(DynamicPropertyRegistry p){p.add("spring.datasource.url",()->"jdbc:sqlite:"+DATA.resolve("app.db"));p.add("app.storage.path",()->DATA.resolve("files").toString());p.add("app.host.path",()->DATA.resolve("host").toString());}
 @Autowired OrganizationService org;
 @Autowired ResourceService resources;
 @Autowired FileImportService imports;
 @Autowired RelationshipService links;
 @Autowired ZipWorkspaceExporter exporter;
 @Autowired TransferService transfers;
 private CollectionDto create(String name,String parent){return org.createOnce(UUID.randomUUID().toString(),new CreationInput(name,List.of(),parent));}
 @Test void hierarchyKeepsIdentityMembershipAndPins(){
  var a=create("A",null);var b=create("B",null);var child=create("Docs",a.id());var grand=create("Notes",child.id());
  var other=create("Docs",b.id());assertNotEquals(child.id(),other.id());
  assertThrows(ResponseStatusException.class,()->create(" docs ",a.id()));
  assertThrows(IllegalArgumentException.class,()->org.move(a.id(),new MoveInput(grand.id())));
  assertThrows(IllegalArgumentException.class,()->org.move(child.id(),new MoveInput(child.id())));
  assertThrows(IllegalArgumentException.class,()->org.move(child.id(),new MoveInput("missing")));
  var note=resources.createNote("Note","{\"type\":\"doc\",\"content\":[]}");
  org.bulk(new BulkInput(List.of(note.getId()),"collection",child.id(),"add"));org.bulk(new BulkInput(List.of(note.getId()),"collection",other.id(),"add"));org.pin(child.id(),true);
  org.save(a.id(),new CollectionInput("Renamed",null));assertEquals("Renamed",org.get(grand.id()).ancestors().getFirst().name());
  assertThrows(ResponseStatusException.class,()->org.move(child.id(),new MoveInput(b.id())));
  org.move(child.id(),new MoveInput(null));assertNull(org.get(child.id()).parentId());assertEquals(child.id(),org.get(grand.id()).parentId());assertTrue(org.get(child.id()).favorite());assertEquals(1,org.get(child.id()).count());
  org.delete(child.id());assertNotNull(resources.getResourceOrThrow(note.getId()));assertEquals(1,org.get(other.id()).count());
 }
 @Test void portableHierarchyRejectsInvalidTreesAndMergesByBranch(){
  String root=UUID.randomUUID().toString(),child=UUID.randomUUID().toString();
  var data=new OrganizationData(List.of(new CollectionData(child,"Same",true,List.of(),root),new CollectionData(root,"Archive root",false,List.of(),null)),List.of());
  OrganizationService.validate(data,Set.of());org.restore(data,Map.of(),true);org.restore(data,Map.of(),true);
  var restored=org.list("Archive root",false,0,10).items().getFirst();assertEquals(1,org.list("",false,0,10,restored.id()).totalItems());
  assertThrows(IllegalArgumentException.class,()->OrganizationService.validate(new OrganizationData(List.of(new CollectionData(root,"Cycle",false,List.of(),root)),List.of()),Set.of()));
  assertThrows(IllegalArgumentException.class,()->OrganizationService.validate(new OrganizationData(List.of(new CollectionData(root,"Orphan",false,List.of(),"missing")),List.of()),Set.of()));
 }
 @Test void importRelationshipsAreRetrySafeAndProtectEdits() throws Exception {
  String original="{\"type\":\"doc\",\"content\":[]}";
  var target=resources.createNote("Target",original);String id=UUID.randomUUID().toString();imports.create(id,"Source",original,null);
  String linked="{\"type\":\"doc\",\"content\":[{\"type\":\"paragraph\",\"content\":[{\"type\":\"resourceLink\",\"attrs\":{\"resourceId\":\""+target.getId()+"\",\"label\":\"Target\",\"type\":\"note\"}}]}]}";
  var input=new FileImportService.Resolution("Source",original,linked,null);var saved=imports.resolve(id,input);String revision=saved.getRevision();assertEquals(revision,imports.resolve(id,input).getRevision());
  resources.updateNote(id,"User edit",original,"\""+revision+"\"");assertEquals("User edit",imports.resolve(id,input).getTitle());
  String other=UUID.randomUUID().toString();var created=imports.create(other,"Other",original,null);resources.updateNote(other,"Edited",original,"\""+created.getRevision()+"\"");assertThrows(ResponseStatusException.class,()->imports.resolve(other,new FileImportService.Resolution("Other",original,linked,null)));
  String missing=UUID.randomUUID().toString();imports.create(missing,"Missing",original,null);assertThrows(NoSuchElementException.class,()->imports.resolve(missing,new FileImportService.Resolution("Missing",original,linked.replace(target.getId(),UUID.randomUUID().toString()),null)));assertEquals(original,resources.getResourceOrThrow(missing).getContent());
 }
 @Test void hierarchyArchiveRoundTripsWithVersionSeven() throws Exception {
  String root=UUID.randomUUID().toString(),child=UUID.randomUUID().toString();
  var organization=new OrganizationData(List.of(new CollectionData(child,"Archive child",true,List.of(),root),new CollectionData(root,"Portable hierarchy",false,List.of(),null)),List.of());
  var workspace=new TransferService.Workspace(List.of(),List.of(),SettingsService.defaultWorkspaceSettings(),organization,List.of());var path=DATA.resolve("hierarchy.zip");exporter.write(workspace,Map.of(),path);
  try(var zip=new java.util.zip.ZipInputStream(Files.newInputStream(path))){java.util.zip.ZipEntry entry;boolean seen=false;while((entry=zip.getNextEntry())!=null)if(entry.getName().equals("manifest.json")){assertTrue(new String(zip.readAllBytes(),java.nio.charset.StandardCharsets.UTF_8).contains("\"version\":7"));seen=true;}assertTrue(seen);}
  var preview=transfers.preview(new org.springframework.mock.web.MockMultipartFile("file",Files.readAllBytes(path)));var operation=transfers.commit(preview.operation().id(),"merge");
  for(int i=0;i<200;i++){var status=transfers.get(operation.id());if(status.status().equals("SUCCEEDED"))break;if(status.status().equals("FAILED"))fail(status.detail());Thread.sleep(50);}
  assertEquals("SUCCEEDED",transfers.get(operation.id()).status());var restored=org.list("Portable hierarchy",false,0,10).items().getFirst();assertEquals("Archive child",org.list("",false,0,10,restored.id()).items().getFirst().name());
 }
}
