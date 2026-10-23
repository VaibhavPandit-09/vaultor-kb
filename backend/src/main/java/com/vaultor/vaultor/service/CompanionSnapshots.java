package com.vaultor.vaultor.service;

import com.vaultor.vaultor.host.*;
import com.vaultor.vaultor.model.Resource;
import com.vaultor.vaultor.repository.ResourceRepository;
import com.vaultor.vaultor.controller.ApiDtos;
import jakarta.annotation.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;
import tools.jackson.databind.ObjectMapper;
import java.io.*;
import java.lang.ref.SoftReference;
import java.nio.file.*;
import java.security.*;
import java.time.*;
import java.util.*;
import java.util.concurrent.*;

/** Immutable, private, source-bound reading checkpoints. Never an archive or a write queue. */
@Service
public class CompanionSnapshots {
    public static final int MAX_RESOURCES=10000, MAX_RECEIPTS=128, PAGE_SIZE=200;
    public static final long MAX_FILE=64L*1024*1024, MAX_JSON=64L*1024*1024, MAX_BYTES=2L*1024*1024*1024;
    public record Selection(String generation,String scope,List<String> ids,String dependencies,String files) {}
    public record Payload(String key,long bytes,String sha256,String mediaType,String state) {}
    public record Entry(String id,String type,String title,String revision,String mimeType,Long originalSize,
        String updatedAt,String lastOpenedAt,boolean favorite,List<ApiDtos.TagDto> tags,List<ApiDtos.CollectionRef> collections,
        List<String> references,Payload document,Payload binary,String state) {}
    public record Exclusion(String id,String reason) {}
    public record Manifest(int version,String id,String workspaceId,String generation,Selection selection,long createdAt,long expiresAt,
        List<Entry> resources,List<Exclusion> excluded,Payload organization,long bytes) {}
    public record Receipt(String id,String workspaceId,String device,Selection selection,long createdAt,long expiresAt,
        String status,String detail,String manifestSha256,int resources,long bytes) {}
    public record Status(String id,String workspaceId,String generation,long createdAt,long expiresAt,String status,String detail,
        String manifestSha256,int resources,long bytes) {}
    public record Inventory(String snapshot,String generation,String manifestSha256,List<Entry> items,int page,int size,int totalItems,int totalPages,Payload organization) {}
    public record Coverage(String snapshot,List<Exclusion> items,int page,int size,int totalItems,int totalPages) {}
    public record Difference(String id,String change,Entry resource) {}
    public record Delta(String from,String snapshot,List<Difference> items,int page,int size,int totalItems,int totalPages) {}
    public record Estimate(int resources,int notes,int files,long bytes,int omittedFiles,int unavailable,boolean exactBytes) {}
    private final ResourceRepository resources;
    private final DocumentService documents;
    private final FileStorageService files;
    private final WorkspaceIdentityService identity;
    private final WorkspaceGate gate;
    private final TransactionTemplate transaction;
    private final JdbcTemplate jdbc;
    private final ObjectMapper json;
    private final HostAccess access;
    private final WorkspaceCatalog catalog;
    private final ExecutorService worker=Executors.newSingleThreadExecutor();
    private final Map<String,Receipt> receipts=new LinkedHashMap<>();
    private final Set<String> cancelled=ConcurrentHashMap.newKeySet();
    // One reclaimable parsed value per workspace, never a cache of authorization or bytes.
    private record ParsedManifest(String sha256,Manifest value) {}
    private SoftReference<ParsedManifest> parsedManifest=new SoftReference<>(null);
    private static final int MAX_PARSED_MANIFEST_BYTES=4*1024*1024;
    @Value("${app.storage.path}") private String storagePath;
    @Value("${app.companion.ttl-seconds:3600}") private long ttl;
    private Path root;
    private volatile boolean unavailable;

