package com.vaultor.vaultor.host;
import com.vaultor.vaultor.service.*;
import org.junit.jupiter.api.Test;
import org.springframework.transaction.support.TransactionTemplate;
import java.io.*;
import java.net.*;
import java.net.http.*;
import java.time.Duration;
import java.util.*;
import java.util.concurrent.*;
import static org.junit.jupiter.api.Assertions.*;

/** Actual approved owner + HTTPS client against disposable SQLite/trust; not a broad smoke suite. */
class ChangeFeedTest extends HostAccessTest {
    class Stream implements AutoCloseable {
        final InputStream input;final BlockingQueue<tools.jackson.databind.JsonNode> events=new LinkedBlockingQueue<>();
        Stream(String base,Map<String,String> headers,String cursor)throws Exception {
            var builder=HttpRequest.newBuilder(URI.create(base+"/api/changes"+(cursor==null?"":"?cursor="+URLEncoder.encode(cursor,java.nio.charset.StandardCharsets.UTF_8)))).timeout(Duration.ofSeconds(10));headers.forEach(builder::header);
            var response=client.send(builder.build(),HttpResponse.BodyHandlers.ofInputStream());assertEquals(200,response.statusCode());input=response.body();
            Thread.ofPlatform().daemon().start(()->{try(var reader=new BufferedReader(new InputStreamReader(input))){String line;while((line=reader.readLine())!=null)if(line.startsWith("data:"))events.offer(json.readTree(line.substring(5)));}catch(Exception ignored){}});
        }
        tools.jackson.databind.JsonNode next(String kind)throws Exception{for(int i=0;i<20;i++){var e=events.poll(1,TimeUnit.SECONDS);if(e!=null && e.path("kind").asText().equals(kind))return e;}throw new AssertionError("No "+kind+" event");}
        public void close()throws Exception{input.close();}
    }
    @Test void committedChangesScopedSettingsRevisionReplayAndRevocation()throws Exception {
        try(var context=start()) {
            var access=context.getBean(HostAccess.class);key=java.nio.file.Files.readString(data.resolve("host-access/owner.key"));local="http://127.0.0.1:"+context.getWebServer().getPort();client=trusted(access);
            var share=ok(local,"PUT","/api/owner/sharing",Map.of("enabled",true),owner());lan="https://127.0.0.1:"+share.path("port").asInt();
            var completed=approveComplete(enroll("agent",access.trust.fingerprint()));var bearer=Map.of("Authorization","Bearer "+completed.path("credential").asText());
            assertEquals(401,call(lan,"GET","/api/changes",null,Map.of()).statusCode());
            try(var stream=new Stream(lan,bearer,null)) {
                var reset=stream.next("reset");assertEquals(context.getBean(WorkspaceIdentityService.class).current().generation(),reset.path("generation").asText());
                var body=Map.of("title","Shared","content",Map.of("type","doc","content",List.of(Map.of("type","paragraph"))));
                var note=ok(local,"POST","/api/resources",body,owner());String id=note.path("id").asText();var created=stream.next("resources");
                assertFalse(created.toString().contains("Shared"));assertFalse(created.toString().contains("content"));
                assertEquals(428,call(lan,"PUT","/api/resources/"+id+"/note",body,bearer).statusCode());
                var conditional=new HashMap<>(bearer);conditional.put("If-Match","\""+note.path("revision").asText()+"\"");
                ok(lan,"PUT","/api/resources/"+id+"/note",Map.of("title","Device edit","content",body.get("content")),conditional);stream.next("resources");
                assertEquals(412,call(lan,"PUT","/api/resources/"+id+"/note",body,conditional).statusCode());
                ok(local,"POST","/api/resources/"+id+"/open",null,owner());
                assertNull(stream.events.poll(200,TimeUnit.MILLISECONDS),"Rejected writes/open recency do not publish");
                var feed=context.getBean(ChangeFeed.class);var tx=context.getBean(TransactionTemplate.class);
                assertThrows(IllegalStateException.class,()->tx.executeWithoutResult(s->{feed.committed("resources",List.of(id),"rollback");throw new IllegalStateException();}));
                assertNull(stream.events.poll(200,TimeUnit.MILLISECONDS),"Rolled-back transactions do not publish");
                var first=CompletableFuture.runAsync(()->{try{ok(local,"PATCH","/api/settings",Map.of("workspace",Map.of("maxOpenNotes",3),"local",Map.of("device-a",Map.of("theme","os"))),owner());}catch(Exception e){throw new RuntimeException(e);}});
                var second=CompletableFuture.runAsync(()->{try{ok(lan,"PATCH","/api/settings",Map.of("workspace",Map.of("autosaveDelay",321),"local",Map.of("device-b",Map.of("theme","light"))),bearer);}catch(Exception e){throw new RuntimeException(e);}});
                CompletableFuture.allOf(first,second).get(10,TimeUnit.SECONDS);stream.next("settings");stream.next("settings");
                var settings=ok(local,"GET","/api/settings",null,owner());assertEquals(3,settings.path("workspace").path("maxOpenNotes").asInt());assertEquals(321,settings.path("workspace").path("autosaveDelay").asInt());assertEquals("os",settings.path("local").path("device-a").path("theme").asText());assertEquals("light",settings.path("local").path("device-b").path("theme").asText());
                var collection=ok(lan,"PUT","/api/collections/creations/"+UUID.randomUUID(),Map.of("name","Team","resourceIds",List.of(id)),bearer);stream.next("organization");
                ok(local,"POST","/api/resources/"+id+"/tags/shared",null,owner());stream.next("resources");
                var organized=ok(lan,"GET","/api/resources/"+id,null,bearer);assertEquals(collection.path("id").asText(),organized.path("collections").get(0).path("id").asText());assertEquals("shared",organized.path("tags").get(0).path("name").asText());
                var transfers=context.getBean(TransferService.class);var archiveOp=transfers.export("workspace","zip");awaitTransfer(transfers,archiveOp.id());
                var archive=java.nio.file.Files.readAllBytes(transfers.download(archiveOp.id()));
                String generation=context.getBean(WorkspaceIdentityService.class).current().generation();
                for(String mode:List.of("merge","replace")) {
                    var preview=transfers.preview(new org.springframework.mock.web.MockMultipartFile("file","workspace.zip","application/zip",archive));
                    var committed=transfers.commit(preview.operation().id(),mode);awaitTransfer(transfers,committed.id());
                    var changed=stream.next("workspace");assertFalse(changed.toString().contains("Device edit"));
                    if(mode.equals("merge"))assertEquals(generation,context.getBean(WorkspaceIdentityService.class).current().generation());
                    else assertNotEquals(generation,context.getBean(WorkspaceIdentityService.class).current().generation());
                    stream.events.clear();
                }
                assertEquals(204,call(lan,"PUT","/api/resources/"+id+"/favorite",Map.of("favorite",true),bearer).statusCode());var pinned=stream.next("resources");
                String cursor=pinned.path("cursor").asText();
                assertEquals(204,call(local,"DELETE","/api/resources/"+id,null,owner()).statusCode());stream.next("resources");
                try(var replay=new Stream(lan,bearer,cursor)){assertEquals(id,replay.next("resources").path("ids").get(0).asText());}
                for(int i=0;i<1001;i++)feed.committed("resources",List.of(id),"bounded");
                try(var gap=new Stream(local,owner(),cursor)){assertEquals("reset",gap.next("reset").path("kind").asText());}
                ok(local,"DELETE","/api/owner/devices/"+completed.path("deviceId").asText(),null,owner());
                assertEquals(401,call(lan,"GET","/api/changes",null,bearer).statusCode());
            }
        }
    }
    void awaitTransfer(TransferService transfers,String id)throws Exception {
        for(int i=0;i<200;i++){var op=transfers.get(id);if(List.of("SUCCEEDED","FAILED").contains(op.status())){assertEquals("SUCCEEDED",op.status(),op.detail());return;}Thread.sleep(25);}fail("Transfer timed out");
    }
}
