package com.vaultor.vaultor;
import com.vaultor.vaultor.service.*;
import com.vaultor.vaultor.service.OrganizationService.*;
import com.vaultor.vaultor.repository.*;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.web.server.ResponseStatusException;
import java.nio.file.*;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;

@SpringBootTest
class OrganizationServiceTest {
    static final Path DATA;
    static {try {DATA=Files.createTempDirectory("vaultor-organization-test-");}catch(Exception e){throw new ExceptionInInitializerError(e);}}
    @DynamicPropertySource static void properties(DynamicPropertyRegistry p) {p.add("spring.datasource.url",()->"jdbc:sqlite:"+DATA.resolve("app.db"));p.add("app.storage.path",()->DATA.resolve("files").toString());p.add("app.host.path",()->DATA.resolve("host").toString());}
    @Autowired ResourceLifecycleService lifecycle;
    @Autowired OrganizationService org;
    @Autowired ResourceSearchService search;
    @Autowired ResourceService service;
    @Autowired ResourceRepository resources;
    @Autowired ResourceBrowseService browse;
    @Autowired CollectionRepository collections;
    @Autowired TagService tags;
    @Autowired TransferService transfers;
    @Autowired ZipWorkspaceExporter exporter;
    @Autowired SettingsService settings;
    @Autowired JdbcTemplate jdbc;
    private void await(String id, String expected) throws Exception {
        long until=System.nanoTime()+20_000_000_000L;
        while(System.nanoTime()<until) {TransferService.Operation op;try{op=transfers.get(id);}catch(org.springframework.web.server.ResponseStatusException busy){if(busy.getStatusCode().value()!=409||!"Workspace maintenance is in progress. Retry shortly.".equals(busy.getReason()))throw busy;Thread.sleep(25);continue;}if(Set.of("SUCCEEDED","FAILED").contains(op.status())) {assertEquals(expected,op.status(),op.detail());return;}Thread.sleep(25);}
        fail("Transfer timeout");
    }
    @Test void clipboardMovePreservesOtherMembershipsAndFailsAtomically() {
        String one=service.createNote("Move one","{}").getId(),two=service.createNote("Move two","{}").getId();
        var source=org.save(null,new CollectionInput("Clipboard source",false));var target=org.save(null,new CollectionInput("Clipboard target",false));var other=org.save(null,new CollectionInput("Clipboard other",false));
        org.bulk(new BulkInput(List.of(one,two),"collection",source.id(),"add"));org.bulk(new BulkInput(List.of(one),"collection",other.id(),"add"));
        assertThrows(IllegalArgumentException.class,()->org.moveMemberships(new MembershipMove(List.of(one,"missing"),source.id(),target.id())));
        assertEquals(2,org.get(source.id()).count());assertEquals(0,org.get(target.id()).count());
        org.moveMemberships(new MembershipMove(List.of(one,two),source.id(),target.id()));assertEquals(0,org.get(source.id()).count());assertEquals(2,org.get(target.id()).count());assertEquals(1,org.get(other.id()).count());
        assertThrows(IllegalArgumentException.class,()->org.moveMemberships(new MembershipMove(List.of(one),source.id(),target.id())));
        assertThrows(IllegalArgumentException.class,()->org.moveMemberships(new MembershipMove(List.of(one),target.id(),target.id())));
        assertTrue(resources.existsById(one));assertTrue(resources.existsById(two));
        jdbc.update("delete from resource_collections where resource_id in (?,?)",one,two);jdbc.update("delete from resources where id in (?,?)",one,two);collections.deleteAllById(List.of(source.id(),target.id(),other.id()));
    }
    @Test void tagBrowserIsBoundedSearchableAndGloballySorted() {
        String prefix="NavigatorScale-";
        try {
            for(int i=0;i<2005;i++)jdbc.update("insert into tags(id,name,color) values(?,?,?)",prefix+i,prefix+String.format("%04d",i),"#64748b");
            assertEquals(0,org.tags("NavigatorAbsent-",0,50,"name",null).totalItems());
            for(int size:List.of(5,50,100)) {var page=org.tags(prefix,0,size,"name",null);assertEquals(size,page.items().size());assertEquals(2005,page.totalItems());}
            var last=org.tags(prefix,40,50,"name",null);assertEquals(5,last.items().size());assertEquals(prefix+"2000",last.items().getFirst().name());
            assertEquals(prefix+"2004",org.tags(prefix,0,50,"name-desc",null).items().getFirst().name());
            String resource=service.createNote("Tag scale fixture","{}").getId();
            try {org.bulk(new BulkInput(List.of(resource),"tag",prefix+"1000","add"));assertEquals(prefix+"1000",org.tags(prefix,0,8,"usage",null).items().getFirst().id());assertEquals(1,org.tags("",0,24,"name",List.of(prefix+"1000")).items().getFirst().count());jdbc.update("update resources set trashed_at='2026-11-07T00:00:00Z' where id=?",resource);assertEquals(0,org.tags("",0,24,"name",List.of(prefix+"1000")).items().getFirst().count());}
            finally {jdbc.update("delete from resource_tags where resource_id=?",resource);jdbc.update("delete from resources where id=?",resource);}
            assertEquals(2,org.tags("",0,24,"name",List.of(prefix+"1",prefix+"2")).totalItems());
            assertThrows(IllegalArgumentException.class,()->org.tags("",0,30,"name; delete from tags",null));
            assertThrows(IllegalArgumentException.class,()->org.tags("",0,30,"name",Collections.nCopies(25,prefix+"1")));
            assertThrows(IllegalArgumentException.class,()->org.tags("",0,30,"name",List.of(prefix+"1",prefix+"1")));
        } finally {jdbc.update("delete from tags where id like ?",prefix+"%");}
    }
    @Test void organizationIsAtomicPortableAndNonDestructive() throws Exception {
        String one=service.createNote("First","{\"type\":\"doc\",\"content\":[]}").getId();
        String two=service.createNote("Second","{\"type\":\"doc\",\"content\":[]}").getId();
        var atlas=org.save(null,new CollectionInput("Atlas",true));
        var other=org.save(null,new CollectionInput("Other",false));
        assertThrows(ResponseStatusException.class,()->org.save(null,new CollectionInput(" atlas ",false)));
        org.bulk(new BulkInput(List.of(one,two),"collection",atlas.id(),"add"));
        org.bulk(new BulkInput(List.of(one),"collection",other.id(),"add"));
        org.bulk(new BulkInput(List.of(one,two),"collection",atlas.id(),"add"));
        assertEquals(2,org.list("atl",true,0,30).items().getFirst().count());
        var tag=tags.getOrCreateTag("Topic");org.bulk(new BulkInput(List.of(one,two),"tag",tag.getId(),"add"));
        assertEquals(2,browse.list(0,100,"","note",List.of("topic"),false,"title",atlas.id()).totalItems());
        assertThrows(NoSuchElementException.class,()->org.bulk(new BulkInput(List.of(one,"missing"),"tag",tag.getId(),"remove")));
        assertEquals(2,org.tags("topic",0,30).items().getFirst().count());
        tags.rename(tag.getId(),"Meeting");assertEquals(2,org.tags("meeting",0,30).items().getFirst().count());
        org.delete(other.id());assertEquals(2,resources.count());
        browse.favorite(one,true);
        var export=transfers.export("workspace","zip");await(export.id(),"SUCCEEDED");
        byte[] archive=Files.readAllBytes(transfers.download(export.id()));
        org.save(atlas.id(),new CollectionInput("Atlas",false));
        var merge=transfers.preview(new MockMultipartFile("file","workspace.zip","application/zip",archive));
        await(transfers.commit(merge.operation().id(),"merge").id(),"SUCCEEDED");
        assertEquals(2,search.search("First",0,20,null,List.of(),null,false).totalItems());
        assertEquals(4,resources.count());assertEquals(1,collections.count());
        assertFalse(collections.findById(atlas.id()).orElseThrow().isFavorite());
        assertEquals(4,org.list("Atlas",false,0,30).items().getFirst().count());
        assertEquals(2,browse.list(0,100,"",null,List.of(),true,"title").totalItems());
        assertEquals(4,org.tags("meeting",0,30).items().getFirst().count());
        var restore=transfers.preview(new MockMultipartFile("file",archive));
        await(transfers.commit(restore.operation().id(),"replace").id(),"SUCCEEDED");
        assertEquals(1,search.search("First",0,20,null,List.of(),null,false).totalItems());
        assertEquals(2,resources.count());assertTrue(collections.findById(atlas.id()).orElseThrow().isFavorite());
        assertEquals(2,browse.list(0,100,"",null,List.of(),false,"title",atlas.id()).totalItems());
        assertTrue(resources.findById(one).orElseThrow().getFavorite());
        // A failure late in metadata commit rolls back cleared resources, tags and collections together.
        var failPreview=transfers.preview(new MockMultipartFile("file",archive));
        jdbc.execute("CREATE TRIGGER reject_collection BEFORE INSERT ON collections BEGIN SELECT RAISE(ABORT,'injected failure'); END");
        try {await(transfers.commit(failPreview.operation().id(),"replace").id(),"FAILED");} finally {jdbc.execute("DROP TRIGGER reject_collection");}
        assertEquals(1,search.search("First",0,20,null,List.of(),null,false).totalItems());
        assertEquals(2,resources.count());assertEquals(2,org.list("Atlas",false,0,30).items().getFirst().count());
        assertTrue(resources.findById(one).orElseThrow().getFavorite());
        var malformed=new OrganizationData(List.of(new CollectionData("bad","Bad",false,List.of("missing"))),List.of());
        var path=DATA.resolve("bad.zip");exporter.write(new TransferService.Workspace(List.of(),List.of(),settings.getSettings().workspace(),malformed),Map.of(),path);
        assertThrows(IllegalArgumentException.class,()->transfers.preview(new MockMultipartFile("file",Files.readAllBytes(path))));
        assertEquals(2,resources.count());
        lifecycle.apply(new ResourceLifecycleService.Item(UUID.randomUUID().toString(),two,"trash",resources.findById(two).orElseThrow().getRevision()));assertEquals(1,org.list("Atlas",false,0,30).items().getFirst().count());
        org.delete(atlas.id());assertEquals(2,resources.count()); // Trash retains the second original.
    }
}
