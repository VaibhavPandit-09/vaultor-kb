package com.vaultor.vaultor.host;

import org.springframework.web.bind.annotation.*;
import org.springframework.http.*;
import jakarta.servlet.http.*;
import java.util.*;

@RestController
public class HostController {
    private final HostAccess access;private final HostListener listener;
    public HostController(HostAccess access,HostListener listener){this.access=access;this.listener=listener;}
    @GetMapping("/api/access/host") public Map<String,Object> host() throws Exception {return Map.of("hostId",access.hostId,"fingerprint",access.trust.fingerprint(),"pairing","host-approval","pairingTtlSeconds",300);}
    @GetMapping("/api/access/session") public Map<String,String> session(HttpServletRequest req){
        var d=access.authenticate(HostAccessFilter.credential(req,req.isSecure()),req.isSecure());
        return d==null?Map.of("role","OWNER","csrf",""):Map.of("role",d.role(),"deviceId",d.id(),"csrf",d.csrf());
    }
    @PostMapping("/api/pairings") public Map<String,Object> enroll(@RequestBody HostAccess.Enrollment value) throws Exception{return access.enroll(value);}
    @GetMapping("/api/pairings/{id}") public Map<String,String> poll(@PathVariable String id,@RequestHeader("X-Vaultor-Pairing") String secret){return access.poll(id,secret);}
    @PostMapping("/api/pairings/{id}/complete") public Map<String,String> complete(@PathVariable String id,@RequestHeader("X-Vaultor-Pairing") String secret,HttpServletResponse res){var result=access.complete(id,secret);if(result.get("kind").equals("browser")){HostAccessFilter.cookie(res,true,result.get("credential"));return Map.of("deviceId",result.get("deviceId"),"state","APPROVED");}return result;}
    @GetMapping("/api/owner/pairings") public List<Map<String,String>> requests(){return access.requests();}
    public record Decision(String code){}
    private String code(Decision value){if(value==null || value.code()==null || !value.code().matches("[0-9]{6}"))throw new AccessFailure(400,"INVALID_VERIFICATION_CODE","Supply the six-digit comparison code.");return value.code();}
    @PostMapping("/api/owner/pairings/{id}/approve") public void approve(@PathVariable String id,@RequestBody Decision value) throws Exception{access.decide(id,code(value),true);}
    @PostMapping("/api/owner/pairings/{id}/reject") public void reject(@PathVariable String id,@RequestBody Decision value) throws Exception{access.decide(id,code(value),false);}
    @GetMapping("/api/owner/devices") public List<HostAccess.DeviceSummary> devices(){return access.devices();}
    @DeleteMapping("/api/owner/devices/{id}") public void revoke(@PathVariable String id) throws Exception{access.revoke(id);}
    @GetMapping("/api/owner/sharing") public Map<String,Object> sharing(){return listener.status();}
    public record Sharing(Boolean enabled){}
    @PutMapping("/api/owner/sharing") public Map<String,Object> sharing(@RequestBody Sharing value) throws Exception{if(value==null || value.enabled()==null)throw new AccessFailure(400,"INVALID_SHARING_CONFIG","Specify enabled as true or false.");return listener.set(value.enabled());}
    @PostMapping("/api/owner/trust/renew") public Map<String,Object> renew() throws Exception{return listener.renew();}
    @GetMapping("/api/owner/trust/certificate") public ResponseEntity<byte[]> certificate() throws Exception{return ResponseEntity.ok().contentType(MediaType.parseMediaType("application/x-pem-file")).header("Content-Disposition","attachment; filename=Vaultor-host-ca.pem").body(access.trust.publicCertificate());}
    @PostMapping("/api/owner/browser-ticket") public Map<String,String> ticket(){return access.ticket();}
    public record Bootstrap(String ticket){}
    @PostMapping("/api/access/bootstrap") public Map<String,String> bootstrap(@RequestBody Bootstrap value,HttpServletRequest req,HttpServletResponse res) throws Exception{if(value==null)throw new AccessFailure(400,"INVALID_BOOTSTRAP","Supply the browser handoff ticket.");String credential=access.redeem(value.ticket(),HostAccessFilter.credential(req,false));HostAccessFilter.cookie(res,false,credential);return Map.of("state","OWNER");}
    @GetMapping("/access") public ResponseEntity<org.springframework.core.io.Resource> page(){return ResponseEntity.ok().contentType(MediaType.TEXT_HTML).header("Content-Security-Policy","default-src 'self'; script-src 'self'; style-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'").body(new org.springframework.core.io.ClassPathResource("static/access.html"));}
}
