package com.vaultor.vaultor.host;

import org.springframework.stereotype.Service;
import org.springframework.beans.factory.annotation.Value;
import tools.jackson.databind.ObjectMapper;
import java.nio.file.*;
import java.nio.charset.StandardCharsets;
import java.security.*;
import java.net.*;
import java.time.*;
import java.util.*;

@Service
public class HostAccess implements AutoCloseable {
    public record Device(String id,String name,String kind,String role,String verifier,String csrf,String approvedAt) {}
    public record DeviceSummary(String id,String name,String kind,String role,String approvedAt) {}
    public record Enrollment(String name,String kind,String nonce,String fingerprint) {}
    static final class Pending {
        String id,secret,code,credential,deviceId,state="PENDING"; Enrollment request; Instant expires;
    }
    record Limit(long minute,int count) {}
    public final Path directory;
    public final String hostId;
    public final HostTrust trust;
    private final ObjectMapper json;
    private final String ownerKey;
    private Map<String,Device> devices=new LinkedHashMap<>();
    private final Map<String,Pending> pending=new LinkedHashMap<>();
    private final Map<String,Instant> tickets=new HashMap<>();
    private final Map<String,Limit> limits=new LinkedHashMap<>();
    private java.time.Clock clock=java.time.Clock.systemUTC();
    private final java.nio.channels.FileChannel lockChannel;
    private final java.nio.channels.FileLock lock;
    public HostAccess(ObjectMapper json,@Value("${app.host.path}") String path) throws Exception {
        this.json=json;directory=Path.of(path).toAbsolutePath();Files.createDirectories(directory);HostFiles.privatePath(directory,true);
        lockChannel=java.nio.channels.FileChannel.open(directory.resolve("host.lock"),StandardOpenOption.CREATE,StandardOpenOption.WRITE);
        try { lock=lockChannel.tryLock(); if(lock==null)throw new IllegalStateException("Another server owns this host-access directory."); }
        catch(Exception failure){lockChannel.close();throw failure;}
        try {
        Path identity=directory.getParent().resolve("host.json");
        if(!Files.exists(identity)) HostFiles.write(identity,json.writeValueAsBytes(Map.of("version",1,"id",UUID.randomUUID().toString())));
        var host=json.readTree(Files.readAllBytes(identity));hostId=host.path("id").asText();
        if(host.path("version").asInt()!=1 || !hostId.matches("[a-f0-9-]{36}")) throw new IllegalStateException("Host identity is damaged; restore host.json. Nothing was reset.");
        Path owner=directory.resolve("owner.key");String injected=System.getenv("VAULTOR_LOCAL_OWNER_KEY");
        if(injected!=null && !injected.matches("[a-f0-9]{64}")) throw new IllegalStateException("Invalid local owner credential provisioning");
        if(injected!=null || !Files.exists(owner)) HostFiles.write(owner,(injected==null?secret():injected).getBytes(StandardCharsets.US_ASCII));
        ownerKey=Files.readString(owner);if(!ownerKey.matches("[a-f0-9]{64}")) throw new IllegalStateException("Owner credential is damaged; restore owner.key.");
        Path store=directory.resolve("devices.json");
        if(Files.exists(store)) {
            if(Files.size(store)>2*1024*1024) throw new IllegalStateException("Host device store exceeds its limit");
            var tree=json.readTree(Files.readAllBytes(store));
            if(tree.path("version").asInt()!=1 || !tree.path("devices").isArray() || tree.path("devices").size()>1000) throw new IllegalStateException("Host device store is damaged; restore the host-access backup.");
            for(var node:tree.path("devices")) {var d=json.treeToValue(node,Device.class);
                if(d.id()==null || !d.id().matches("[a-f0-9-]{36}") || d.verifier()==null || !d.verifier().matches("[a-f0-9]{64}") || !Set.of("OWNER","CLIENT").contains(d.role()) || d.csrf()==null || !d.csrf().matches("[a-f0-9]{64}")) throw new IllegalStateException("Host device store is damaged");
                devices.put(d.id(),d);
            }
        }
        trust=new HostTrust(directory,hostId);
        } catch(Exception failure){lock.release();lockChannel.close();throw failure;}
    }
    @jakarta.annotation.PreDestroy @Override public void close() throws Exception {if(lock.isValid())lock.release();if(lockChannel.isOpen())lockChannel.close();}
    public static String secret(){byte[] bytes=new byte[32];new SecureRandom().nextBytes(bytes);return HexFormat.of().formatHex(bytes);}
    public static String hash(byte[] bytes){try{return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes));}catch(Exception e){throw new IllegalStateException(e);}}
    static String hash(String value){return hash(value.getBytes(StandardCharsets.UTF_8));}
    static boolean same(String a,String b){return a!=null && b!=null && MessageDigest.isEqual(a.getBytes(StandardCharsets.UTF_8),b.getBytes(StandardCharsets.UTF_8));}
    public boolean owner(String key){return same(ownerKey,key);}
    static public boolean privateAddress(InetAddress address){
        byte[] b=address.getAddress();return address.isLoopbackAddress() || address.isSiteLocalAddress() || address.isLinkLocalAddress() || b.length==16 && (b[0]&0xfe)==0xfc;
    }
    public synchronized Device authenticate(String credential,boolean network){
        if(credential==null || !credential.matches("[a-f0-9]{64}")) return null;
        String verifier=hash(credential);
        for(var device:devices.values()) if(same(device.verifier(),verifier) && (!network || device.role().equals("CLIENT"))) return device;
        return null;
    }
    public synchronized List<DeviceSummary> devices(){return devices.values().stream().map(d->new DeviceSummary(d.id(),d.name(),d.kind(),d.role(),d.approvedAt())).toList();}
    private void save(Map<String,Device> next) throws Exception {
        HostFiles.write(directory.resolve("devices.json"),json.writeValueAsBytes(Map.of("version",1,"devices",next.values())));devices=next;
    }
    public synchronized void revoke(String id) throws Exception {var next=new LinkedHashMap<>(devices);next.remove(id);save(next);pending.values().removeIf(p->id.equals(p.deviceId));}
    private Device add(String name,String kind,String role,String credential) throws Exception {
        if(devices.size()>=1000) throw new AccessFailure(409,"DEVICE_LIMIT","Revoke an unused device before adding another.");
        var d=new Device(UUID.randomUUID().toString(),name,kind,role,hash(credential),secret(),clock.instant().toString());
        var next=new LinkedHashMap<>(devices);next.put(d.id(),d);save(next);return d;
    }
    public synchronized void rate(String address) {
        long minute=clock.instant().getEpochSecond()/60;limits.entrySet().removeIf(e->e.getValue().minute()!=minute);
        var old=limits.get(address);
        if(old==null && limits.size()>=256 || old!=null && old.count()>=60) throw new AccessFailure(429,"ACCESS_RATE_LIMIT","Too many access requests. Retry in a minute.");
        limits.put(address,new Limit(minute,old==null?1:old.count()+1));
    }
    private void expire(){pending.values().removeIf(p->!p.expires.isAfter(clock.instant()));tickets.values().removeIf(t->!t.isAfter(clock.instant()));}
    public synchronized Map<String,Object> enroll(Enrollment r) throws Exception {
        expire();
        if(r==null || r.name()==null || r.name().isBlank() || r.name().length()>80 || r.name().chars().anyMatch(Character::isISOControl) || !Set.of("desktop","browser","agent").contains(r.kind()==null?"":r.kind()) || r.nonce()==null || !r.nonce().matches("[a-f0-9]{64}")) throw new AccessFailure(400,"INVALID_ENROLLMENT","Supply a device name, kind and random 32-byte nonce.");
        if(!same(trust.fingerprint(),r.fingerprint())) throw new AccessFailure(409,"HOST_TRUST_CHANGED","Verify this host's public certificate before requesting access.");
        if(pending.size()>=32) throw new AccessFailure(429,"PAIRING_LIMIT","Too many pending requests. Wait for one to finish.");
        var p=new Pending();p.id=UUID.randomUUID().toString();p.secret=secret();p.request=r;p.expires=clock.instant().plusSeconds(300);
        byte[] digest=HexFormat.of().parseHex(hash(r.fingerprint()+":"+r.nonce()+":"+p.id+":"+p.secret));
        long code=Integer.toUnsignedLong(java.nio.ByteBuffer.wrap(digest).getInt())%1_000_000;
        p.code=String.format(Locale.ROOT,"%06d",code);pending.put(p.id,p);
        return Map.of("id",p.id,"secret",p.secret,"code",p.code,"expiresAt",p.expires.toString(),"hostId",hostId,"fingerprint",trust.fingerprint());
    }
    private Pending find(String id,String secret){expire();var p=pending.get(id);if(p==null || !same(p.secret,secret)) throw new AccessFailure(404,"PAIRING_UNAVAILABLE","Pairing request expired or is unavailable. Request access again.");return p;}
    public synchronized Map<String,String> poll(String id,String secret){var p=find(id,secret);return Map.of("id",p.id,"state",p.state,"expiresAt",p.expires.toString());}
    public synchronized List<Map<String,String>> requests(){expire();return pending.values().stream().filter(p->p.state.equals("PENDING")).map(p->Map.of("id",p.id,"name",p.request.name(),"kind",p.request.kind(),"code",p.code,"fingerprint",p.request.fingerprint(),"expiresAt",p.expires.toString())).toList();}
    public synchronized void decide(String id,String code,boolean approve) throws Exception {
        expire();var p=pending.get(id);if(p==null) throw new AccessFailure(404,"PAIRING_UNAVAILABLE","This request expired. Ask the client to request access again.");
        if(!same(p.code,code)) throw new AccessFailure(403,"PAIRING_CODE_MISMATCH","The verification codes do not match.");
        if(!p.state.equals("PENDING")) {if(p.state.equals(approve?"APPROVED":"REJECTED")) return;throw new AccessFailure(409,"PAIRING_ALREADY_DECIDED","This request already has a different decision.");}
        if(approve) {String credential=secret();var d=add(p.request.name(),p.request.kind(),"CLIENT",credential);p.credential=credential;p.deviceId=d.id();p.state="APPROVED";}else p.state="REJECTED";
    }
    public synchronized Map<String,String> complete(String id,String secret) {
        var p=find(id,secret);if(!p.state.equals("APPROVED")) throw new AccessFailure(409,"PAIRING_NOT_APPROVED","Wait for the host to approve this request.");
        // The same response is retryable within the five-minute request window. Only its verifier is durable.
        return Map.of("credential",p.credential,"deviceId",p.deviceId,"kind",p.request.kind());
    }
    public synchronized Map<String,String> ticket(){expire();if(tickets.size()>=32) throw new AccessFailure(429,"BOOTSTRAP_LIMIT","Too many browser handoffs. Wait and retry.");String ticket=secret();tickets.put(hash(ticket),clock.instant().plusSeconds(60));return Map.of("ticket",ticket);}
    public synchronized String redeem(String ticket) throws Exception {return redeem(ticket,null);}
    public synchronized String redeem(String ticket,String existingCredential) throws Exception {
        expire();if(ticket==null || tickets.remove(hash(ticket))==null) throw new AccessFailure(403,"BOOTSTRAP_EXPIRED","Browser handoff expired or was already used. Open in browser again.");
        var existing=authenticate(existingCredential,false);
        if(existing!=null && existing.role().equals("OWNER"))return existingCredential;
        String credential=secret();add("Local browser","browser","OWNER",credential);return credential;
    }
    // Package-local clock injection exercises expiry without waiting or altering production TTLs.
    void clock(java.time.Clock clock){this.clock=clock;}
}
