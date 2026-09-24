package com.vaultor.vaultor;
import com.vaultor.vaultor.service.ResourceSearchService;
import com.vaultor.vaultor.service.ResourceService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.DriverManager;
import java.util.List;
import static org.junit.jupiter.api.Assertions.*;
/** A restart has FTS virtual/shadow tables before Hibernate initializes. */
@SpringBootTest
class ExistingSearchIndexStartupTest {
 static final Path DATA;
 static {try {
  DATA=Files.createTempDirectory("vaultor-existing-index-");
  try(var connection=DriverManager.getConnection("jdbc:sqlite:"+DATA.resolve("app.db"));var statement=connection.createStatement()) {
   statement.execute("create virtual table resource_fts using fts5(id UNINDEXED,title,body,tokenize='unicode61 remove_diacritics 2')");
  }
 }catch(Exception e){throw new ExceptionInInitializerError(e);}}
 @DynamicPropertySource static void properties(DynamicPropertyRegistry p){p.add("spring.datasource.url",()->"jdbc:sqlite:"+DATA.resolve("app.db"));p.add("app.storage.path",()->DATA.resolve("files").toString());}
 @Autowired ResourceSearchService search;
 @Autowired ResourceService resources;
 @Test void startsWithExistingFtsTablesAndKeepsSearchWorking()throws Exception {
  long deadline=System.nanoTime()+10_000_000_000L;
  while(search.status().rebuilding()&&System.nanoTime()<deadline)Thread.sleep(10);
  assertTrue(search.status().complete(),search.status().toString());
  var note=resources.createNote("Restart regression","{\"type\":\"doc\",\"content\":[{\"type\":\"paragraph\",\"content\":[{\"type\":\"text\",\"text\":\"Restartmarker\"}]}]}");
  assertEquals(note.getId(),search.search("restartmarker",0,10,"note",List.of(),null,false).items().getFirst().resource().id());
 }
}
