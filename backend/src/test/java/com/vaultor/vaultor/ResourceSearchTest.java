package com.vaultor.vaultor;
import com.vaultor.vaultor.service.*;
import com.vaultor.vaultor.repository.*;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.jdbc.core.JdbcTemplate;
import java.nio.file.*;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
@SpringBootTest
class ResourceSearchTest {
 static final Path DATA;
 static{try{DATA=Files.createTempDirectory("vaultor-search-test-");}catch(Exception e){throw new ExceptionInInitializerError(e);}}
 @DynamicPropertySource static void props(DynamicPropertyRegistry p){p.add("spring.datasource.url",()->"jdbc:sqlite:"+DATA.resolve("app.db"));p.add("app.storage.path",()->DATA.resolve("files").toString());}
 @Autowired WorkspaceGate gate;
 @Autowired ResourceSearchService search;@Autowired ResourceService resources;@Autowired FileImportService imports;@Autowired OrganizationService org;@Autowired ResourceBrowseService browse;@Autowired JdbcTemplate jdbc;@Autowired TransactionTemplate tx;
 static String doc(String text){return "{\"type\":\"doc\",\"content\":[{\"type\":\"paragraph\",\"content\":[{\"type\":\"text\",\"text\":\""+text+"\"}]}]}";}
 void ready()throws Exception{long deadline=System.nanoTime()+10_000_000_000L;while(search.status().rebuilding()&&System.nanoTime()<deadline)Thread.sleep(10);assertTrue(search.status().complete(),search.status().toString());}
 long count(String q){return search.search(q,0,50,null,List.of(),null,false).totalItems();}
 @Test void savedTextRankingFiltersTransactionsAndRebuild()throws Exception{
 ready();var title=resources.createNote("Nebula architecture",doc("Title match"));var body=resources.createNote("Meeting",doc("Nebula discussion and telescope"));
 assertEquals(title.getId(),search.search("neb",0,50,null,List.of(),null,false).items().getFirst().resource().id());assertEquals(2,count("nebula"));
 var snippet=search.search("telescope",0,50,null,List.of(),null,false).items().getFirst().snippet();assertTrue(snippet.text().contains("telescope"));assertFalse(snippet.highlights().isEmpty());
 assertEquals(0,count("nebula OR telescope"));assertEquals(0,count("\" * : ()"));
 var collection=org.createOnce(UUID.randomUUID().toString(),new OrganizationService.CreationInput("Topic",List.of(body.getId())));browse.favorite(body.getId(),true);
 assertEquals(1,search.search("nebula",0,20,"note",List.of(),collection.id(),true).totalItems());
 tx.executeWithoutResult(status->{jdbc.update("update resources set title='Rollbackword' where id=?",body.getId());assertEquals(1,count("rollbackword"));status.setRollbackOnly();});assertEquals(0,count("rollbackword"));
 String imported=UUID.randomUUID().toString();imports.create(imported,"Import",doc("Importmarker"),null);assertEquals(1,count("importmarker"));
 resources.updateNote(body.getId(),"Meeting",doc("Replacementword"));assertEquals(0,count("telescope"));assertEquals(1,count("replacementword"));
 resources.deleteResource(imported);assertEquals(0,count("importmarker"));
 resources.createNote("Visible structure","{\"type\":\"doc\",\"attrs\":{\"private\":{\"type\":\"text\",\"text\":\"hiddenattribute\"}},\"content\":[{\"type\":\"paragraph\",\"content\":[{\"type\":\"resourceLink\",\"attrs\":{\"resourceId\":\"secretidentifier\",\"label\":\"Visiblelabel\"}}]}]}");
 assertEquals(1,count("visiblelabel"));assertEquals(0,count("hiddenattribute"));assertEquals(0,count("secretidentifier"));
 search.rebuild("test");while(!gate.enterRequest())Thread.sleep(5);try{resources.createNote("Concurrent",doc("Concurrentword"));}finally{gate.leaveRequest();}ready();assertEquals(1,count("concurrentword"));assertEquals(1,count("replacementword"));
 }
}