    public CompanionSnapshots(ResourceRepository resources,DocumentService documents,FileStorageService files,WorkspaceIdentityService identity,
        WorkspaceGate gate,TransactionTemplate transaction,JdbcTemplate jdbc,ObjectMapper json,HostAccess access,WorkspaceCatalog catalog) {
        this.resources=resources;this.documents=documents;this.files=files;this.identity=identity;this.gate=gate;this.transaction=transaction;
        this.jdbc=jdbc;this.json=json;this.access=access;this.catalog=catalog;
    }
    @PostConstruct public synchronized void init() {
        try {initialize();}catch(Exception failure){unavailable=true;receipts.clear();org.slf4j.LoggerFactory.getLogger(CompanionSnapshots.class).warn("companion_storage_unavailable code={}",failure.getClass().getSimpleName());}
    }
    private void available(){if(unavailable)throw error(503,"COMPANION_STORAGE_UNAVAILABLE","Companion storage is unavailable. Check host disk/permissions and private checkpoint metadata; originals are retained.");}
    private void initialize() throws Exception {
        root=Path.of(storagePath).toAbsolutePath().normalize().resolveSibling("companions");
        if(Files.isSymbolicLink(root))throw new IOException("Invalid companion storage");
        Files.createDirectories(root);HostFiles.privatePath(root,true);
        try(var dirs=Files.list(root)) {for(Path dir:dirs.toList()) {
            uuid(dir.getFileName().toString());safe(dir);
            Path state=dir.resolve("receipt.json");
            if(!Files.isRegularFile(state,LinkOption.NOFOLLOW_LINKS)) {remove(dir);continue;}
            if(Files.size(state)>16384)throw new IOException("Invalid companion receipt");
            Receipt r=json.readValue(Files.readAllBytes(state),Receipt.class);
            if(!r.id().equals(dir.getFileName().toString()) || !r.workspaceId().equals(identity.current().id()))throw new IOException("Invalid companion identity");
            selection(r.selection());receipts.put(r.id(),r);
            if(Set.of("QUEUED","RUNNING").contains(r.status())){remove(dir.resolve("blobs"));Files.deleteIfExists(dir.resolve("manifest.json"));finish(r,"FAILED","Preparation was interrupted. Start a new checkpoint.",null,0,0);}
        }}
        if(receipts.size()>MAX_RECEIPTS)throw new IOException("Companion receipt limit exceeded");
        cleanup();
    }
    @PreDestroy public void shutdown() {cancelled.addAll(snapshotIds());clearParsedManifest(null);worker.shutdown();try{if(!worker.awaitTermination(15,TimeUnit.SECONDS))worker.shutdownNow();}catch(InterruptedException e){worker.shutdownNow();Thread.currentThread().interrupt();}}
    private synchronized List<String> snapshotIds(){return List.copyOf(receipts.keySet());}
    public static void uuid(String value) {if(value==null || !value.matches("[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}"))throw error(400,"INVALID_SNAPSHOT_ID","Use a canonical UUID");}
    private static AccessFailure error(int code,String kind,String detail){return new AccessFailure(code,kind,detail);}
    private Selection selection(Selection s) {
        if(s==null || !Set.of("workspace","collections","resources").contains(Objects.toString(s.scope(),"")) || s.ids()==null || s.ids().size()>100
            || !Set.of("none","images","linked").contains(Objects.toString(s.dependencies(),"")) || !Set.of("readable","originals").contains(Objects.toString(s.files(),"")))
            throw error(400,"INVALID_COMPANION_SELECTION","Choose scope, up to100 IDs, dependencies and file policy");
        uuid(s.generation());s.ids().forEach(CompanionSnapshots::uuid);
        if(s.scope().equals("workspace")!=s.ids().isEmpty())throw error(400,"INVALID_COMPANION_SELECTION","Workspace scope has no IDs; other scopes require IDs");
        return new Selection(s.generation(),s.scope(),s.ids().stream().distinct().sorted().toList(),s.dependencies(),s.files());
    }
    private void authorize(String device,String workspace) {
        if(device!=null && (!access.deviceActive(device)||!catalog.allowed(workspace,device)))throw error(403,"COMPANION_ACCESS_REVOKED","Workspace access was revoked. Lock the retained companion; unsynced work remains separate.");
    }
    private WorkspaceIdentityService.Identity currentIdentity(){if(!gate.enterRequest())throw error(409,"WORKSPACE_BUSY","Workspace capture or maintenance is in progress. Retry shortly.");try{return identity.current();}finally{gate.leaveRequest();}}
    private void generation(Selection s) {if(!currentIdentity().generation().equals(s.generation()))throw error(409,"COMPANION_GENERATION_CHANGED","Workspace was replaced. Retain old unsynced work separately; create a new companion.");}
    private void safe(Path p) throws IOException {if(!p.normalize().startsWith(root)||Files.isSymbolicLink(p))throw new IOException("Invalid companion storage");}
    private Path dir(String id){uuid(id);return root.resolve(id);}
    private synchronized void persist(Receipt r) throws IOException {HostFiles.write(dir(r.id()).resolve("receipt.json"),json.writeValueAsBytes(r));receipts.put(r.id(),r);}
    private synchronized Receipt finish(Receipt r,String status,String detail,String hash,int count,long bytes) throws IOException {
        Receipt next=new Receipt(r.id(),r.workspaceId(),r.device(),r.selection(),r.createdAt(),r.expiresAt(),status,detail,hash,count,bytes);persist(next);if(!status.equals("READY"))clearParsedManifest(r.id());return next;
    }
    private void remove(Path p) throws IOException {safe(p);if(!Files.exists(p,LinkOption.NOFOLLOW_LINKS))return;try(var walk=Files.walk(p)){for(var f:walk.sorted(Comparator.reverseOrder()).toList()){safe(f);Files.delete(f);}}}
    private synchronized void cleanup() throws IOException {
        long now=System.currentTimeMillis();
        for(Receipt r:List.copyOf(receipts.values())) {
            if(now>=r.expiresAt() && Set.of("READY","FAILED","CANCELLED").contains(r.status())) {
                remove(dir(r.id()).resolve("blobs"));Files.deleteIfExists(dir(r.id()).resolve("manifest.json"));finish(r,"EXPIRED","Checkpoint expired. Keep the last verified local copy and prepare a new checkpoint.",null,0,0);
            }
            if(now-r.createdAt()>7L*86400000 && !Set.of("QUEUED","RUNNING").contains(r.status())){remove(dir(r.id()));receipts.remove(r.id());cancelled.remove(r.id());}
        }
    }
    public Status create(String id,Selection input,String device) throws Exception {
        available();
        uuid(id);Selection s=selection(input);String workspace=currentIdentity().id();authorize(device,workspace);generation(s);cleanup();
        synchronized(this) {
        Receipt old=receipts.get(id);
        if(old!=null){owner(old,device);if(!old.selection().equals(s))throw error(409,"COMPANION_ID_CONFLICT","This checkpoint ID has another selection");return dto(old);}
        if(receipts.size()>=MAX_RECEIPTS || receipts.values().stream().filter(r->Set.of("QUEUED","RUNNING","READY").contains(r.status())).count()>=4)
            throw error(429,"COMPANION_LIMIT","At most four active checkpoints and128 retained receipts. Cancel an unused checkpoint or wait for expiry.");
        Path directory=dir(id);Files.createDirectory(directory);HostFiles.privatePath(directory,true);
        long now=System.currentTimeMillis();Receipt r=new Receipt(id,workspace,device,s,now,now+Math.max(1,Math.min(3600,ttl))*1000,"QUEUED","Waiting to prepare",null,0,0);persist(r);
        worker.submit(()->prepare(r));return dto(r);
        }
    }
    public synchronized boolean idle(){return receipts.values().stream().noneMatch(r->Set.of("QUEUED","RUNNING").contains(r.status()));}
    private synchronized long retainedBytes(){return receipts.values().stream().filter(r->r.status().equals("READY")).mapToLong(Receipt::bytes).sum();}
    private void owner(Receipt r,String device){if(!Objects.equals(r.device(),device))throw error(404,"COMPANION_UNAVAILABLE","Checkpoint is unavailable for this client");authorize(device,r.workspaceId());}
    private synchronized Receipt lookup(String id,String device) throws Exception {
        available();
        uuid(id);cleanup();Receipt r=receipts.get(id);if(r==null)throw error(404,"COMPANION_UNAVAILABLE","Checkpoint is unavailable; prepare a new one");owner(r,device);return r;
    }
    private Status dto(Receipt r){return new Status(r.id(),r.workspaceId(),r.selection().generation(),r.createdAt(),r.expiresAt(),r.status(),r.detail(),r.manifestSha256(),r.resources(),r.bytes());}
    public Status status(String id,String device) throws Exception {Receipt r=lookup(id,device);if(r.status().equals("READY"))generation(r.selection());return dto(r);}
    public synchronized Status cancel(String id,String device) throws Exception {
        Receipt r=lookup(id,device);cancelled.add(id);
        if(Set.of("QUEUED","RUNNING").contains(r.status()))return dto(r);
        if(!r.status().equals("EXPIRED")){remove(dir(id).resolve("blobs"));Files.deleteIfExists(dir(id).resolve("manifest.json"));r=finish(r,"CANCELLED","Checkpoint cancelled; originals and client queues are unchanged",null,0,0);}
        return dto(r);
    }
    private void check(Receipt r,long deadline) {
        if(cancelled.contains(r.id()) || Thread.currentThread().isInterrupted())throw error(409,"COMPANION_CANCELLED","Checkpoint cancelled");
        if(System.currentTimeMillis()>deadline || System.currentTimeMillis()>=r.expiresAt())throw error(410,"COMPANION_EXPIRED","Preparation exceeded its time limit; start a new checkpoint");
        authorize(r.device(),r.workspaceId());
    }
    private void prepare(Receipt start) {
        try {finish(start,"RUNNING","Capturing saved resources",null,0,0);
            gate.exclusive(()->transaction.executeWithoutResult(tx->{try {
                generation(start.selection());check(start,System.currentTimeMillis()+120000);
                Manifest m=capture(start,false);byte[] data=json.writeValueAsBytes(m);if(data.length>MAX_JSON)throw error(413,"COMPANION_LIMIT","Manifest is too large");
                check(start,System.currentTimeMillis()+120000);HostFiles.write(dir(start.id()).resolve("manifest.json"),data);
                synchronized(this){check(start,Long.MAX_VALUE);finish(start,"READY","Checkpoint ready; verify every payload before activation",hash(data),m.resources().size(),m.bytes());}
            }catch(Exception e){throw new CompletionException(e);}}));
        }catch(Exception e){try {remove(dir(start.id()).resolve("blobs"));Files.deleteIfExists(dir(start.id()).resolve("manifest.json"));
            finish(start,cancelled.contains(start.id())?"CANCELLED":"FAILED",e.getCause() instanceof AccessFailure a?a.getMessage():"Preparation failed; originals are unchanged. Start a new checkpoint.",null,0,0);
        }catch(IOException failure){unavailable=true;org.slf4j.LoggerFactory.getLogger(CompanionSnapshots.class).warn("companion_storage_unavailable code={}",failure.getClass().getSimpleName());/* Retain the interrupted receipt for host repair/restart; never disable original editing. */}}
    }
    private List<String> roots(Selection s) {
        if(s.scope().equals("resources"))return s.ids();
        if(s.scope().equals("workspace"))return jdbc.queryForList("SELECT id FROM resources WHERE trashed_at IS NULL ORDER BY id LIMIT 10001",String.class);
        Set<String> ids=new TreeSet<>();
        for(String collection:s.ids()) {
            if(jdbc.queryForObject("SELECT count(*) FROM collections WHERE id=?",Integer.class,collection)==0)throw error(404,"COMPANION_COLLECTION_UNAVAILABLE","Selected collection is unavailable");
            ids.addAll(jdbc.queryForList("SELECT resource_id FROM resource_collections WHERE collection_id=? ORDER BY resource_id LIMIT 10001",String.class,collection));
        }
        return List.copyOf(ids);
    }
    private boolean readable(String mime){return mime!=null && (Set.of("image/png","image/jpeg","image/webp","image/gif","application/pdf").contains(mime)||mime.startsWith("text/"));}
    private Manifest capture(Receipt r,boolean estimate) throws Exception {
        long deadline=System.currentTimeMillis()+120000;Path blobs=dir(r.id()).resolve("blobs");if(!estimate){Files.createDirectories(blobs);HostFiles.privatePath(blobs,true);}
        List<String> initial=roots(r.selection());if(initial.size()>MAX_RESOURCES)throw error(413,"COMPANION_LIMIT","Selection exceeds10000 resources");
        var queue=new ArrayDeque<>(initial);var seeds=new HashSet<>(initial);var scheduled=new HashSet<>(initial);var seen=new HashSet<String>();var entries=new ArrayList<Entry>();var exclusions=new TreeMap<String,String>();long[] total={0,0};long metadataBytes=0;
        while(!queue.isEmpty()) {
            String id=queue.removeFirst();if(!seen.add(id))continue;uuid(id);if(seen.size()>MAX_RESOURCES)throw error(413,"COMPANION_LIMIT","Selection exceeds10000 resources; choose a smaller scope");check(r,deadline);
            Long noteBytes=jdbc.queryForObject("SELECT COALESCE(MAX(CASE WHEN type='note' THEN length(CAST(content AS BLOB)) ELSE 0 END),0) FROM resources WHERE id=?",Long.class,id);
            if(noteBytes!=null&&noteBytes>1024*1024)throw error(413,"COMPANION_LIMIT","A note exceeds the1MiB reading limit; choose a smaller scope");
            Resource resource=resources.findById(id).orElse(null);
            if(resource==null || resource.getTrashedAt()!=null){entries.add(new Entry(id,resource==null?null:resource.getType(),resource==null?id:resource.getTitle(),null,null,null,null,null,false,List.of(),List.of(),List.of(),null,null,resource==null?"unavailable":"trashed"));continue;}
            if(r.selection().dependencies().equals("images")&&!seeds.contains(id)&&!(resource.getType().equals("file")&&resource.getMimeType()!=null&&resource.getMimeType().startsWith("image/"))){entries.add(new Entry(id,resource.getType(),resource.getTitle(),resource.getRevision(),resource.getMimeType(),resource.getSize(),null,null,false,List.of(),List.of(),List.of(),null,null,"unsupported-reference"));continue;}
            var dto=ApiDtos.ResourceDto.of(resource,documents);var refs=new TreeSet<String>();
            if("note".equals(resource.getType())) {documents.walk(dto.content(),n->{for(String field:List.of("resourceId","sourceResourceId")){String target=n.path("attrs").path(field).asText("");if(!target.isEmpty()){uuid(target);refs.add(target);if(r.selection().dependencies().equals("linked")||r.selection().dependencies().equals("images")&&field.equals("resourceId")&&n.path("type").asText().equals("image")){if(scheduled.add(target)){if(scheduled.size()>MAX_RESOURCES)throw error(413,"COMPANION_LIMIT","Dependencies exceed10000 resources");queue.addLast(target);}}}}});}
            Payload document=null,binary=null;
            if("note".equals(resource.getType()))document=payload(id+".json",json.writeValueAsBytes(dto.content()),"application/json",blobs,total,estimate);
            else if("file".equals(resource.getType())) {
                if(r.selection().files().equals("readable")&&!readable(resource.getMimeType()))binary=new Payload(null,0,null,resource.getMimeType(),"policy-omitted");
                else {Path original=files.getFile(resource.getFilePath());
                    if(!Files.isRegularFile(original,LinkOption.NOFOLLOW_LINKS))binary=new Payload(null,0,null,resource.getMimeType(),"missing");
                    else if(Files.size(original)>MAX_FILE)binary=new Payload(null,Files.size(original),null,resource.getMimeType(),"too-large");
                    else binary=copy(r,original,id+".bin",resource.getMimeType(),blobs,total,estimate,deadline);
                }
            }
            Entry entry=new Entry(id,dto.type(),dto.title(),dto.revision(),dto.mimeType(),dto.size(),Objects.toString(dto.updatedAt(),null),Objects.toString(dto.lastOpenedAt(),null),dto.favorite(),dto.tags().stream().sorted(Comparator.comparing(ApiDtos.TagDto::id)).toList(),dto.collections(),List.copyOf(refs),document,binary,Set.of("note","file").contains(dto.type())?"available":"unsupported");
            metadataBytes+=json.writeValueAsBytes(entry).length;if(metadataBytes>MAX_JSON)throw error(413,"COMPANION_LIMIT","Inventory metadata exceeds64MiB");entries.add(entry);
        }
        entries.sort(Comparator.comparing(Entry::id));Set<String> included=new HashSet<>();entries.forEach(e->included.add(e.id()));
        for(Entry e:entries)for(String target:e.references())if(!included.contains(target))exclusions.put(target,"not-selected");
        if(exclusions.size()>20000)throw error(413,"COMPANION_LIMIT","Too many omitted references");
        var collectionIds=new TreeSet<String>();entries.forEach(e->e.collections().forEach(c->collectionIds.add(c.id())));if(r.selection().scope().equals("collections"))collectionIds.addAll(r.selection().ids());
        if(r.selection().scope().equals("workspace"))collectionIds.addAll(jdbc.queryForList("SELECT id FROM collections ORDER BY id LIMIT 10001",String.class));
        if(collectionIds.size()>10000)throw error(413,"COMPANION_LIMIT","Too many collections");
        var memberships=new HashMap<String,List<String>>();entries.forEach(e->e.collections().forEach(c->memberships.computeIfAbsent(c.id(),key->new ArrayList<>()).add(e.id())));
        var collections=new ArrayList<Map<String,Object>>();for(String id:collectionIds){check(r,deadline);var row=jdbc.queryForMap("SELECT id,name,favorite,parent_id FROM collections WHERE id=?",id);if(row.get("parent_id")!=null)throw error(409,"COMPANION_HIERARCHY_UNSUPPORTED","This companion checkpoint format cannot preserve nested collections. Use connected reading or a host-generated export; existing downloads remain available.");Object pin=row.get("favorite");collections.add(Map.of("id",id,"name",row.get("name"),"favorite",Boolean.TRUE.equals(pin)||pin instanceof Number n&&n.intValue()!=0,"resources",memberships.getOrDefault(id,List.of())));}
        List<?> tags=entries.stream().flatMap(e->e.tags().stream()).distinct().sorted(Comparator.comparing(ApiDtos.TagDto::id)).toList();
        if(r.selection().scope().equals("workspace")){tags=jdbc.queryForList("SELECT id,name,color FROM tags ORDER BY id LIMIT 10001");if(tags.size()>10000)throw error(413,"COMPANION_LIMIT","Too many tags");}
        var org=payload("organization.json",json.writeValueAsBytes(Map.of("collections",collections,"tags",tags)),"application/json",blobs,total,estimate);
        return new Manifest(1,r.id(),r.workspaceId(),r.selection().generation(),r.selection(),r.createdAt(),r.expiresAt(),List.copyOf(entries),exclusions.entrySet().stream().map(e->new Exclusion(e.getKey(),e.getValue())).toList(),org,total[0]);
    }
    private void budget(long bytes,long[] total,boolean document){total[0]=Math.addExact(total[0],bytes);if(document)total[1]+=bytes;if(total[0]+retainedBytes()>MAX_BYTES||total[1]>MAX_JSON)throw error(413,"COMPANION_LIMIT","Retained checkpoints exceed2GiB bytes or checkpoint JSON exceeds64MiB");}
    private Payload payload(String key,byte[] bytes,String mime,Path blobs,long[] total,boolean estimate) throws Exception {
        if(bytes.length>1024*1024&&!key.equals("organization.json"))throw error(413,"COMPANION_LIMIT","A note exceeds the1MiB reading limit");budget(bytes.length,total,true);if(!estimate)HostFiles.write(blobs.resolve(key),bytes);return new Payload(key,bytes.length,estimate?null:hash(bytes),mime,"available");
    }
    private Payload copy(Receipt r,Path source,String key,String mime,Path blobs,long[] total,boolean estimate,long deadline) throws Exception {
        long size=Files.size(source);budget(size,total,false);if(estimate)return new Payload(key,size,null,mime,"available");
        MessageDigest digest=MessageDigest.getInstance("SHA-256");long count=0;Path target=blobs.resolve(key);Files.createFile(target);HostFiles.privatePath(target,false);
        try(var input=Files.newInputStream(source,LinkOption.NOFOLLOW_LINKS);var output=Files.newOutputStream(target)){byte[] block=new byte[262144];int n;while((n=input.read(block))!=-1){check(r,deadline);count+=n;if(count>size)throw new IOException("Original changed during capture");digest.update(block,0,n);output.write(block,0,n);}}
        if(count!=size)throw new IOException("Original changed during capture");return new Payload(key,count,HexFormat.of().formatHex(digest.digest()),mime,"available");
    }
    public Estimate estimate(Selection input,String device) throws Exception {
        available();
        Selection s=selection(input);var current=currentIdentity();authorize(device,current.id());generation(s);
        Receipt r=new Receipt(UUID.randomUUID().toString(),current.id(),device,s,System.currentTimeMillis(),System.currentTimeMillis()+120000,"RUNNING","Estimate",null,0,0);
        Manifest[] result={null};gate.exclusive(()->transaction.executeWithoutResult(tx->{try{generation(s);result[0]=capture(r,true);}catch(RuntimeException e){throw e;}catch(Exception e){throw new CompletionException(e);}}));
        Manifest m=result[0];return new Estimate(m.resources().size(),(int)m.resources().stream().filter(e->"note".equals(e.type())).count(),(int)m.resources().stream().filter(e->"file".equals(e.type())).count(),m.bytes(),(int)m.resources().stream().filter(e->e.binary()!=null&&!e.binary().state().equals("available")).count(),(int)m.resources().stream().filter(e->!e.state().equals("available")).count(),false);
    }
    public Manifest manifest(String id,String device,String match) throws Exception {
        Receipt r=lookup(id,device);if(cancelled.contains(id))throw error(409,"COMPANION_CANCELLED","Checkpoint cancelled");if(!r.status().equals("READY"))throw error(r.status().equals("EXPIRED")?410:409,"COMPANION_"+r.status(),r.detail());generation(r.selection());
        if(match==null)throw error(428,"COMPANION_VALIDATOR_REQUIRED","Pin the manifest SHA-256 using If-Match");
        if(!match.equals('"'+r.manifestSha256()+'"'))throw error(412,"COMPANION_VALIDATOR_MISMATCH","Checkpoint validator differs; do not mix datasets");
        Path path=dir(id).resolve("manifest.json");safe(path);if(Files.size(path)>MAX_JSON)throw error(409,"COMPANION_DAMAGED","Manifest exceeds its limit");byte[] data=Files.readAllBytes(path);if(data.length>MAX_JSON || !hash(data).equals(r.manifestSha256()))throw error(409,"COMPANION_DAMAGED","Checkpoint is damaged; prepare a new one");
        return parsedManifest(data,r.manifestSha256());
    }
    private synchronized void clearParsedManifest(String id) {var cached=parsedManifest.get();if(id==null || cached!=null && cached.value().id().equals(id))parsedManifest.clear();}
    private synchronized Manifest parsedManifest(byte[] verified,String sha256) throws Exception {
        var cached=parsedManifest.get();if(cached!=null && cached.sha256().equals(sha256))return cached.value();
        parsedManifest.clear();
        Manifest m=json.readValue(verified,Manifest.class);
        if(verified.length>MAX_PARSED_MANIFEST_BYTES)return m;
        // Callers must not be able to mutate a value reused by another request.
        var entries=m.resources().stream().map(e->new Entry(e.id(),e.type(),e.title(),e.revision(),e.mimeType(),e.originalSize(),e.updatedAt(),e.lastOpenedAt(),e.favorite(),List.copyOf(e.tags()),List.copyOf(e.collections()),List.copyOf(e.references()),e.document(),e.binary(),e.state())).toList();
        var s=m.selection();var selection=new Selection(s.generation(),s.scope(),List.copyOf(s.ids()),s.dependencies(),s.files());
        var value=new Manifest(m.version(),m.id(),m.workspaceId(),m.generation(),selection,m.createdAt(),m.expiresAt(),entries,List.copyOf(m.excluded()),m.organization(),m.bytes());
        parsedManifest=new SoftReference<>(new ParsedManifest(sha256,value));return value;
    }
    private static void page(int page,int size){if(page<0||page>100000||size<1||size>PAGE_SIZE)throw error(400,"INVALID_COMPANION_PAGE","Use a nonnegative page and size1–200");}
    private static <T> List<T> slice(List<T> rows,int page,int size){return rows.subList(Math.min(rows.size(),page*size),Math.min(rows.size(),(page+1)*size));}
    public Inventory inventory(String id,String device,String match,int page,int size) throws Exception {page(page,size);Manifest m=manifest(id,device,match);return new Inventory(id,m.generation(),match.substring(1,match.length()-1),slice(m.resources(),page,size),page,size,m.resources().size(),(m.resources().size()+size-1)/size,m.organization());}
    public Coverage coverage(String id,String device,String match,int page,int size) throws Exception {page(page,size);Manifest m=manifest(id,device,match);return new Coverage(id,slice(m.excluded(),page,size),page,size,m.excluded().size(),(m.excluded().size()+size-1)/size);}
    public Delta delta(String id,String from,String device,String match,String oldMatch,int page,int size) throws Exception {
        page(page,size);Manifest next=manifest(id,device,match),old=manifest(from,device,oldMatch);
        if(!next.selection().equals(old.selection()) || !next.workspaceId().equals(old.workspaceId()))throw error(409,"COMPANION_SELECTION_CHANGED","Compare only checkpoints with identical source and selection; otherwise reconcile the full manifest");
        var a=new TreeMap<String,Entry>();var b=new TreeMap<String,Entry>();old.resources().forEach(e->a.put(e.id(),e));next.resources().forEach(e->b.put(e.id(),e));var changes=new ArrayList<Difference>();
        for(var e:b.entrySet())if(!e.getValue().equals(a.get(e.getKey())))changes.add(new Difference(e.getKey(),a.containsKey(e.getKey())?"changed":"added",e.getValue()));
        for(String key:a.keySet())if(!b.containsKey(key))changes.add(new Difference(key,"not-in-checkpoint",null));changes.sort(Comparator.comparing(Difference::id));
        return new Delta(from,id,slice(changes,page,size),page,size,changes.size(),(changes.size()+size-1)/size);
    }
    public void stream(String id,String key,String device,String match,String range,jakarta.servlet.http.HttpServletResponse response) throws Exception {
        if(!gate.enterRequest())throw error(409,"WORKSPACE_BUSY","Workspace maintenance is in progress. Retry the same range.");
        try {streamAdmitted(id,key,device,match,range,response);}finally{gate.leaveRequest();}
    }
    private void streamAdmitted(String id,String key,String device,String match,String range,jakarta.servlet.http.HttpServletResponse response) throws Exception {
        Manifest m=manifest(id,device,match);if(!key.matches("(?:[a-f0-9-]{36}\\.(?:json|bin)|(?:organization|manifest)\\.json)"))throw error(400,"INVALID_COMPANION_PAYLOAD","Use a manifest payload key, never a path");
        var payloads=new ArrayList<Payload>();payloads.add(m.organization());payloads.add(new Payload("manifest.json",Files.size(dir(id).resolve("manifest.json")),match.substring(1,match.length()-1),"application/json","available"));for(Entry e:m.resources()){if(e.document()!=null)payloads.add(e.document());if(e.binary()!=null)payloads.add(e.binary());}
        Payload p=payloads.stream().filter(e->key.equals(e.key())&&e.state().equals("available")).findFirst().orElseThrow(()->error(404,"COMPANION_PAYLOAD_UNAVAILABLE","Payload is omitted or unavailable"));
        Path blobs=dir(id).resolve("blobs"),path=key.equals("manifest.json")?dir(id).resolve(key):blobs.resolve(key);safe(dir(id));safe(blobs);safe(path);if(!Files.isRegularFile(path,LinkOption.NOFOLLOW_LINKS)||Files.size(path)!=p.bytes())throw error(409,"COMPANION_DAMAGED","Checkpoint bytes unavailable; prepare a new one");
        long start=0,end=p.bytes()-1;
        if(range!=null){if(!range.matches("bytes=[0-9]+-[0-9]*"))throw error(416,"INVALID_COMPANION_RANGE","Use one byte range");try{String[] parts=range.substring(6).split("-",-1);start=Long.parseLong(parts[0]);if(!parts[1].isEmpty())end=Math.min(end,Long.parseLong(parts[1]));}catch(NumberFormatException e){throw error(416,"INVALID_COMPANION_RANGE","Byte range is invalid");}if(start>end||start>=p.bytes())throw error(416,"INVALID_COMPANION_RANGE","Range exceeds payload");}
        response.setStatus(range==null?200:206);response.setContentType("application/octet-stream");response.setHeader("Accept-Ranges","bytes");response.setHeader("ETag",'"'+p.sha256()+'"');response.setHeader("X-Vaultor-SHA256",p.sha256());response.setHeader("Content-Disposition","attachment; filename=\""+key+"\"");response.setContentLengthLong(Math.max(0,end-start+1));
        if(range!=null)response.setHeader("Content-Range","bytes "+start+"-"+end+"/"+p.bytes());
        try(var input=Files.newInputStream(path,LinkOption.NOFOLLOW_LINKS)){input.skipNBytes(start);byte[] buffer=new byte[262144];long remaining=end-start+1;while(remaining>0){Receipt r=lookup(id,device);if(!r.status().equals("READY"))throw new IOException("Checkpoint is no longer available");check(r,Long.MAX_VALUE);generation(r.selection());int n=input.read(buffer,0,(int)Math.min(buffer.length,remaining));if(n<0)throw new EOFException();response.getOutputStream().write(buffer,0,n);remaining-=n;}response.getOutputStream().flush();}
    }
    private static String hash(byte[] data) throws Exception {return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(data));}
}
