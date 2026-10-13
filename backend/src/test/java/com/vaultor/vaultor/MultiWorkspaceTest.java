package com.vaultor.vaultor;

import com.vaultor.vaultor.host.*;
import com.vaultor.vaultor.workspaces.*;
import com.vaultor.vaultor.service.*;
import com.vaultor.vaultor.repository.*;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.core.env.Environment;
import org.springframework.mock.web.*;
import org.springframework.web.context.request.*;
import tools.jackson.databind.*;
import java.nio.file.*;
import java.net.*;
import java.net.http.*;
import java.util.*;
import java.util.concurrent.*;
import static org.junit.jupiter.api.Assertions.*;

@SpringBootTest(webEnvironment=SpringBootTest.WebEnvironment.RANDOM_PORT)
@TestMethodOrder(MethodOrderer.OrderAnnotation.class)
class MultiWorkspaceTest {
    static final Path DATA;
    static final String OTHER=UUID.randomUUID().toString(), SAME=UUID.randomUUID().toString();
    static {try{DATA=Files.createTempDirectory("vaultor-multi-");}catch(Exception e){throw new ExceptionInInitializerError(e);}}
    @DynamicPropertySource static void properties(DynamicPropertyRegistry p){p.add("app.host.network-port",()->"0");p.add("app.host.path",()->DATA.resolve("host-access").toString());p.add("spring.datasource.url",()->"jdbc:sqlite:"+DATA.resolve("app.db"));p.add("app.storage.path",()->DATA.resolve("files").toString());}
    @Autowired Environment env;@Autowired ObjectMapper json;@Autowired WorkspaceCatalog catalog;@Autowired WorkspaceRegistry registry;@Autowired HostAccess access;
    @Autowired com.vaultor.vaultor.config.WorkspaceRequestFilter filter;
    @Autowired HostListener listener;
    final HttpClient client=HttpClient.newHttpClient();
    HttpResponse<String> request(String method,String path,String scope,Object body,boolean owner) throws Exception {
        var b=HttpRequest.newBuilder(URI.create("http://localhost:"+env.getProperty("local.server.port")+"/api"+path)).header("Content-Type","application/json").header("X-Vaultor-Protocol","3");
        if(owner)b.header("X-Vaultor-Owner",Files.readString(DATA.resolve("host-access/owner.key")));if(scope!=null)b.header("X-Vaultor-Workspace",scope);
        return client.send(b.method(method,body==null?HttpRequest.BodyPublishers.noBody():HttpRequest.BodyPublishers.ofString(json.writeValueAsString(body))).build(),HttpResponse.BodyHandlers.ofString());
    }
    JsonNode ok(String method,String path,String scope,Object body) throws Exception {var r=request(method,path,scope,body,true);assertTrue(r.statusCode()<300,r.statusCode()+" "+r.body());return r.body().isBlank()?json.createObjectNode():json.readTree(r.body());}
    @Test @Order(1) void adoptionAndIndependentContexts() throws Exception {
        assertEquals(catalog.defaultId(),ok("GET","/workspace/identity",null,null).path("id").asText());assertTrue(Files.size(DATA.resolve("workspaces/legacy-adoption.db"))>0);
        assertEquals(401,request("GET","/workspaces",null,null,false).statusCode());
        assertEquals(401,request("GET","/capabilities",OTHER,null,false).statusCode());
        assertTrue(json.readTree(request("GET","/capabilities",null,null,false).body()).path("multiWorkspace").asBoolean());
        ok("PUT","/owner/workspaces/"+OTHER,null,Map.of("name","Other workspace"));
        ok("PUT","/owner/workspaces/"+OTHER,null,Map.of("name","Other workspace")); // retry same identity
        assertEquals(409,request("PUT","/owner/workspaces/"+OTHER,null,Map.of("name","Different"),true).statusCode());
        assertEquals(OTHER,ok("GET","/workspace/identity",OTHER,null).path("id").asText());
        assertEquals(2,ok("GET","/workspaces",null,null).size());
        assertEquals(400,request("GET","/resources","../escape",null,true).statusCode());assertEquals(404,request("GET","/resources",UUID.randomUUID().toString(),null,true).statusCode());
        var a=registry.open(catalog.defaultId());var b=registry.open(OTHER);
        assertNotSame(a.context().getBean(ResourceRepository.class),b.context().getBean(ResourceRepository.class));
        assertNotSame(a.gate(),b.gate());assertNotSame(a.feed(),b.feed());assertNotSame(a.context().getBean(TransferService.class),b.context().getBean(TransferService.class));
        for(var r:List.of(a,b)){var f=new MockMultipartFile("file","source.txt","text/plain",(r==a?"first":"second").getBytes());r.context().getBean(FileImportService.class).create(SAME,r==a?"First":"Second",null,f,null);}
        assertEquals("First",ok("GET","/resources/"+SAME,null,null).path("title").asText());assertEquals("Second",ok("GET","/resources/"+SAME,OTHER,null).path("title").asText());
        assertEquals("first",request("GET","/resources/"+SAME+"/download",null,null,true).body());assertEquals("second",request("GET","/resources/"+SAME+"/download",OTHER,null,true).body());
        b.gate().quiesce();try{assertEquals(409,request("GET","/resources",OTHER,null,true).statusCode());assertEquals(200,request("GET","/resources",null,null,true).statusCode());}finally{b.gate().resume();}
    }
    @Test @Order(2) void concurrentQueriesAndBackgroundIsolation() throws Exception {
        var jobs=new ArrayList<CompletableFuture<Void>>();
        for(int i=0;i<12;i++){boolean other=i%2==0;jobs.add(CompletableFuture.runAsync(()->{try{assertEquals(other?"Second":"First",ok("GET","/resources/"+SAME,other?OTHER:null,null).path("title").asText());}catch(Exception e){throw new CompletionException(e);}}));}
        CompletableFuture.allOf(jobs.toArray(CompletableFuture[]::new)).get(20,TimeUnit.SECONDS);
        var a=registry.open(catalog.defaultId());var b=registry.open(OTHER);
        a.context().getBean(ResourceSearchService.class).rebuild("test");b.context().getBean(ResourceSearchService.class).rebuild("test");
        assertTimeoutPreemptively(java.time.Duration.ofSeconds(15),()->{while(a.context().getBean(ResourceSearchService.class).status().rebuilding()||b.context().getBean(ResourceSearchService.class).status().rebuilding())Thread.sleep(50);});
        assertEquals(0,ok("GET","/resources?q=Second",null,null).path("totalItems").asInt());assertEquals(1,ok("GET","/resources?q=Second",OTHER,null).path("totalItems").asInt());
        var op=ok("POST","/exports",OTHER,Map.of("scope","workspace","format","zip")).path("id").asText();
        assertTimeoutPreemptively(java.time.Duration.ofSeconds(15),()->{while(!"SUCCEEDED".equals(ok("GET","/operations/"+op,OTHER,null).path("status").asText()))Thread.sleep(50);});
        assertEquals(404,request("GET","/operations/"+op,null,null,true).statusCode());
        String before=a.context().getBean(WorkspaceIdentityService.class).current().generation();b.context().getBean(WorkspaceIdentityService.class).replaced();assertEquals(before,a.context().getBean(WorkspaceIdentityService.class).current().generation());
    }
    @Test @Order(3) void grantsBeforeDispatchAndCapturedAuthorization() throws Exception {
        String device=UUID.randomUUID().toString();assertTrue(catalog.allowed(catalog.defaultId(),device));assertFalse(catalog.allowed(OTHER,device));assertEquals(1,catalog.list(device).size());
        var req=new MockHttpServletRequest("GET","/resources");req.setRequestURI("/api/resources");req.addHeader("X-Vaultor-Workspace",OTHER);req.setAttribute(HostAccessFilter.PRINCIPAL,new HostAccess.Device(device,"Test","agent","CLIENT","","",""));
        var res=new MockHttpServletResponse();filter.doFilter(req,res,(r,s)->fail("Unauthorized workspace was dispatched"));assertEquals(404,res.getStatus());
        catalog.grant(OTHER,device,true);assertEquals(2,catalog.list(device).size());
        // Capture while authorized, then revoke before background execution; no mutable selected workspace involved.
        var feed=registry.open(OTHER).feed();feed.authorize(d->catalog.allowed(OTHER,d));RequestContextHolder.setRequestAttributes(new ServletRequestAttributes(req));Runnable captured;try{captured=feed.captureAuthorization();}finally{RequestContextHolder.resetRequestAttributes();}
        catalog.grant(OTHER,device,false);assertThrows(AccessFailure.class,captured::run);
        catalog.grant(catalog.defaultId(),device,false);assertEquals(0,catalog.list(device).size());
        feed.authorize(d->access.deviceActive(d)&&catalog.allowed(OTHER,d));
        assertEquals(404,request("GET","/workspaces/"+UUID.randomUUID(),null,null,true).statusCode());
    }
    @Test @Order(4) void catalogRestartAndFailClosedCorruption() throws Exception {
        var identity=registry.open(catalog.defaultId()).context().getBean(WorkspaceIdentityService.class);var jdbc=registry.open(catalog.defaultId()).context().getBean(org.springframework.jdbc.core.JdbcTemplate.class);
        var reopened=new WorkspaceCatalog(access,identity,jdbc,json);assertEquals(catalog.defaultId(),reopened.defaultId());assertEquals(2,reopened.list(null).size());
        Path store=DATA.resolve("workspaces/catalog.json");byte[] original=Files.readAllBytes(store);try{Files.writeString(store,"{}");assertThrows(Exception.class,()->new WorkspaceCatalog(access,identity,jdbc,json));}finally{Files.write(store,original);}
        assertEquals(2,new WorkspaceCatalog(access,identity,jdbc,json).list(null).size());
    }
    @Test @Order(5) void multipartLifecycleAndScopedStreams() throws Exception {
        String boundary="vaultor-boundary";
        String body="--"+boundary+"\r\nContent-Disposition: form-data; name=\"file\"; filename=\"uploaded.txt\"\r\nContent-Type: text/plain\r\n\r\nuploaded-original\r\n--"+boundary+"--\r\n";
        String base="http://localhost:"+env.getProperty("local.server.port")+"/api";
        var upload=HttpRequest.newBuilder(URI.create(base+"/resources/file")).header("X-Vaultor-Owner",Files.readString(DATA.resolve("host-access/owner.key"))).header("X-Vaultor-Workspace",OTHER).header("Content-Type","multipart/form-data; boundary="+boundary).POST(HttpRequest.BodyPublishers.ofString(body)).build();
        var uploaded=client.send(upload,HttpResponse.BodyHandlers.ofString());assertEquals(200,uploaded.statusCode(),uploaded.body());String id=json.readTree(uploaded.body()).path("id").asText();assertEquals(404,request("GET","/resources/"+id,null,null,true).statusCode());
        String revision=ok("GET","/resources/"+id,OTHER,null).path("revision").asText();
        assertEquals("trashed",ok("PUT","/resources/lifecycle",OTHER,List.of(Map.of("operationId",UUID.randomUUID().toString(),"resourceId",id,"action","trash","revision",revision))).get(0).path("status").asText());
        assertEquals(1,ok("GET","/resources/trash",OTHER,null).path("totalItems").asInt());assertEquals(0,ok("GET","/resources/trash",null,null).path("totalItems").asInt());
        var streamRequest=HttpRequest.newBuilder(URI.create(base+"/changes")).header("X-Vaultor-Owner",Files.readString(DATA.resolve("host-access/owner.key"))).header("X-Vaultor-Workspace",OTHER).GET().build();
        var streamed=client.send(streamRequest,HttpResponse.BodyHandlers.ofInputStream());assertEquals(200,streamed.statusCode());
        try(var lines=new java.io.BufferedReader(new java.io.InputStreamReader(streamed.body()))){
            String initial=readData(lines);assertEquals("reset",json.readTree(initial).path("kind").asText());
            ok("POST","/resources",OTHER,Map.of("type","note","title","Stream isolated","content",Map.of("type","doc","content",List.of())));
            String event=readData(lines);assertEquals("resources",json.readTree(event).path("kind").asText());assertEquals(registry.open(OTHER).context().getBean(WorkspaceIdentityService.class).current().generation(),json.readTree(event).path("generation").asText());
        }
    }
    String readData(java.io.BufferedReader lines) throws Exception {
        return CompletableFuture.supplyAsync(()->{try{String line;while((line=lines.readLine())!=null)if(line.startsWith("data:"))return line.substring(5);throw new IllegalStateException("Stream ended");}catch(Exception e){throw new CompletionException(e);}}).get(8,TimeUnit.SECONDS);
    }
    @Test @Order(5) void approvedHttpsDeviceCannotCrossWorkspaceGrant() throws Exception {
        // Explicit matching-code approval on this disposable host; TLS validates its CA and hostname.
        var enrollment=access.enroll(new HostAccess.Enrollment("Workspace test","agent",HostAccess.secret(),access.trust.fingerprint()));
        access.decide((String)enrollment.get("id"),(String)enrollment.get("code"),true);
        var completed=access.complete((String)enrollment.get("id"),(String)enrollment.get("secret"));String device=completed.get("deviceId");
        var store=java.security.KeyStore.getInstance("PKCS12");store.load(null,null);store.setCertificateEntry("host",access.trust.ca());
        var trust=javax.net.ssl.TrustManagerFactory.getInstance(javax.net.ssl.TrustManagerFactory.getDefaultAlgorithm());trust.init(store);var ssl=javax.net.ssl.SSLContext.getInstance("TLS");ssl.init(null,trust.getTrustManagers(),null);
        var secure=HttpClient.newBuilder().sslContext(ssl).build();String base="https://127.0.0.1:"+listener.set(true).get("port")+"/api";
        try {
            for(String path:List.of("/resources","/changes","/exports/"+UUID.randomUUID()+"/download","/operations/"+UUID.randomUUID())){
                var denied=HttpRequest.newBuilder(URI.create(base+path)).header("Authorization","Bearer "+completed.get("credential")).header("X-Vaultor-Workspace",OTHER).GET().build();assertEquals(404,secure.send(denied,HttpResponse.BodyHandlers.ofString()).statusCode());
            }
            var list=HttpRequest.newBuilder(URI.create(base+"/workspaces")).header("Authorization","Bearer "+completed.get("credential")).GET().build();assertEquals(1,json.readTree(secure.send(list,HttpResponse.BodyHandlers.ofString()).body()).size());
            ok("PUT","/owner/workspaces/"+OTHER+"/grants",null,Map.of("deviceId",device,"allowed",true));
            assertEquals(2,json.readTree(secure.send(list,HttpResponse.BodyHandlers.ofString()).body()).size());
            var content=HttpRequest.newBuilder(URI.create(base+"/resources/"+SAME)).header("Authorization","Bearer "+completed.get("credential")).header("X-Vaultor-Workspace",OTHER).GET().build();assertEquals("Second",json.readTree(secure.send(content,HttpResponse.BodyHandlers.ofString()).body()).path("title").asText());
            var stream=HttpRequest.newBuilder(URI.create(base+"/changes")).header("Authorization","Bearer "+completed.get("credential")).header("X-Vaultor-Workspace",OTHER).GET().build();
            try(var lines=new java.io.BufferedReader(new java.io.InputStreamReader(secure.send(stream,HttpResponse.BodyHandlers.ofInputStream()).body()))){
                assertEquals("reset",json.readTree(readData(lines)).path("kind").asText());
                ok("PUT","/owner/workspaces/"+OTHER+"/grants",null,Map.of("deviceId",device,"allowed",false));
                assertNull(CompletableFuture.supplyAsync(()->{try{String line;while((line=lines.readLine())!=null){}return line;}catch(Exception e){throw new CompletionException(e);}}).get(8,TimeUnit.SECONDS));
            }
            assertEquals(404,secure.send(content,HttpResponse.BodyHandlers.ofString()).statusCode());access.revoke(device);assertEquals(401,secure.send(list,HttpResponse.BodyHandlers.ofString()).statusCode());
        } finally {listener.set(false);}
    }
    @Test @Order(6) void childRestartRetainsIdentityBytesAndCatalogLimit() throws Exception {
        var main=registry.open(catalog.defaultId()).context();var before=registry.open(OTHER).context().getBean(WorkspaceIdentityService.class).current();
        registry.close();var restarted=new WorkspaceRegistry(main,catalog,access);
        try {
            var child=restarted.open(OTHER).context();assertEquals(before,child.getBean(WorkspaceIdentityService.class).current());
            var resource=child.getBean(ResourceRepository.class).findById(SAME).orElseThrow();assertEquals("Second",resource.getTitle());assertEquals("second",Files.readString(child.getBean(FileStorageService.class).getFile(resource.getFilePath())));
            assertTrue(access.owner(Files.readString(DATA.resolve("host-access/owner.key"))),"Closing child must not close/change shared host access");
        } finally {restarted.close();}
        for(int i=2;i<WorkspaceCatalog.LIMIT;i++)catalog.create(UUID.randomUUID().toString(),"Bounded "+i);
        var failure=assertThrows(AccessFailure.class,()->catalog.create(UUID.randomUUID().toString(),"Excess"));assertEquals("WORKSPACE_LIMIT",failure.code);
        assertEquals(WorkspaceCatalog.LIMIT,catalog.list(null).size());
    }
}
