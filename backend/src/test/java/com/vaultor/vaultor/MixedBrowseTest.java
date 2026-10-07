package com.vaultor.vaultor;

import com.vaultor.vaultor.service.*;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.jdbc.core.JdbcTemplate;
import java.nio.file.*;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;

@SpringBootTest
class MixedBrowseTest {
    static final Path DATA;
    static { try { DATA=Files.createTempDirectory("vaultor-mixed-browse-"); } catch(Exception e) { throw new ExceptionInInitializerError(e); } }
    @DynamicPropertySource static void properties(DynamicPropertyRegistry p) {
        p.add("spring.datasource.url",()->"jdbc:sqlite:"+DATA.resolve("app.db"));
        p.add("app.storage.path",()->DATA.resolve("files").toString());
    }
    @Autowired ResourceService resources;
    @Autowired ResourceBrowseService browse;
    @Autowired OrganizationService organization;
    @Autowired JdbcTemplate jdbc;

    @Test void mixedOrderingFilteringAndMetadataStayBounded() {
        var note=resources.createNote("Bravo","{\"type\":\"doc\",\"content\":[]}");
        var file=resources.createNote("Alpha","{\"type\":\"doc\",\"content\":[]}");
        var future=resources.createNote("Delta","{\"type\":\"doc\",\"content\":[]}");
        jdbc.update("update resources set type='file',mime_type='application/pdf',last_opened_at='2026-10-07 12:00:00' where id=?",file.getId());
        jdbc.update("update resources set last_opened_at='2026-10-07 11:00:00' where id=?",note.getId());
        jdbc.update("update resources set type='future',last_opened_at='2026-10-07 10:00:00' where id=?",future.getId());
        var recent=browse.list(0,2,"",null,List.of(),false,"recent");
        assertEquals(3,recent.totalItems());assertEquals(2,recent.totalPages());
        assertEquals(List.of(file.getId(),note.getId()),recent.items().stream().map(r->r.id()).toList());
        assertEquals(future.getId(),browse.list(1,2,"",null,List.of(),false,"recent").items().getFirst().id());
        var collection=organization.createOnce(UUID.randomUUID().toString(),new OrganizationService.CreationInput("Charlie",List.of(file.getId())));
        organization.pin(collection.id(),true);
        for(var id:List.of(note.getId(),file.getId(),future.getId()))browse.favorite(id,true);
        var pins=organization.pins("",0,2);
        assertEquals(4,pins.totalItems());assertEquals(List.of("Alpha","Bravo"),pins.items().stream().map(p->p.name()).toList());
        assertEquals("Charlie",pins.items().getFirst().resource().collections().getFirst().name());
        var tail=organization.pins("",1,2);
        assertEquals(List.of("collection","future"),tail.items().stream().map(p->p.kind()).toList());
        assertNull(tail.items().getFirst().resource());
        var files=organization.pins("Al",0,100,"file");
        assertEquals(1,files.totalItems());assertEquals("application/pdf",files.items().getFirst().resource().mimeType());
        assertEquals(1,organization.pins("",0,100,"collection").totalItems());
        assertEquals(1,organization.pins("",0,100,"future").totalItems());
        assertEquals(0,organization.pins("missing",0,100,"file").totalItems());
        assertThrows(IllegalArgumentException.class,()->organization.pins("",0,100,"bad value"));
    }
}
