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
    @DynamicPropertySource static void properties(DynamicPropertyRegistry p) {p.add("spring.datasource.url",()->"jdbc:sqlite:"+DATA.resolve("app.db"));p.add("app.storage.path",()->DATA.resolve("files").toString());}
    @Autowired OrganizationService org;
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
        while(System.nanoTime()<until) {var op=transfers.get(id);if(Set.of("SUCCEEDED","FAILED").contains(op.status())) {assertEquals(expected,op.status(),op.detail());return;}Thread.sleep(25);}
        fail("Transfer timeout");
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
        assertEquals(4,resources.count());assertEquals(1,collections.count());
        assertFalse(collections.findById(atlas.id()).orElseThrow().isFavorite());
        assertEquals(4,org.list("Atlas",false,0,30).items().getFirst().count());
        assertEquals(2,browse.list(0,100,"",null,List.of(),true,"title").totalItems());
        assertEquals(4,org.tags("meeting",0,30).items().getFirst().count());
        var restore=transfers.preview(new MockMultipartFile("file",archive));
        await(transfers.commit(restore.operation().id(),"replace").id(),"SUCCEEDED");
        assertEquals(2,resources.count());assertTrue(collections.findById(atlas.id()).orElseThrow().isFavorite());
        assertEquals(2,browse.list(0,100,"",null,List.of(),false,"title",atlas.id()).totalItems());
        assertTrue(resources.findById(one).orElseThrow().getFavorite());
        // A failure late in metadata commit rolls back cleared resources, tags and collections together.
        var failPreview=transfers.preview(new MockMultipartFile("file",archive));
        jdbc.execute("CREATE TRIGGER reject_collection BEFORE INSERT ON collections BEGIN SELECT RAISE(ABORT,'injected failure'); END");
        try {await(transfers.commit(failPreview.operation().id(),"replace").id(),"FAILED");} finally {jdbc.execute("DROP TRIGGER reject_collection");}
        assertEquals(2,resources.count());assertEquals(2,org.list("Atlas",false,0,30).items().getFirst().count());
        assertTrue(resources.findById(one).orElseThrow().getFavorite());
        var malformed=new OrganizationData(List.of(new CollectionData("bad","Bad",false,List.of("missing"))),List.of());
        var path=DATA.resolve("bad.zip");exporter.write(new TransferService.Workspace(List.of(),List.of(),settings.getSettings().workspace(),malformed),Map.of(),path);
        assertThrows(IllegalArgumentException.class,()->transfers.preview(new MockMultipartFile("file",Files.readAllBytes(path))));
        assertEquals(2,resources.count());
        service.deleteResource(two);assertEquals(1,org.list("Atlas",false,0,30).items().getFirst().count());
        org.delete(atlas.id());assertEquals(1,resources.count());
    }
}
