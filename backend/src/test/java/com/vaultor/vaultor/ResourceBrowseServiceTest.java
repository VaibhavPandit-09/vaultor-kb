package com.vaultor.vaultor;

import com.vaultor.vaultor.model.Resource;
import com.vaultor.vaultor.repository.ResourceRepository;
import com.vaultor.vaultor.service.ResourceBrowseService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import java.nio.file.*;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;

@SpringBootTest
class ResourceBrowseServiceTest {
    static final Path DATA;
    static { try { DATA=Files.createTempDirectory("vaultor-browse-test-"); } catch(Exception e) { throw new ExceptionInInitializerError(e); } }
    @DynamicPropertySource static void properties(DynamicPropertyRegistry p) {
        p.add("spring.datasource.url", () -> "jdbc:sqlite:"+DATA.resolve("app.db"));
        p.add("app.storage.path", () -> DATA.resolve("files").toString());
    }
    @Autowired ResourceRepository resources;
    @Autowired ResourceBrowseService browse;
    @Autowired JdbcTemplate jdbc;
    @Autowired com.vaultor.vaultor.controller.ResourceController controller;
    @Test void boundedMetadataBrowsingAndFavorites() {
        var rows=new ArrayList<Resource>();
        for(int i=0;i<205;i++) { var r=new Resource(); r.setId(String.format("r%03d",i)); r.setType("note"); r.setTitle("Same title"); r.setContent("{\"type\":\"doc\",\"content\":[]}"); rows.add(r); }
        resources.saveAllAndFlush(rows);
        var first=browse.list(0,100,"",null,List.of(),false,"title");
        var second=browse.list(1,100,"",null,List.of(),false,"title");
        assertEquals(205,first.totalItems()); assertEquals(3,first.totalPages());
        assertEquals("r000",first.items().getFirst().id()); assertEquals("r100",second.items().getFirst().id());
        assertNotNull(first.items().getFirst().createdAt());
        assertEquals(5,browse.list(2,100,"",null,List.of(),false,"title").items().size());
        assertTrue(Arrays.stream(first.items().getFirst().getClass().getRecordComponents()).noneMatch(c -> c.getName().equals("content") || c.getName().equals("filePath")));
        var updated=resources.findById("r000").orElseThrow().getUpdatedAt();
        var before=resources.findById("r000").orElseThrow();
        jdbc.update("update resources set last_opened_at=? where id=?",java.sql.Timestamp.valueOf("2000-01-01 00:00:00"),"r000");
        controller.open("r000");
        var opened=resources.findById("r000").orElseThrow();
        assertEquals(updated,opened.getUpdatedAt());assertEquals(before.getContent(),opened.getContent());assertEquals(before.getTitle(),opened.getTitle());assertEquals(before.getCreatedAt(),opened.getCreatedAt());
        assertTrue(opened.getLastOpenedAt().getYear()>2000);
        assertEquals("r000",browse.list(0,1,"",null,List.of(),false,"recent").items().getFirst().id());
        assertThrows(NoSuchElementException.class,()->controller.open("missing"));
        browse.favorite("r000",true); browse.favorite("r000",true);
        assertEquals(1,browse.list(0,10,"same","note",List.of(),true,"updated").totalItems());
        assertEquals(updated,resources.findById("r000").orElseThrow().getUpdatedAt());
        assertEquals(0,browse.list(0,10,"same","file",List.of(),false,"recent").totalItems());
        jdbc.update("update resources set title=? where id=?","100%_ literal","r000");
        assertEquals(1,browse.list(0,10,"%_",null,List.of(),false,"title").totalItems());
        jdbc.update("insert into tags(id,name,color) values('t1','Topic','#123456'),('t2','Other','#234567')");
        jdbc.update("insert into resource_tags(resource_id,tag_id) values('r000','t1'),('r000','t2'),('r001','t1')");
        var tagged=browse.list(0,10,"",null,List.of("topic","Other"),false,"title");
        assertEquals(1,tagged.totalItems()); assertEquals(2,tagged.items().getFirst().tags().size());
        assertThrows(IllegalArgumentException.class, () -> browse.list(0,201,"",null,List.of(),false,"title"));
        assertThrows(IllegalArgumentException.class, () -> browse.favorite("r000",null));
        assertThrows(NoSuchElementException.class, () -> browse.favorite("missing",true));
    }
}
