package com.vaultor.vaultor;
import com.vaultor.vaultor.service.*;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.core.env.Environment;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.ObjectMapper;
import java.nio.file.*;
import java.net.*;
import java.net.http.*;
import java.time.Duration;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
@SpringBootTest(webEnvironment=SpringBootTest.WebEnvironment.RANDOM_PORT)
class TrashPurgeHttpTest {
 static final Path DATA;static{try{DATA=Files.createTempDirectory("vaultor-trash-http-");}catch(Exception e){throw new ExceptionInInitializerError(e);}}
 @DynamicPropertySource static void properties(DynamicPropertyRegistry p){p.add("spring.datasource.url",()->"jdbc:sqlite:"+DATA.resolve("app.db"));p.add("app.storage.path",()->DATA.resolve("files").toString());p.add("app.host.path",()->DATA.resolve("host").toString());}
 @Autowired Environment env;@Autowired ObjectMapper json;@Autowired ResourceService resources;@Autowired ResourceLifecycleService lifecycle;@Autowired WorkspaceGate gate;
 tools.jackson.databind.JsonNode request(String path,String method,Object body)throws Exception{
  var input=HttpRequest.newBuilder(URI.create("http://localhost:"+env.getProperty("local.server.port")+"/api"+path)).timeout(Duration.ofSeconds(8)).header("X-Vaultor-Owner",Files.readString(DATA.resolve("host/owner.key"))).header("Content-Type","application/json").method(method,body==null?HttpRequest.BodyPublishers.noBody():HttpRequest.BodyPublishers.ofString(json.writeValueAsString(body))).build();
  var response=HttpClient.newHttpClient().send(input,HttpResponse.BodyHandlers.ofString());assertEquals(200,response.statusCode(),response.body());return json.readTree(response.body());
 }
 @Test void snapshotConfirmationAndBatchesUseTheExistingOpenViewConnection()throws Exception{
  assertEquals(1,request("/capabilities","GET",null).path("backgroundOperations").asInt());
  var note=resources.createNote("HTTP-owned fixture","{\"type\":\"doc\",\"content\":[]}");lifecycle.apply(new ResourceLifecycleService.Item(UUID.randomUUID().toString(),note.getId(),"trash",note.getRevision()));
  String path="/resources/trash/snapshots/"+UUID.randomUUID();var preview=request(path,"PUT",null);assertEquals(1,preview.path("total").asInt());
  assertTrue(request(path+"/confirm","POST",Map.of("generation",preview.path("generation").asText(),"count",1)).path("confirmed").asBoolean());
  assertEquals(1,request(path+"/step","POST",null).path("done").asInt());assertEquals(1,request(path+"/step","POST",null).path("done").asInt());assertEquals(0,request("/resources/trash","GET",null).path("totalItems").asInt());
 }
 @Test void busyAdmissionRetainsExactTypedOwnerPhaseAndRequestEvidence()throws Exception{
  var entered=new java.util.concurrent.CountDownLatch(1);var release=new java.util.concurrent.CountDownLatch(1);
  try(var executor=java.util.concurrent.Executors.newSingleThreadExecutor()){
   var work=executor.submit(()->gate.exclusive("fixture-maintenance","index batch",()->{entered.countDown();try{release.await(5,java.util.concurrent.TimeUnit.SECONDS);}catch(InterruptedException e){Thread.currentThread().interrupt();}}));assertTrue(entered.await(5,java.util.concurrent.TimeUnit.SECONDS));
   try{var input=HttpRequest.newBuilder(URI.create("http://localhost:"+env.getProperty("local.server.port")+"/api/resources")).header("X-Vaultor-Owner",Files.readString(DATA.resolve("host/owner.key"))).header("X-Request-ID","busy-admission-proof").build();var response=HttpClient.newHttpClient().send(input,HttpResponse.BodyHandlers.ofString());assertEquals(409,response.statusCode());var problem=json.readTree(response.body());assertEquals("WORKSPACE_BUSY",problem.path("code").asText());assertEquals("fixture-maintenance",problem.path("busy").path("owner").asText());assertEquals("index batch",problem.path("busy").path("phase").asText());assertEquals("busy-admission-proof",problem.path("requestId").asText());}
   finally{release.countDown();work.get(5,java.util.concurrent.TimeUnit.SECONDS);}
  }
 }
}
