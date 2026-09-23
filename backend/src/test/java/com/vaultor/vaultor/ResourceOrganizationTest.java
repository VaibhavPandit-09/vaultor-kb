package com.vaultor.vaultor;
import com.vaultor.vaultor.service.*;
import com.vaultor.vaultor.service.OrganizationService.*;
import com.vaultor.vaultor.repository.*;
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
class ResourceOrganizationTest {
 static final Path DATA;
 static {try {DATA=Files.createTempDirectory("vaultor-u2-test-");}catch(Exception e){throw new ExceptionInInitializerError(e);}}
 @DynamicPropertySource static void properties(DynamicPropertyRegistry p) {p.add("spring.datasource.url",()->"jdbc:sqlite:"+DATA.resolve("app.db"));p.add("app.storage.path",()->DATA.resolve("files").toString());}
 @Autowired OrganizationService org;
 @Autowired ResourceService resources;
 @Autowired ResourceRepository repository;
 @Autowired CollectionRepository collections;
 @Autowired ResourceBrowseService browse;
 @Autowired FileImportService imports;
 static final String DOC="{\"type\":\"doc\",\"content\":[]}";
 @Test void creationMembershipImportAndPinsAreAtomicAndRetrySafe() throws Exception {
  String note=resources.createNote("Alpha note",DOC).getId();
  String id=UUID.randomUUID().toString();var request=new CreationInput("Beta topic",List.of(note));
  var topic=org.createOnce(id,request);assertEquals(1,topic.count());
  assertEquals(id,org.createOnce(id,request).id());
  assertThrows(ResponseStatusException.class,()->org.createOnce(id,new CreationInput("Different",List.of(note))));
  assertThrows(ResponseStatusException.class,()->org.createOnce(UUID.randomUUID().toString(),new CreationInput(" beta TOPIC ",List.of(note))));
  String missing=UUID.randomUUID().toString();
  assertThrows(NoSuchElementException.class,()->org.createOnce(missing,new CreationInput("Must roll back",List.of(note,"missing"))));
  assertFalse(collections.existsById(missing));
  org.bulk(new BulkInput(List.of(note),"collection",id,"remove"));
  assertEquals(0,org.createOnce(id,request).count(),"Uncertain creation retry must not reapply changed memberships");
  var created=resources.createNote("Gamma note",DOC,id);
  assertEquals(id,browse.list(0,10,"Gamma",null,List.of(),false,"title").items().getFirst().collections().getFirst().id());
  String imported=UUID.randomUUID().toString();
  imports.create(imported,"Delta import",DOC,null,id);
  imports.create(imported,"Delta import",DOC,null,id);
  assertEquals(2,org.get(id).count());
  assertThrows(ResponseStatusException.class,()->imports.create(imported,"Delta import",DOC,null,null));
  String failedImport=UUID.randomUUID().toString();
  assertThrows(NoSuchElementException.class,()->imports.create(failedImport,"Failure",DOC,null,"missing"));assertFalse(repository.existsById(failedImport));
  var members=org.memberships(new SelectionInput(List.of(created.getId(),imported,note)));assertEquals(2,members.getFirst().selectedCount());
  browse.favorite(note,true);org.pin(id,true); // Existing stored favorite flags are the pin source; no migration/reset.
  assertEquals(List.of("Alpha note","Beta topic"),org.pins("",0,10).items().stream().map(PinnedItem::name).toList());
  assertEquals("collection",org.pins("",1,1).items().getFirst().kind());
  assertEquals(1,org.pins("topic",0,10).totalItems());
  browse.markOpened(created.getId());assertEquals("Alpha note",org.pins("",0,10).items().getFirst().name());
  org.delete(id);assertTrue(repository.existsById(created.getId()));assertTrue(org.memberships(new SelectionInput(List.of(imported))).isEmpty());
 }
}
