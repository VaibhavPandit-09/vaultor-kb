package com.vaultor.vaultor.service;

import com.vaultor.vaultor.model.*;
import com.vaultor.vaultor.repository.*;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.http.HttpStatus;
import org.slf4j.MDC;
import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.JsonNode;
import java.nio.file.*;
import java.io.*;
import java.util.*;
import java.util.concurrent.*;
import java.util.zip.*;
import java.security.MessageDigest;
import java.time.*;

@Service @RequiredArgsConstructor @Slf4j
public class TransferService {
    private final TransferOperationRepository operations;
    private final OrganizationService organization;
    private final ResourceRepository resources;
    private final TagRepository tags;
    private final RelationshipRepository relationships;
    private final RelationshipService linkService;
    private final SettingsService settings;
    private final WorkspaceIdentityService workspaceIdentity;
    private final ChangeFeed changeFeed;
    private final FileStorageService files;
    private final DocumentService documents;
    private final ObjectMapper mapper;
    private final TransactionTemplate transaction;
    private final WorkspaceGate gate;
    private final BuildInformation build;
    private final ExporterRegistry exporters;
    private final NoteExportGraph noteGraph;
    private final LifecycleRequestRepository lifecycleRequests;
    private final ReviewService reviews;
    private final ZipWorkspaceExporter workspaceZip;
    private final Object companionClaims=new Object();
    @Value("${app.storage.path}") private String storagePath;
    @Value("${app.transfer.max-archive-bytes}") private long maxArchive;
    @Value("${app.transfer.max-expanded-bytes}") private long maxExpanded;
    @Value("${app.transfer.max-entries}") private int maxEntries;
    private final ExecutorService worker=Executors.newSingleThreadExecutor();
    private final Set<String> cancellationRequests = ConcurrentHashMap.newKeySet();
    // Immutable last-committed snapshots only for live work. Never retain historical operations.
    private final Map<String,Operation> activeStatus = new ConcurrentHashMap<>();
    private Path root;
    public record TagData(String id,String name,String color) {}
    public record ImportOriginal(String filename,String mime,String sha256,long bytes,String binary) {}
    public record ResourceData(String id,String type,String title,JsonNode content,String mimeType,Long size,
        LocalDateTime createdAt,LocalDateTime updatedAt,LocalDateTime lastOpenedAt,List<String> tags,String binary,LocalDateTime trashedAt,String trashOrganization,ImportOriginal importOriginal) {
        public ResourceData(String id,String type,String title,JsonNode content,String mimeType,Long size,LocalDateTime createdAt,LocalDateTime updatedAt,LocalDateTime lastOpenedAt,List<String> tags,String binary,LocalDateTime trashedAt,String trashOrganization) {this(id,type,title,content,mimeType,size,createdAt,updatedAt,lastOpenedAt,tags,binary,trashedAt,trashOrganization,null);}
        public ResourceData(String id,String type,String title,JsonNode content,String mimeType,Long size,LocalDateTime createdAt,LocalDateTime updatedAt,LocalDateTime lastOpenedAt,List<String> tags,String binary) {this(id,type,title,content,mimeType,size,createdAt,updatedAt,lastOpenedAt,tags,binary,null,null);}
    }
    public record Workspace(List<ResourceData> resources,List<TagData> tags,SettingsService.WorkspaceSettings settings,OrganizationService.OrganizationData organization,List<ReviewService.Portable> reviews) {
        public Workspace(List<ResourceData> resources,List<TagData> tags,SettingsService.WorkspaceSettings settings,OrganizationService.OrganizationData organization) {this(resources,tags,settings,organization,List.of());}
        public Workspace(List<ResourceData> resources,List<TagData> tags,SettingsService.WorkspaceSettings settings) {this(resources,tags,settings,new OrganizationService.OrganizationData(List.of(),List.of()));}
    }
    public record Manifest(int version,String createdAt,int resources,int tags,Map<String,String> checksums) {}
    public record Operation(String id,String kind,String status,String phase,int progress,String mode,String detail,String requestId,Map<String,Integer> counts,String filename,String mediaType,List<String> warnings) {}
    public record Preview(Operation operation,int resources,int files,int notes,int tags,int reviews,List<String> warnings,boolean partial) {}
    @PostConstruct public void init() throws Exception {
        root=Path.of(storagePath).toAbsolutePath().normalize().resolveSibling("operations"); Files.createDirectories(root);
        for(var op:operations.findAll()) {
            if("CLEANUP".equals(op.getStatus())) { cleanup(op); }
            else if(List.of("QUEUED","RUNNING").contains(op.getStatus())) {
                discardStagedFiles(op);
                fail(op,new IllegalStateException("Operation interrupted by restart. Create a new export, or retry import from the source archive."));
            }
        }
    }
    @PreDestroy public void shutdown() { worker.shutdown();try{if(!worker.awaitTermination(15,TimeUnit.SECONDS))worker.shutdownNow();}catch(InterruptedException e){worker.shutdownNow();Thread.currentThread().interrupt();} }
    private Path directory(String id) { return root.resolve(UUID.fromString(id).toString()); }
    public Operation dto(TransferOperation op) { return new Operation(op.getId(),op.getKind(),op.getStatus(),op.getPhase(),op.getProgress(),op.getMode(),op.getDetail(),op.getRequestId(),Map.of("resources",Optional.ofNullable(op.getResourceCount()).orElse(0),"files",Optional.ofNullable(op.getFileCount()).orElse(0),"tags",Optional.ofNullable(op.getTagCount()).orElse(0)),op.getOutputFilename(),op.getOutputMediaType(),readWarnings(op)); }
    private List<String> readWarnings(TransferOperation op) { List<String> result=new ArrayList<>();for(JsonNode n:mapper.readTree(op.getWarnings()==null?"[]":op.getWarnings()))result.add(n.asText());return result; }
    public Operation get(String id) {
        UUID.fromString(id);
        var active=activeStatus.get(id);if(active!=null)return active;
        if(!gate.enterRequest())throw new ResponseStatusException(HttpStatus.CONFLICT,"Workspace maintenance is in progress. Retry shortly.");
        try{return dto(operations.findById(id).orElseThrow());}finally{gate.leaveRequest();}
    }
    public long activity() {
        if(!gate.enterRequest())return activeStatus.values().stream().filter(op->List.of("QUEUED","RUNNING","CLEANUP").contains(op.status())).count();
        try{return operations.countByStatusIn(List.of("QUEUED","RUNNING","CLEANUP"));}finally{gate.leaveRequest();}
    }
    private void remember(TransferOperation op) {
        if(List.of("QUEUED","RUNNING","CLEANUP").contains(op.getStatus()))activeStatus.put(op.getId(),dto(op));
        else activeStatus.remove(op.getId());
    }
    private TransferOperation create(String kind) { return create(kind,null); }
    private TransferOperation create(String kind,String requestedId) {
        var op=new TransferOperation();if(requestedId!=null)op.setId(requestedId); op.setKind(kind); op.setRequestId(MDC.get("requestId"));op=operations.save(op);remember(op);return op;
    }
    private void phase(TransferOperation op,String status,String phase,int progress) {
        op.setStatus(status);op.setPhase(phase);op.setProgress(progress);saveOperationStatus(op);
        changeFeed.committed("operation",List.of(op.getId()),op.getRequestId());
        log.info("transfer operationId={} kind={} phase={} progress={} requestId={}",op.getId(),op.getKind(),phase,progress,op.getRequestId());
    }
    // Repository save has its own transaction: retry a fresh transaction on transient SQLite contention.
    private void saveOperationStatus(TransferOperation op) {
        for(int attempt=0;;attempt++) {
            try { operations.save(op);remember(op);return; }
            catch(org.springframework.dao.DataAccessException e) {
                if(attempt>=5 || !String.valueOf(e.getMostSpecificCause().getMessage()).contains("SQLITE_BUSY")) throw e;
                try { Thread.sleep(50L*(attempt+1)); } catch(InterruptedException interrupted) {Thread.currentThread().interrupt();throw e;}
            }
        }
    }
    private void enqueue(TransferOperation op,Runnable work,boolean note){
        var admitted=changeFeed.captureAuthorization();
        worker.submit(()->{Runnable guarded=()->{admitted.run();work.run();};if(note)runNote(op,guarded);else run(op,guarded);});
    }
    private void fail(TransferOperation op,Exception e) {
        op.setDetail(e.getMessage()==null?"Transfer failed":e.getMessage().substring(0,Math.min(1000,e.getMessage().length())));
        phase(op,"FAILED","failed",op.getProgress()); log.error("transfer failed operationId={}",op.getId(),e);
    }
    public Operation export(String scope,String format) {return export(scope,format,null,null);}
    private Operation export(String scope,String format,String requestedId,String generation) {
        if (!"workspace".equals(scope) || !"zip".equals(format)) throw new IllegalArgumentException("Note exports require noteId");
        exporters.require(scope,format); var op=create("export",requestedId);
        op.setOutputFilename("workspace.zip");op.setOutputMediaType("application/zip");operations.save(op);
        enqueue(op,()->gate.exclusive(()->{if(generation!=null)exportGeneration(generation);exportArchive(op);}),false); return dto(op);
    }
    public record ExportRequest(String generation,String scope,List<String> ids,int depth,String format) {}
    public record ExportReceipt(int version,String id,String generation,ExportRequest request,Operation operation,long bytes,String sha256,JsonNode coverage) {}
    private void exportGeneration(String expected){if(!workspaceIdentity.current().generation().equals(expected))throw new com.vaultor.vaultor.host.AccessFailure(409,"EXPORT_GENERATION_CHANGED","Original workspace was replaced; this export cannot be retargeted.");}
    private boolean isPartial(TransferOperation op)throws IOException {return Files.exists(directory(op.getId()).resolve("partial.json"));}
    public ExportReceipt prepareCompanionExport(String id,ExportRequest input,String device)throws Exception {synchronized(companionClaims){
        CompanionImports.uuid(id);if(input==null||input.scope()==null||input.format()==null)throw new IllegalArgumentException("Export intent required");CompanionImports.uuid(input.generation());exportGeneration(input.generation());
        if(input.ids()==null||input.ids().size()>100||input.depth()<0||input.depth()>3)throw new IllegalArgumentException("Choose at most100 seeds and depth0–3");input.ids().forEach(CompanionImports::uuid);
        if(!Set.of("workspace","resources","collection","note").contains(input.scope()))throw new IllegalArgumentException("Unsupported export scope");
        if(input.scope().equals("workspace")&&(!input.ids().isEmpty()||!input.format().equals("zip")))throw new IllegalArgumentException("Full workspace export requires ZIP");
        if(!input.scope().equals("workspace")&&input.ids().isEmpty())throw new IllegalArgumentException("Choose export content");
        if(Set.of("resources","collection").contains(input.scope())&&!input.format().equals("partial"))throw new IllegalArgumentException("Selection requires portable partial format");
        if(input.scope().equals("note")&&(input.ids().size()!=1||!Set.of("md","md-assets","pdf","docx").contains(input.format())))throw new IllegalArgumentException("Unsupported connected note format");
        Path dir=directory(id);Files.createDirectories(dir);String confirmed=mapper.writeValueAsString(Map.of("device",device,"request",input));Path claim=dir.resolve("export-request.json");
        if(Files.exists(claim)){if(!Files.readString(claim).equals(confirmed))throw new com.vaultor.vaultor.host.AccessFailure(409,"EXPORT_ID_REUSED","Export identity already has another source or intent");}else {if(operations.existsById(id))throw new IllegalArgumentException("Operation identity already exists");try(var entries=Files.list(root)){if(entries.filter(v->Files.exists(v.resolve("export-request.json"))).count()>=256)throw new IllegalArgumentException("256 retained export requests reached; host maintenance required");}com.vaultor.vaultor.host.HostFiles.write(claim,confirmed.getBytes(java.nio.charset.StandardCharsets.UTF_8));}
        if(!operations.existsById(id)){
            if(input.scope().equals("workspace"))export("workspace","zip",id,input.generation());
            else if(input.scope().equals("note"))exportNote(input.ids().getFirst(),input.format(),false,false,null,id,input.generation());
            else {var op=create("export",id);op.setOutputFilename("vaultor-partial.zip");op.setOutputMediaType("application/zip");operations.save(op);enqueue(op,()->gate.exclusive(()->{exportGeneration(input.generation());writePartial(op,input);}),false);}
        }
        return companionExport(id,input.generation(),device);
    }}
    public ExportReceipt companionExport(String id,String generation,String device)throws Exception {
        CompanionImports.uuid(id);exportGeneration(generation);if(!Files.isRegularFile(directory(id).resolve("export-request.json")))throw new com.vaultor.vaultor.host.AccessFailure(404,"EXPORT_UNAVAILABLE","Export unavailable");var claim=mapper.readTree(Files.readString(directory(id).resolve("export-request.json")));if(!claim.path("device").asText().equals(device))throw new com.vaultor.vaultor.host.AccessFailure(404,"EXPORT_UNAVAILABLE","Export unavailable");var request=mapper.treeToValue(claim.get("request"),ExportRequest.class);if(!request.generation().equals(generation))throw new IllegalArgumentException("Export source differs");var op=get(id);long bytes=0;String digest=null;if(op.status().equals("SUCCEEDED")){Path f=download(id);bytes=Files.size(f);try(var in=Files.newInputStream(f)){digest=hash(in);}}return new ExportReceipt(1,id,generation,request,op,bytes,digest,op.status().equals("SUCCEEDED")&&isPartial(operations.findById(id).orElseThrow())?mapper.readTree(Files.readString(directory(id).resolve("partial.json"))):null);
    }
    public void streamCompanionExport(String id,String generation,String device,jakarta.servlet.http.HttpServletResponse response)throws Exception {
        var receipt=companionExport(id,generation,device);if(!receipt.operation().status().equals("SUCCEEDED"))throw new IllegalArgumentException("Export not ready");var authorization=changeFeed.captureAuthorization();if(!gate.enterRequest())throw new org.springframework.web.server.ResponseStatusException(org.springframework.http.HttpStatus.CONFLICT,"Workspace busy");try{exportGeneration(generation);authorization.run();response.setContentType(receipt.operation().mediaType());response.setContentLengthLong(receipt.bytes());response.setHeader("X-Vaultor-SHA256",receipt.sha256());response.setHeader("Cache-Control","no-store");try(var in=Files.newInputStream(download(id))){var out=response.getOutputStream();byte[] buffer=new byte[65536];int n;while((n=in.read(buffer))!=-1){authorization.run();exportGeneration(generation);out.write(buffer,0,n);}}}finally{gate.leaveRequest();}
    }
    private void writePartial(TransferOperation op,ExportRequest request){try {
        var selected=new LinkedHashSet<String>();if(request.scope().equals("collection")){var collections=organization.snapshot().collections();for(String id:request.ids()){var c=collections.stream().filter(v->v.id().equals(id)).findFirst().orElseThrow();selected.addAll(c.resources());}}else selected.addAll(request.ids());
        var omissions=new ArrayList<Map<String,String>>();var included=new LinkedHashMap<String,Resource>();var frontier=new LinkedHashSet<>(selected);long total=0,jsonBytes=0;
        for(int depth=0;depth<=request.depth();depth++){var next=new LinkedHashSet<String>();for(String id:frontier){if(included.containsKey(id))continue;var r=transaction.execute(status->{var resource=resources.findById(id).filter(v->v.getTrashedAt()==null&&!Boolean.TRUE.equals(v.getPurgePending())).orElse(null);if(resource!=null)resource.getTags().size();return resource;});if(r==null){omissions.add(Map.of("id",id,"reason","missing or trashed"));continue;}if(included.size()>=500)throw new IllegalArgumentException("Partial export exceeds500 resources");long bytes="file".equals(r.getType())?r.getSize():r.getContent().getBytes(java.nio.charset.StandardCharsets.UTF_8).length;if(bytes>("file".equals(r.getType())?64L*1048576:1048576))throw new IllegalArgumentException("Selected resource exceeds partial export bounds");if("note".equals(r.getType()))jsonBytes+=bytes;if(jsonBytes>16L*1048576)throw new IllegalArgumentException("Structured selection exceeds16MiB; select fewer notes");total+=bytes+(r.getImportOriginalSize()==null?0:r.getImportOriginalSize());if(total>256L*1048576)throw new IllegalArgumentException("Partial export exceeds256 MiB");included.put(id,r);if(r.getContent()!=null)for(String target:documents.references(documents.parse(r.getContent()))){if(depth<request.depth())next.add(target);else if(!included.containsKey(target))omissions.add(Map.of("id",target,"reason","beyond selected depth"));if(next.size()>500||omissions.size()>20000)throw new IllegalArgumentException("Partial graph exceeds resource/coverage bounds");}}frontier=next;}
        var binaries=new LinkedHashMap<String,Path>();var tagIds=new HashSet<String>();var data=new ArrayList<ResourceData>();for(var r:included.values()){var tagsForResource=r.getTags().stream().map(Tag::getId).toList();tagIds.addAll(tagsForResource);ImportOriginal original=null;if(r.getImportOriginalPath()!=null){original=new ImportOriginal(r.getImportOriginalName(),r.getImportOriginalMime(),r.getImportOriginalHash(),r.getImportOriginalSize(),"originals/"+r.getId());binaries.put(original.binary(),files.getFile(r.getImportOriginalPath()));}if(r.getFilePath()!=null)binaries.put("files/"+r.getId(),files.getFile(r.getFilePath()));data.add(new ResourceData(r.getId(),r.getType(),r.getTitle(),documents.parse(r.getContent()),r.getMimeType(),r.getSize(),r.getCreatedAt(),r.getUpdatedAt(),r.getLastOpenedAt(),tagsForResource,r.getFilePath()==null?null:"files/"+r.getId(),null,null,original));}
        var ids=included.keySet();var org=organization.snapshot();var retained=new HashSet<String>();var allCollections=new HashMap<String,OrganizationService.CollectionData>();for(var c:org.collections())allCollections.put(c.id(),c);
        for(var c:org.collections())if(c.resources().stream().anyMatch(ids::contains)){String id=c.id();while(id!=null&&retained.add(id))id=allCollections.get(id).parentId();}
        var subset=new OrganizationService.OrganizationData(org.collections().stream().filter(c->retained.contains(c.id())).map(c->new OrganizationService.CollectionData(c.id(),c.name(),c.favorite(),c.resources().stream().filter(ids::contains).toList(),c.parentId())).toList(),org.favorites().stream().filter(ids::contains).toList());
        var workspace=new Workspace(data,tags.findAll().stream().filter(t->tagIds.contains(t.getId())).map(t->new TagData(t.getId(),t.getName(),t.getColor())).toList(),SettingsService.defaultWorkspaceSettings(),subset,reviews.snapshot(ids));
        omissions.removeIf(o->ids.contains(o.get("id")));var coverage=Map.of("version",1,"kind","vaultor-partial","capturedAt",java.time.Instant.now().toString(),"depth",request.depth(),"inventory",data.stream().map(r->Map.of("id",r.id(),"title",r.title(),"type",r.type())).toList(),"omissions",omissions,"reviewCoverage","acknowledged host Reviews for included targets","provenanceCoverage","retained originals included");workspaceZip.writePartial(workspace,binaries,directory(op.getId()).resolve("workspace.zip"),coverage);com.vaultor.vaultor.host.HostFiles.write(directory(op.getId()).resolve("partial.json"),mapper.writeValueAsBytes(coverage));op.setResourceCount(data.size());op.setFileCount((int)data.stream().filter(r->r.type().equals("file")).count());phase(op,"SUCCEEDED","complete",100);
    }catch(Exception e){throw new IllegalStateException("Partial export failed: "+e.getMessage(),e);}}
    public NoteExportGraph.Preview previewNote(String noteId) {
        final NoteExportGraph.Preview[] result = new NoteExportGraph.Preview[1];
        gate.exclusive(() -> result[0] = noteGraph.collect(noteId, true).preview());
        return result[0];
    }
    public Operation exportNote(String noteId,String format) { return exportNote(noteId,format,false,false,null); }
    /** Snapshot under the mutation gate, before returning an operation. */
    public Operation exportNote(String noteId,String format,boolean linked,boolean references,String fingerprint) {return exportNote(noteId,format,linked,references,fingerprint,null,null);}
    private Operation exportNote(String noteId,String format,boolean linked,boolean references,String fingerprint,String requestedId,String generation) {
        var renderer=exporters.require("notes",format);
        final TransferOperation[] created=new TransferOperation[1];
        gate.exclusive(()-> {
            if(generation!=null)exportGeneration(generation);
            var graph=noteGraph.collect(noteId,linked);
            if(linked && !graph.preview().fingerprint().equals(fingerprint))
                throw new ResponseStatusException(HttpStatus.CONFLICT,"Linked resources changed. Review the graph and retry export.");
            var note=graph.workspace().resources().getFirst();
            boolean packaged=linked && (format.startsWith("md") || graph.preview().files()>0);
            String extension=packaged?"zip":renderer.format().extension();
            var op=create("export",requestedId);created[0]=op;
            try {
                Path dir=directory(op.getId());Files.createDirectories(dir.resolve("assets"));
                var binaries=new LinkedHashMap<String,Path>();
                for(var entry:graph.binaries().entrySet()) {
                    Path target=dir.resolve(entry.getKey());Files.copy(entry.getValue(),target);binaries.put(entry.getKey(),target);
                }
                var snapshot=graph.workspace();
                Files.writeString(dir.resolve("snapshot.json"),mapper.writeValueAsString(snapshot));
                op.setOutputArtifact("artifact."+extension);op.setOutputFilename(safeFilename(note.title())+"."+extension);
                op.setOutputMediaType(packaged?"application/zip":renderer.format().mediaType());
                op.setResourceCount(graph.preview().notes());op.setFileCount(graph.preview().files());operations.save(op);
                enqueue(op,()-> {
                    try {
                        gate.exclusive(()->phase(op,"RUNNING","rendering",35));
                        renderer.writeNote(snapshot,Map.copyOf(binaries),dir.resolve("artifact."+extension),linked,references);
                        if(Files.size(dir.resolve("artifact."+extension))>maxArchive)throw new IllegalArgumentException("Export artifact exceeds "+maxArchive+" bytes");
                        var warnings=new LinkedHashSet<>(graph.preview().warnings());
                        for(var warning:mapper.readTree(Files.readString(dir.resolve("warnings.json")))) warnings.add(warning.asText());
                        op.setWarnings(mapper.writeValueAsString(warnings.stream().limit(100).toList()));
                        gate.exclusive(()->phase(op,"SUCCEEDED","complete",100));
                    } catch(Exception e) {throw new IllegalStateException("Note export failed: "+e.getMessage(),e);}
                },true);
            } catch(Exception e) { fail(op,e); }
        });
        return dto(created[0]);
    }
    // Gate brief status writes, not rendering, so note saves never overlap SQLite progress writes.
    private void runNote(TransferOperation op,Runnable task) {
        MDC.put("build",build.version());MDC.put("operationId",op.getId());if(op.getRequestId()!=null)MDC.put("requestId",op.getRequestId());
        boolean[] cancelled={false};
        try {
            gate.exclusive(()-> { synchronized(this) {
                cancelled[0]="CANCELLED".equals(operations.findById(op.getId()).orElseThrow().getStatus());
                if(!cancelled[0])phase(op,"RUNNING","preparing",5);
            }});
            if(!cancelled[0])task.run();
        } catch(Exception e) {gate.exclusive(()->fail(op,e));} finally {MDC.clear();}
    }
    private static String safeFilename(String title) {
        String name=title.replaceAll("[^\\p{L}\\p{N}._ -]","_").replaceAll("^[. ]+|[. ]+$","");
        if(name.isBlank())name="note";return name.substring(0,Math.min(100,name.length()));
    }
    private void run(TransferOperation op,Runnable task) {
        MDC.put("build",build.version()); MDC.put("operationId",op.getId()); if(op.getRequestId()!=null) MDC.put("requestId",op.getRequestId());
        try { synchronized(this) { if("CANCELLED".equals(operations.findById(op.getId()).orElseThrow().getStatus())) return; phase(op,"RUNNING","preparing",5); } task.run(); }
        catch(Exception e) { fail(op,e); } finally { MDC.clear(); }
    }
    private void exportArchive(TransferOperation op) {
        try {
            Path dir=directory(op.getId());Files.createDirectories(dir);
            Workspace snapshot=writeWorkspaceSnapshot(dir.resolve("workspace.zip"));
            op.setResourceCount(snapshot.resources().size());op.setTagCount(snapshot.tags().size());op.setFileCount((int)snapshot.resources().stream().filter(r->"file".equals(r.type())).count());
            phase(op,"SUCCEEDED","complete",100);
        } catch(Exception e) { throw new IllegalStateException("Export failed: "+e.getMessage(),e); }
    }
    private Workspace writeWorkspaceSnapshot(Path destination) throws Exception {
            if(resources.findAll().stream().anyMatch(r->Boolean.TRUE.equals(r.getPurgePending())))throw new IllegalArgumentException("Finish pending permanent-deletion cleanup before exporting the complete workspace");
            Workspace snapshot=transaction.execute(status -> new Workspace(resources.findAll().stream().map(r->new ResourceData(
                r.getId(),r.getType(),r.getTitle(),documents.parse(r.getContent()),r.getMimeType(),r.getSize(),r.getCreatedAt(),r.getUpdatedAt(),r.getLastOpenedAt(),r.getTags().stream().map(Tag::getId).toList(),"file".equals(r.getType())?"files/"+r.getId():null,r.getTrashedAt(),r.getTrashOrganization(),r.getImportOriginalPath()==null?null:new ImportOriginal(r.getImportOriginalName(),r.getImportOriginalMime(),r.getImportOriginalHash(),r.getImportOriginalSize(),"originals/"+r.getId()))).toList(),
                tags.findAll().stream().map(t->new TagData(t.getId(),t.getName(),t.getColor())).toList(),settings.getSettings().workspace(),organization.snapshot(),reviews.snapshot(null)));
            Map<String,Path> binaries=new LinkedHashMap<>();
            for(var r:snapshot.resources()) if(r.binary()!=null) binaries.put(r.binary(),files.getFile(resources.findById(r.id()).orElseThrow().getFilePath()));
            for(var r:snapshot.resources()) if(r.importOriginal()!=null) binaries.put(r.importOriginal().binary(),files.getFile(resources.findById(r.id()).orElseThrow().getImportOriginalPath()));
            exporters.require("workspace","zip").write(snapshot,binaries,destination);
        return snapshot;
    }
    public Preview preview(MultipartFile file) throws Exception {
        if(file.getSize()>maxArchive) throw new IllegalArgumentException("Archive exceeds "+maxArchive+" bytes");
        var op=create("import"); Path dir=directory(op.getId());Files.createDirectories(dir);
        try {
            long total=0;int count=0;Set<String> names=new HashSet<>();
            try(var zip=new ZipInputStream(file.getInputStream())) {
                ZipEntry entry;
                while((entry=zip.getNextEntry())!=null) {
                    String name=entry.getName();
                    if(++count>maxEntries || entry.isDirectory() || !names.add(name) || !(name.equals("manifest.json") || name.equals("workspace.json") || name.equals("partial.json") || name.matches("(?:files|originals)/[a-zA-Z0-9-]+"))) throw new IllegalArgumentException("Invalid, duplicate or excessive ZIP entries");
                    Path target=dir.resolve(name).normalize();if(!target.startsWith(dir)) throw new IllegalArgumentException("Invalid archive path");Files.createDirectories(target.getParent());
                    try(var out=Files.newOutputStream(target)) { byte[] buffer=new byte[8192];int read;long entrySize=0;while((read=zip.read(buffer))!=-1) { total+=read;entrySize+=read;if(total>maxExpanded) throw new IllegalArgumentException("Expanded archive exceeds "+maxExpanded+" bytes");if(name.endsWith(".json") && entrySize>20*1024*1024) throw new IllegalArgumentException("JSON entry exceeds 20 MiB");out.write(buffer,0,read); } }
                }
            }
            var manifest=mapper.readValue(Files.readString(dir.resolve("manifest.json")),Manifest.class);
            if((manifest.version()<1 || manifest.version()>8) || manifest.checksums()==null) throw new IllegalArgumentException("Unsupported archive format");
            if((manifest.version()==6||manifest.version()==8)){var partial=mapper.readTree(Files.readString(dir.resolve("partial.json")));if(partial.path("version").asInt()!=1||!partial.path("kind").asText().equals("vaultor-partial")||!partial.path("omissions").isArray()||partial.path("omissions").size()>20000)throw new IllegalArgumentException("Invalid partial-package coverage");}else if(names.contains("partial.json"))throw new IllegalArgumentException("Partial packages require format6");
            Set<String> expected=new HashSet<>(manifest.checksums().keySet());expected.add("manifest.json");if(!expected.equals(names)) throw new IllegalArgumentException("Archive entries do not match manifest");
            for(var item:manifest.checksums().entrySet()) {
                if(!names.contains(item.getKey())) throw new IllegalArgumentException("Missing archive entry");
                try(var in=Files.newInputStream(dir.resolve(item.getKey()))) { if(!hash(in).equals(item.getValue())) throw new IllegalArgumentException("Checksum mismatch: "+item.getKey()); }
            }
            Workspace workspace=readWorkspace(op); if(manifest.version()<7 && workspace.organization()!=null && workspace.organization().collections().stream().anyMatch(c->c.parentId()!=null))throw new IllegalArgumentException("Collection hierarchy requires archive format7 or8"); if(manifest.version()>=4 && workspace.reviews()==null)throw new IllegalArgumentException("Review section missing"); if(manifest.version()<4 && workspace.reviews()!=null && !workspace.reviews().isEmpty())throw new IllegalArgumentException("Reviews require archive format4"); if(manifest.version()>=2 && workspace.organization()==null) throw new IllegalArgumentException("Organization section missing"); validateWorkspace(workspace,dir);
            if(manifest.version()<5 && (workspace.resources().stream().anyMatch(r->r.importOriginal()!=null)||names.stream().anyMatch(n->n.startsWith("originals/"))))throw new IllegalArgumentException("Import originals require archive format5");
            Set<String> provenanceEntries=new HashSet<>();for(var r:workspace.resources())if(r.importOriginal()!=null)provenanceEntries.add(r.importOriginal().binary());
            if(!provenanceEntries.equals(names.stream().filter(n->n.startsWith("originals/")).collect(java.util.stream.Collectors.toSet())))throw new IllegalArgumentException("Import provenance entries do not match note ownership");
            if(workspace.resources().size()!=manifest.resources() || workspace.tags().size()!=manifest.tags()) throw new IllegalArgumentException("Manifest counts do not match");
            List<String> warnings=new ArrayList<>();
            if((manifest.version()==6||manifest.version()==8))warnings.add("Partial package: only listed content is present. Coverage is in partial.json; it cannot replace a populated workspace.");
            if(workspace.organization()!=null) warnings.add("Organization: "+workspace.organization().collections().size()+" collections; "+workspace.organization().favorites().size()+" favorite resources. Merge matches sibling collections by name within each parent and preserves existing collection favorites.");
            Set<String> ids=new HashSet<>();workspace.resources().forEach(r->ids.add(r.id()));
            for(var r:workspace.resources()) if(r.content()!=null) for(String target:documents.references(r.content())) if(!ids.contains(target)) warnings.add("Missing reference "+target+" in "+r.id());
            op.setDetail(warnings.isEmpty()?"Archive validated":String.join("; ",warnings).substring(0,Math.min(1000,String.join("; ",warnings).length())));
            op.setResourceCount(workspace.resources().size());op.setTagCount(workspace.tags().size());op.setFileCount((int)workspace.resources().stream().filter(r->"file".equals(r.type())).count());
            phase(op,"PREVIEW","review",0);
            int fileCount=(int)workspace.resources().stream().filter(r->r.type().equals("file")).count();
            return new Preview(dto(op),workspace.resources().size(),fileCount,workspace.resources().size()-fileCount,workspace.tags().size(),workspace.reviews()==null?0:workspace.reviews().size(),warnings.stream().limit(100).toList(),(manifest.version()==6||manifest.version()==8));
        } catch(Exception e) { fail(op,e); throw new IllegalArgumentException("Cannot import archive: "+e.getMessage(),e); }
    }
    private Workspace readWorkspace(TransferOperation op) throws IOException { return mapper.readValue(Files.readString(directory(op.getId()).resolve("workspace.json")),Workspace.class); }
    private void validateWorkspace(Workspace w,Path dir) throws Exception {
        if(w.reviews()!=null)reviews.validatePortable(w.reviews());
        if(w.resources()==null || w.tags()==null || w.settings()==null) throw new IllegalArgumentException("Workspace sections missing");
        Set<String> ids=new HashSet<>();Set<String> tagIds=new HashSet<>();Set<String> tagNames=new HashSet<>();
        for(var tag:w.tags()) if(tag.id()==null || !tagIds.add(tag.id()) || tag.name()==null || tag.name().isBlank() || tag.name().length()>100 || !tagNames.add(tag.name().trim().toLowerCase(Locale.ROOT))) throw new IllegalArgumentException("Invalid or duplicate tag");
        for(var r:w.resources()) {
            if(r.id()==null || !r.id().matches("[a-zA-Z0-9-]{1,80}") || !ids.add(r.id()) || r.title()==null || r.title().isBlank() || r.title().length()>500 || r.tags()==null || !tagIds.containsAll(r.tags())) throw new IllegalArgumentException("Invalid resource or tag reference");
            if("note".equals(r.type())) { documents.validate(r.content()); if(r.binary()!=null) throw new IllegalArgumentException("Note cannot have a binary"); }
            else if("file".equals(r.type())) {
                if(!("files/"+r.id()).equals(r.binary()) || !Files.isRegularFile(dir.resolve(r.binary())) || r.size()==null || Files.size(dir.resolve(r.binary()))!=r.size()) throw new IllegalArgumentException("File missing or size mismatch");
            } else throw new IllegalArgumentException("Unknown resource type");
            var original=r.importOriginal();if(original!=null){
                if(!"note".equals(r.type())||original.filename()==null||original.filename().isBlank()||original.filename().length()>180||original.filename().chars().anyMatch(c->c<32||"/\\".indexOf(c)>=0)||original.mime()==null||!original.mime().matches("[a-z0-9.+-]+/[a-z0-9.+-]+")||original.sha256()==null||!original.sha256().matches("[a-f0-9]{64}")||!("originals/"+r.id()).equals(original.binary())||original.bytes()<0||original.bytes()>CompanionImports.MAX_TEXT||!Files.isRegularFile(dir.resolve(original.binary()))||Files.size(dir.resolve(original.binary()))!=original.bytes())throw new IllegalArgumentException("Invalid converted-import provenance");
                try(var input=Files.newInputStream(dir.resolve(original.binary()))){if(!hash(input).equals(original.sha256()))throw new IllegalArgumentException("Import original checksum mismatch");}
            }
            if(r.trashOrganization()!=null) {var labels=mapper.readTree(r.trashOrganization());if(!labels.isArray()||labels.size()>200||r.trashOrganization().length()>40000)throw new IllegalArgumentException("Invalid Trash organization metadata");for(var label:labels)if(!label.isTextual()||label.asText().length()>130)throw new IllegalArgumentException("Invalid Trash organization label");}
        }
        if(w.organization()!=null) OrganizationService.validate(w.organization(),ids);
    }
    public synchronized Operation commit(String id,String mode) {
        var op=operations.findById(id).orElseThrow();
        if(!List.of("merge","replace").contains(mode)) throw new IllegalArgumentException("Choose merge or replace");
        if(!op.getKind().equals("import")) throw new IllegalArgumentException("Not an import");
        if(op.getMode()!=null) { if(!mode.equals(op.getMode())) throw new IllegalArgumentException("Import already committed with another mode");return dto(op); }
        if(!op.getStatus().equals("PREVIEW")) throw new IllegalArgumentException("Import is not ready");
        try{if("replace".equals(mode)&&isPartial(op)&&resources.count()>0)throw new IllegalArgumentException("A partial package cannot replace a populated workspace. Merge it or create a separate workspace.");}catch(IOException e){throw new IllegalStateException("Import metadata unavailable",e);}
        op.setMode(mode);phase(op,"QUEUED","queued",0);
        enqueue(op,()-> {
            gate.exclusive(()->apply(op));
            // Reconcile again after the mutation gate opens, including interrupted cleanup.
            if(List.of("CLEANUP","SUCCEEDED").contains(operations.findById(op.getId()).orElseThrow().getStatus()))
                changeFeed.committed("workspace",List.of(),op.getRequestId());
        },false);return dto(op);
    }
    public synchronized Operation cancel(String id) {
        var op=operations.findById(id).orElseThrow();
        if("import".equals(op.getKind()) && "RUNNING".equals(op.getStatus()) && "preparing".equals(op.getPhase())) {
            cancellationRequests.add(id); return dto(op);
        }
        if(!List.of("QUEUED","PREVIEW").contains(op.getStatus())) throw new ResponseStatusException(HttpStatus.CONFLICT,"Operation has started; it cannot be cancelled");
        phase(op,"CANCELLED","cancelled",0);return dto(op);
    }
    private void apply(TransferOperation op) {
        try {
            Workspace w=readWorkspace(op);validateWorkspace(w,directory(op.getId()));
            if(isPartial(op)&&"replace".equals(op.getMode())&&resources.count()>0)throw new IllegalArgumentException("Partial package replacement refused");
            if("replace".equals(op.getMode())&&resources.count()>0&&!Files.exists(directory(op.getId()).resolve("replacement-before.zip")))writeWorkspaceSnapshot(directory(op.getId()).resolve("replacement-before.zip"));
            Map<String,String> ids=new HashMap<>();Map<String,String> binaries=new HashMap<>();Map<String,String> verifiedMimes=new HashMap<>();Map<String,String> originals=new HashMap<>();
            for(var r:w.resources()) ids.put(r.id(),"replace".equals(op.getMode()) ? r.id() : UUID.randomUUID().toString());
            if(isPartial(op)){for(var r:w.resources())if(r.content()!=null)for(String target:documents.references(r.content()))ids.computeIfAbsent(target,k->UUID.randomUUID().toString());if(w.reviews()!=null)for(var r:w.reviews())if(r.resourceId()!=null)ids.computeIfAbsent(r.resourceId(),k->UUID.randomUUID().toString());}
            for(var r:w.resources()) if(r.binary()!=null) binaries.put(r.id(),UUID.randomUUID()+"_import");
            for(var r:w.resources())if(r.importOriginal()!=null)originals.put(r.id(),UUID.randomUUID()+"_original");
            List<String> stagedNames=new ArrayList<>(binaries.values());stagedNames.addAll(originals.values());op.setJournal(mapper.writeValueAsString(stagedNames));operations.save(op);
            Files.createDirectories(Path.of(storagePath));
            for(var r:w.resources()) if(r.binary()!=null) {
                Files.copy(directory(op.getId()).resolve(r.binary()),files.getFile(binaries.get(r.id())));
                verifiedMimes.put(r.id(),FileMime.detect(files.getFile(binaries.get(r.id())),r.mimeType()));
            }
            for(var r:w.resources())if(r.importOriginal()!=null)Files.copy(directory(op.getId()).resolve(r.importOriginal().binary()),files.getFile(originals.get(r.id())));
            synchronized(this) {
                if(cancellationRequests.remove(op.getId())) { discardStagedFiles(op); phase(op,"CANCELLED","cancelled",0); return; }
                phase(op,"RUNNING","committing",60);
            }
            transaction.executeWithoutResult(status -> {
                List<String> oldFiles=new ArrayList<>();
                if("replace".equals(op.getMode())) {
                    lifecycleRequests.deleteAll();lifecycleRequests.flush();
                    workspaceIdentity.replaced();
                    resources.findAll().forEach(r->{if(r.getFilePath()!=null) oldFiles.add(r.getFilePath());if(r.getImportOriginalPath()!=null)oldFiles.add(r.getImportOriginalPath());});
                    organization.clear();
                    relationships.deleteAll();resources.deleteAll();resources.flush();tags.deleteAll();tags.flush();
                    var existing=settings.getSettings();settings.updateSettings(new SettingsService.SettingsDocument(w.settings(),existing.local(),existing.keybindings()));
                }
                Map<String,Tag> mappedTags=new HashMap<>();
                for(var t:w.tags()) {
                    var tag=tags.findByNameIgnoreCase(t.name().trim()).orElseGet(()->tags.save(new Tag(t.name().trim().toLowerCase(Locale.ROOT),t.color())));
                    mappedTags.put(t.id(),tag);
                }
                for(var r:w.resources()) {
                    var entity=new Resource();entity.setId(ids.get(r.id()));entity.setType(r.type());entity.setTitle(r.title());entity.setContent(r.content()==null?null:documents.remap(r.content(),ids).toString());entity.setFilePath(binaries.get(r.id()));entity.setMimeType(verifiedMimes.getOrDefault(r.id(),r.mimeType()));entity.setSize(r.size());entity.setCreatedAt(r.createdAt());entity.setUpdatedAt(r.updatedAt());entity.setLastOpenedAt(r.lastOpenedAt());
                    entity.setTrashedAt(r.trashedAt());entity.setTrashOrganization(r.trashOrganization());
                    if(r.importOriginal()!=null){var original=r.importOriginal();entity.setImportOriginalPath(originals.get(r.id()));entity.setImportOriginalName(original.filename());entity.setImportOriginalMime(original.mime());entity.setImportOriginalHash(original.sha256());entity.setImportOriginalSize(original.bytes());}
                    entity.setTags(new HashSet<>(r.tags().stream().map(mappedTags::get).toList()));resources.save(entity);
                    if("note".equals(r.type())) linkService.updateLinksForNote(entity.getId(),entity.getContent());
                }
                resources.flush();
                if(w.organization()!=null) organization.restore(w.organization(),ids,"merge".equals(op.getMode()));
                reviews.restore(w.reviews(),ids,"replace".equals(op.getMode()));
                op.setJournal(mapper.writeValueAsString(oldFiles));op.setStatus("CLEANUP");op.setPhase("cleanup");operations.save(op);
                changeFeed.committed("workspace",List.of(),op.getRequestId());
            });
            remember(op);cleanup(op);
        } catch(Exception e) {
            var durable=operations.findById(op.getId()).orElseThrow();
            if("CLEANUP".equals(durable.getStatus())) { cleanup(durable); return; }
            discardStagedFiles(durable);op.setJournal("[]");
            throw new IllegalStateException("Import failed: "+e.getMessage(),e);
        }
    }
    private void discardStagedFiles(TransferOperation op) {
        try {
            var live=new HashSet<String>();resources.findAll().forEach(r->{if(r.getFilePath()!=null) live.add(r.getFilePath());if(r.getImportOriginalPath()!=null)live.add(r.getImportOriginalPath());});
            for(JsonNode item:mapper.readTree(op.getJournal())) if(!live.contains(item.asText())) files.deleteFile(item.asText());
            op.setJournal("[]");operations.save(op);
        } catch(Exception e) { log.error("staged file cleanup failed operationId={}",op.getId(),e); }
    }
    private void cleanup(TransferOperation op) {
        try {
            for(JsonNode item:mapper.readTree(op.getJournal())) files.deleteFile(item.asText());
            op.setJournal("[]");phase(op,"SUCCEEDED","complete",100);
        } catch(Exception e) { op.setDetail("Data committed; file cleanup will retry on restart"); operations.save(op); log.error("cleanup pending operationId={}",op.getId(),e); }
    }
    public Path download(String id) { var op=operations.findById(id).orElseThrow();if(!"export".equals(op.getKind()) || !"SUCCEEDED".equals(op.getStatus())) throw new IllegalArgumentException("Export is not ready");return directory(id).resolve(op.getOutputArtifact()==null ? "workspace.zip" : op.getOutputArtifact()); }
    private static String hash(InputStream input) throws Exception { var digest=MessageDigest.getInstance("SHA-256");byte[] buffer=new byte[8192];int n;while((n=input.read(buffer))!=-1) digest.update(buffer,0,n);return HexFormat.of().formatHex(digest.digest()); }
}
