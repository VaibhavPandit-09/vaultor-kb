package com.vaultor.vaultor.host;

import com.vaultor.vaultor.VaultorApplication;
import com.vaultor.vaultor.service.WorkspaceIdentityService;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.web.server.servlet.context.ServletWebServerApplicationContext;
import tools.jackson.databind.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import java.nio.file.*;
import java.net.*;
import java.net.http.*;
import java.security.*;
import javax.net.ssl.*;
import java.time.*;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;

class HostAccessTest {
    @TempDir Path data;final ObjectMapper json=new ObjectMapper();
    HttpClient client;String local,lan,key;
    ServletWebServerApplicationContext start(){
        var app=new SpringApplication(VaultorApplication.class);app.setDefaultProperties(Map.of("spring.main.banner-mode","off","logging.level.root","WARN"));
        return (ServletWebServerApplicationContext)app.run("--server.port=0","--server.address=127.0.0.1","--app.host.network-port=0","--app.host.path="+data.resolve("host-access"),"--spring.datasource.url=jdbc:sqlite:"+data.resolve("app.db"),"--app.storage.path="+data.resolve("files"));
    }
    HttpClient trusted(HostAccess access)throws Exception{
        var store=KeyStore.getInstance("PKCS12");store.load(null,null);store.setCertificateEntry("host",access.trust.ca());
        var tm=TrustManagerFactory.getInstance(TrustManagerFactory.getDefaultAlgorithm());tm.init(store);
        var ssl=SSLContext.getInstance("TLS");ssl.init(null,tm.getTrustManagers(),null);
        return HttpClient.newBuilder().sslContext(ssl).connectTimeout(Duration.ofSeconds(5)).build();
    }
    HttpResponse<String> call(String base,String method,String path,Object body,Map<String,String> headers)throws Exception{
        var b=HttpRequest.newBuilder(URI.create(base+path)).timeout(Duration.ofSeconds(10)).header("Content-Type","application/json").header("X-Request-ID","host-test");headers.forEach(b::header);
        return client.send(b.method(method,body==null?HttpRequest.BodyPublishers.noBody():HttpRequest.BodyPublishers.ofString(json.writeValueAsString(body))).build(),HttpResponse.BodyHandlers.ofString());
    }
    JsonNode ok(String base,String method,String path,Object body,Map<String,String> headers)throws Exception{var r=call(base,method,path,body,headers);assertEquals(200,r.statusCode(),r.body());return r.body().isBlank()?json.createObjectNode():json.readTree(r.body());}
    Map<String,String> owner(){return Map.of("X-Vaultor-Owner",key);}
    JsonNode enroll(String kind,String fingerprint)throws Exception{return ok(lan,"POST","/api/pairings",Map.of("name","Disposable client","kind",kind,"nonce",HostAccess.secret(),"fingerprint",fingerprint),Map.of());}
    JsonNode approveComplete(JsonNode p)throws Exception{
        String id=p.path("id").asText();var body=Map.of("code",p.path("code").asText());
        ok(local,"POST","/api/owner/pairings/"+id+"/approve",body,owner());
        ok(local,"POST","/api/owner/pairings/"+id+"/approve",body,owner());
        return ok(lan,"POST","/api/pairings/"+id+"/complete",Map.of(),Map.of("X-Vaultor-Pairing",p.path("secret").asText()));
    }
    @Test void realConnectorsEnforceApprovalCookiesOwnerIsolationAndPersistence()throws Exception{
        String credential,deviceId,fingerprint,hostId,ownerCookie,clientCookie,clientCsrf;
        try(var context=start()){
            var access=context.getBean(HostAccess.class);var listener=context.getBean(HostListener.class);
            key=Files.readString(data.resolve("host-access/owner.key"));local="http://127.0.0.1:"+context.getWebServer().getPort();client=trusted(access);
            assertEquals(false,listener.status().get("listening"));
            var share=ok(local,"PUT","/api/owner/sharing",Map.of("enabled",true),owner());lan="https://127.0.0.1:"+share.path("port").asInt();
            fingerprint=access.trust.fingerprint();hostId=access.hostId;
            assertThrows(Exception.class,()->HttpClient.newHttpClient().send(HttpRequest.newBuilder(URI.create(lan+"/api/access/host")).build(),HttpResponse.BodyHandlers.ofString()));
            for(String base:List.of(local,lan))for(String path:List.of("/api/resources","/api/settings","/api/health","/api/diagnostics/events","/api/operations/activity","/api/exports/unknown/download","/api/resources/unknown/raw","/index.html","/assets/app.js","/api/stream")){
                var r=call(base,"GET",path,null,Map.of());assertEquals(401,r.statusCode(),base+path+" "+r.body());assertEquals("host-test",r.headers().firstValue("X-Request-ID").orElseThrow());
            }
            assertEquals(403,call(lan,"GET","/api/owner/devices",null,owner()).statusCode());
            assertEquals(403,call(lan,"GET","/api/access/host",null,Map.of("Origin","https://evil.example")).statusCode());
            assertEquals(403,call(lan,"OPTIONS","/api/resources",null,Map.of("Origin",lan)).statusCode());
            assertEquals(413,call(lan,"POST","/api/pairings",Map.of("name","x".repeat(17000)),Map.of()).statusCode());
            var p=enroll("agent",fingerprint);String id=p.path("id").asText(),secret=p.path("secret").asText();
            assertEquals(404,call(lan,"GET","/api/pairings/"+id,null,Map.of("X-Vaultor-Pairing",HostAccess.secret())).statusCode());
            assertEquals(409,call(lan,"POST","/api/pairings/"+id+"/complete",Map.of(),Map.of("X-Vaultor-Pairing",secret)).statusCode());
            String wrongCode=p.path("code").asText().equals("000000")?"111111":"000000";
            assertEquals(403,call(local,"POST","/api/owner/pairings/"+id+"/approve",Map.of("code",wrongCode),owner()).statusCode());
            var completed=approveComplete(p);credential=completed.path("credential").asText();deviceId=completed.path("deviceId").asText();
            assertEquals(credential,ok(lan,"POST","/api/pairings/"+id+"/complete",Map.of(),Map.of("X-Vaultor-Pairing",secret)).path("credential").asText());
            var bearer=Map.of("Authorization","Bearer "+credential);
            ok(lan,"GET","/api/resources",null,bearer);assertEquals(403,call(lan,"GET","/api/owner/devices",null,bearer).statusCode());
            var bp=enroll("browser",fingerprint);String bid=bp.path("id").asText();ok(local,"POST","/api/owner/pairings/"+bid+"/approve",Map.of("code",bp.path("code").asText()),owner());
            var browser=call(lan,"POST","/api/pairings/"+bid+"/complete",Map.of(),Map.of("X-Vaultor-Pairing",bp.path("secret").asText()));assertEquals(200,browser.statusCode(),browser.body());
            String set=browser.headers().firstValue("Set-Cookie").orElseThrow();assertTrue(set.contains("HttpOnly") && set.contains("Secure") && set.contains("SameSite=Strict"));clientCookie=set.split(";")[0];assertFalse(browser.body().contains("credential"));
            // Completion may be retried after headers set the cookie but the response body was interrupted.
            ok(lan,"POST","/api/pairings/"+bid+"/complete",Map.of(),Map.of("Cookie",clientCookie,"Origin",lan,"X-Vaultor-Pairing",bp.path("secret").asText()));
            clientCsrf=ok(lan,"GET","/api/access/session",null,Map.of("Cookie",clientCookie)).path("csrf").asText();
            assertEquals(403,call(lan,"POST","/api/diagnostics/events",List.of(),Map.of("Cookie",clientCookie,"Origin",lan)).statusCode());
            ok(lan,"POST","/api/diagnostics/events",List.of(),Map.of("Cookie",clientCookie,"Origin",lan,"X-Vaultor-CSRF",clientCsrf));
            assertEquals(403,call(lan,"POST","/api/diagnostics/events",List.of(),Map.of("Cookie",clientCookie,"Origin","https://evil.example","X-Vaultor-CSRF",clientCsrf)).statusCode());
            var ticket=ok(local,"POST","/api/owner/browser-ticket",null,owner()).path("ticket").asText();
            assertEquals(403,call(lan,"POST","/api/access/bootstrap",Map.of("ticket",ticket),bearer).statusCode());
            var redeemed=call(local,"POST","/api/access/bootstrap",Map.of("ticket",ticket),Map.of("Origin",local));assertEquals(200,redeemed.statusCode(),redeemed.body());ownerCookie=redeemed.headers().firstValue("Set-Cookie").orElseThrow().split(";")[0];
            assertEquals(403,call(local,"POST","/api/access/bootstrap",Map.of("ticket",ticket),Map.of()).statusCode());
            int beforeBrowserReuse=access.devices().size();
            String anotherTicket=ok(local,"POST","/api/owner/browser-ticket",null,owner()).path("ticket").asText();
            ok(local,"POST","/api/access/bootstrap",Map.of("ticket",anotherTicket),Map.of("Cookie",ownerCookie,"Origin",local));
            assertEquals(beforeBrowserReuse,access.devices().size());
            ok(local,"GET","/api/owner/devices",null,Map.of("Cookie",ownerCookie));assertEquals(403,call(lan,"GET","/api/owner/devices",null,Map.of("Cookie",ownerCookie)).statusCode());
            assertEquals(403,call(local,"PUT","/api/owner/sharing",Map.of("enabled",true),Map.of("Cookie",ownerCookie)).statusCode());
            var csrf=ok(local,"GET","/api/access/session",null,Map.of("Cookie",ownerCookie)).path("csrf").asText();ok(local,"PUT","/api/owner/sharing",Map.of("enabled",true),Map.of("Cookie",ownerCookie,"Origin",local,"X-Vaultor-CSRF",csrf));
            String persisted=Files.readString(data.resolve("host-access/devices.json"));assertFalse(persisted.contains(credential));assertFalse(persisted.contains(secret));assertFalse(persisted.contains(p.path("code").asText()));
            String serial=access.trust.store.getCertificate("server").toString();ok(local,"POST","/api/owner/trust/renew",Map.of(),owner());assertNotEquals(serial,access.trust.store.getCertificate("server").toString());assertEquals(fingerprint,access.trust.fingerprint());
            client=trusted(access);ok(lan,"GET","/api/resources",null,bearer);
            var identities=context.getBean(WorkspaceIdentityService.class);String generation=identities.current().generation();identities.replaced();assertNotEquals(generation,identities.current().generation());assertEquals(hostId,access.hostId);assertEquals(fingerprint,access.trust.fingerprint());ok(lan,"GET","/api/resources",null,bearer);
        }
        // Real server restart, new OS-assigned ports, same host trust and browser/device approvals.
        try(var context=start()){
            var access=context.getBean(HostAccess.class);var listener=context.getBean(HostListener.class);assertEquals(hostId,access.hostId);assertEquals(fingerprint,access.trust.fingerprint());
            local="http://127.0.0.1:"+context.getWebServer().getPort();lan="https://127.0.0.1:"+listener.status().get("port");client=trusted(access);
            var bearer=Map.of("Authorization","Bearer "+credential);ok(lan,"GET","/api/resources",null,bearer);ok(local,"GET","/api/owner/devices",null,Map.of("Cookie",ownerCookie));
            ok(lan,"POST","/api/diagnostics/events",List.of(),Map.of("Cookie",clientCookie,"Origin",lan,"X-Vaultor-CSRF",clientCsrf));
            ok(local,"DELETE","/api/owner/devices/"+deviceId,null,owner());assertEquals(401,call(lan,"GET","/api/resources",null,bearer).statusCode());
            ok(local,"PUT","/api/owner/sharing",Map.of("enabled",false),owner());assertEquals(false,listener.status().get("listening"));
            assertThrows(Exception.class,()->call(lan,"GET","/api/access/host",null,Map.of()));
        }
    }
    @Test void enrollmentExpiryRejectionLimitsAndDamagedTrustFailClosed()throws Exception{
        var access=new HostAccess(json,data.resolve("host-access").toString());String fp=access.trust.fingerprint();var p=access.enroll(new HostAccess.Enrollment("Agent","agent",HostAccess.secret(),fp));
        access.decide((String)p.get("id"),(String)p.get("code"),false);assertEquals("REJECTED",access.poll((String)p.get("id"),(String)p.get("secret")).get("state"));
        assertThrows(AccessFailure.class,()->access.complete((String)p.get("id"),(String)p.get("secret")));
        var ticket=access.ticket().get("ticket");access.clock(Clock.offset(Clock.systemUTC(),Duration.ofMinutes(6)));
        assertThrows(AccessFailure.class,()->access.poll((String)p.get("id"),(String)p.get("secret")));assertThrows(AccessFailure.class,()->access.redeem(ticket));
        for(int i=0;i<32;i++)access.enroll(new HostAccess.Enrollment("Client","agent",HostAccess.secret(),fp));assertThrows(AccessFailure.class,()->access.enroll(new HostAccess.Enrollment("Excess","agent",HostAccess.secret(),fp)));
        for(int i=0;i<60;i++)access.rate("ip");assertThrows(AccessFailure.class,()->access.rate("ip"));
        assertThrows(Exception.class,()->new HostAccess(json,data.resolve("host-access").toString()));access.close();
        Files.writeString(data.resolve("host-access/trust.p12"),"damaged");assertThrows(Exception.class,()->new HostAccess(json,data.resolve("host-access").toString()));assertEquals("damaged",Files.readString(data.resolve("host-access/trust.p12")));
    }
}
