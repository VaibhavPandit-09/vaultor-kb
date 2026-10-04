package com.vaultor.vaultor;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.core.env.Environment;
import org.springframework.transaction.support.TransactionTemplate;
import com.vaultor.vaultor.service.*;
import org.springframework.mock.web.MockMultipartFile;
import tools.jackson.databind.ObjectMapper;
import java.net.*;
import java.net.http.*;
import java.nio.file.*;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
@SpringBootTest(webEnvironment=SpringBootTest.WebEnvironment.RANDOM_PORT)
class SessionRevisionTest {
 static final Path DATA;
 static {try{DATA=Files.createTempDirectory("vaultor-session-test-");
 try(var connection=java.sql.DriverManager.getConnection("jdbc:sqlite:"+DATA.resolve("app.db"));var statement=connection.createStatement()){statement.execute("CREATE TABLE resources (id varchar(255) PRIMARY KEY,type varchar(255) NOT NULL,title varchar(255) NOT NULL,content TEXT,created_at timestamp NOT NULL,updated_at timestamp NOT NULL)");statement.execute("INSERT INTO resources VALUES ('legacy-note','note','Legacy','{\"type\":\"doc\",\"content\":[]}','2026-09-29 00:00:00','2026-09-29 00:00:00')");}}catch(Exception e){throw new ExceptionInInitializerError(e);}}
 @DynamicPropertySource static void properties(DynamicPropertyRegistry p){p.add("spring.datasource.url",()->"jdbc:sqlite:"+DATA.resolve("app.db"));p.add("app.host.path",()->DATA.resolve("host-access").toString());p.add("app.storage.path",()->DATA.resolve("files").toString());}
 @Autowired Environment env; @Autowired ObjectMapper json; @Autowired WorkspaceIdentityService identities; @Autowired TransferService transfers; @Autowired TransactionTemplate transaction;
 HttpResponse<String> request(String method,String path,String body,String revision)throws Exception{
  var b=HttpRequest.newBuilder(URI.create("http://127.0.0.1:"+env.getProperty("local.server.port")+"/api"+path)).header("Content-Type","application/json").header("X-Vaultor-Owner",Files.readString(DATA.resolve("host-access/owner.key")));
  if(revision!=null)b.header("If-Match","\""+revision+"\"");
  return HttpClient.newHttpClient().send(b.method(method,body==null?HttpRequest.BodyPublishers.noBody():HttpRequest.BodyPublishers.ofString(body)).build(),HttpResponse.BodyHandlers.ofString());
 }
 void await(String id)throws Exception{for(int i=0;i<200;i++){var op=transfers.get(id);if(List.of("SUCCEEDED","FAILED").contains(op.status())){assertEquals("SUCCEEDED",op.status(),op.detail());return;}Thread.sleep(25);}fail("Transfer timed out");}
 @Test void conditionalUpdatesAndReplacementIsolation()throws Exception{
  var legacy=request("GET","/resources/legacy-note",null,null);assertEquals(200,legacy.statusCode(),legacy.body());
  var legacyRevision=json.readTree(legacy.body()).get("revision").asString();
  assertEquals(200,request("PUT","/resources/legacy-note/note","{\"title\":\"Migrated\",\"content\":{\"type\":\"doc\",\"content\":[]}}",legacyRevision).statusCode());
  var original=identities.current();assertEquals(original,identities.current());
  assertThrows(IllegalStateException.class,()->transaction.executeWithoutResult(tx->{identities.replaced();throw new IllegalStateException("rollback");}));assertEquals(original,identities.current());
  String body="{\"title\":\"Original\",\"content\":{\"type\":\"doc\",\"content\":[{\"type\":\"paragraph\"}]}}";
  var created=request("POST","/resources",body,null);assertEquals(200,created.statusCode(),created.body());var note=json.readTree(created.body());String id=note.get("id").asString(),revision=note.get("revision").asString();
  // Restored panes and different browser tabs may save at the same time.
  var another=json.readTree(request("POST","/resources",body,null).body());
  try(var executor=java.util.concurrent.Executors.newVirtualThreadPerTaskExecutor()){
   var start=new java.util.concurrent.CountDownLatch(1);
   var first=executor.submit(()->{start.await();return request("PUT","/resources/"+id+"/note",body,revision);});
   var second=executor.submit(()->{start.await();return request("PUT","/resources/"+another.get("id").asString()+"/note",body,another.get("revision").asString());});
   start.countDown();assertEquals(200,first.get().statusCode());assertEquals(200,second.get().statusCode());
  }
  var currentRevision=json.readTree(request("GET","/resources/"+id,null,null).body()).get("revision").asString();
  var changed=request("PUT","/resources/"+id+"/note",body.replace("Original","Updated"),currentRevision);assertEquals(200,changed.statusCode(),changed.body());String next=json.readTree(changed.body()).get("revision").asString();assertNotEquals(revision,next);
  var stale=request("PUT","/resources/"+id+"/note",body,revision);assertEquals(412,stale.statusCode(),stale.body());assertEquals("NOTE_REVISION_CONFLICT",json.readTree(stale.body()).get("code").asString());assertEquals("Updated",json.readTree(request("GET","/resources/"+id,null,null).body()).get("title").asString());
  var export=transfers.export("workspace","zip");await(export.id());byte[] archive=Files.readAllBytes(transfers.download(export.id()));
  var preview=transfers.preview(new MockMultipartFile("file","workspace.zip","application/zip",archive));
  var commit=transfers.commit(preview.operation().id(),"replace");await(commit.id());
  var replaced=identities.current();assertEquals(original.id(),replaced.id());assertNotEquals(original.generation(),replaced.generation());
  var restored=json.readTree(request("GET","/resources/"+id,null,null).body());assertNotEquals(next,restored.get("revision").asString());assertEquals(412,request("PUT","/resources/"+id+"/note",body,next).statusCode());
 }
}
