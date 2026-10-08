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
    public record ResourceData(String id,String type,String title,JsonNode content,String mimeType,Long size,
        LocalDateTime createdAt,LocalDateTime updatedAt,LocalDateTime lastOpenedAt,List<String> tags,String binary,LocalDateTime trashedAt,String trashOrganization) {
        public ResourceData(String id,String type,String title,JsonNode content,String mimeType,Long size,LocalDateTime createdAt,LocalDateTime updatedAt,LocalDateTime lastOpenedAt,List<String> tags,String binary) {this(id,type,title,content,mimeType,size,createdAt,updatedAt,lastOpenedAt,tags,binary,null,null);}
    }
    public record Workspace(List<ResourceData> resources,List<TagData> tags,SettingsService.WorkspaceSettings settings,OrganizationService.OrganizationData organization) {
        public Workspace(List<ResourceData> resources,List<TagData> tags,SettingsService.WorkspaceSettings settings) {this(resources,tags,settings,new OrganizationService.OrganizationData(List.of(),List.of()));}
    }
    public record Manifest(int version,String createdAt,int resources,int tags,Map<String,String> checksums) {}
    public record Operation(String id,String kind,String status,String phase,int progress,String mode,String detail,String requestId,Map<String,Integer> counts,String filename,String mediaType,List<String> warnings) {}
    public record Preview(Operation operation,int resources,int files,int notes,int tags,List<String> warnings) {}
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
    @PreDestroy public void shutdown() { worker.shutdown(); }
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
    private TransferOperation create(String kind) {
        var op=new TransferOperation(); op.setKind(kind); op.setRequestId(MDC.get("requestId"));op=operations.save(op);remember(op);return op;
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
    private void fail(TransferOperation op,Exception e) {
        op.setDetail(e.getMessage()==null?"Transfer failed":e.getMessage().substring(0,Math.min(1000,e.getMessage().length())));
        phase(op,"FAILED","failed",op.getProgress()); log.error("transfer failed operationId={}",op.getId(),e);
    }
    public Operation export(String scope,String format) {
        if (!"workspace".equals(scope) || !"zip".equals(format)) throw new IllegalArgumentException("Note exports require noteId");
        exporters.require(scope,format); var op=create("export");
        op.setOutputFilename("workspace.zip");op.setOutputMediaType("application/zip");operations.save(op);
        worker.submit(()->run(op,()->gate.exclusive(()->exportArchive(op)))); return dto(op);
    }
    public NoteExportGraph.Preview previewNote(String noteId) {
        final NoteExportGraph.Preview[] result = new NoteExportGraph.Preview[1];
        gate.exclusive(() -> result[0] = noteGraph.collect(noteId, true).preview());
        return result[0];
    }
    public Operation exportNote(String noteId,String format) { return exportNote(noteId,format,false,false,null); }
    /** Snapshot under the mutation gate, before returning an operation. */
    public Operation exportNote(String noteId,String format,boolean linked,boolean references,String fingerprint) {
        var renderer=exporters.require("notes",format);
        final TransferOperation[] created=new TransferOperation[1];
        gate.exclusive(()-> {
            var graph=noteGraph.collect(noteId,linked);
            if(linked && !graph.preview().fingerprint().equals(fingerprint))
                throw new ResponseStatusException(HttpStatus.CONFLICT,"Linked resources changed. Review the graph and retry export.");
            var note=graph.workspace().resources().getFirst();
            boolean packaged=linked && (format.startsWith("md") || graph.preview().files()>0);
            String extension=packaged?"zip":renderer.format().extension();
            var op=create("export");created[0]=op;
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
                worker.submit(()->runNote(op,()-> {
                    try {
                        gate.exclusive(()->phase(op,"RUNNING","rendering",35));
                        renderer.writeNote(snapshot,Map.copyOf(binaries),dir.resolve("artifact."+extension),linked,references);
                        if(Files.size(dir.resolve("artifact."+extension))>maxArchive)throw new IllegalArgumentException("Export artifact exceeds "+maxArchive+" bytes");
                        var warnings=new LinkedHashSet<>(graph.preview().warnings());
                        for(var warning:mapper.readTree(Files.readString(dir.resolve("warnings.json")))) warnings.add(warning.asText());
                        op.setWarnings(mapper.writeValueAsString(warnings.stream().limit(100).toList()));
                        gate.exclusive(()->phase(op,"SUCCEEDED","complete",100));
                    } catch(Exception e) {throw new IllegalStateException("Note export failed: "+e.getMessage(),e);}
                }));
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
            if(resources.findAll().stream().anyMatch(r->Boolean.TRUE.equals(r.getPurgePending())))throw new IllegalArgumentException("Finish pending permanent-deletion cleanup before exporting the complete workspace");
            Workspace snapshot=transaction.execute(status -> new Workspace(resources.findAll().stream().map(r->new ResourceData(
                r.getId(),r.getType(),r.getTitle(),documents.parse(r.getContent()),r.getMimeType(),r.getSize(),r.getCreatedAt(),r.getUpdatedAt(),r.getLastOpenedAt(),r.getTags().stream().map(Tag::getId).toList(),"file".equals(r.getType())?"files/"+r.getId():null,r.getTrashedAt(),r.getTrashOrganization())).toList(),
                tags.findAll().stream().map(t->new TagData(t.getId(),t.getName(),t.getColor())).toList(),settings.getSettings().workspace(),organization.snapshot()));
            op.setResourceCount(snapshot.resources().size());op.setTagCount(snapshot.tags().size());op.setFileCount((int)snapshot.resources().stream().filter(r->"file".equals(r.type())).count());
            Map<String,Path> binaries=new LinkedHashMap<>();
            for(var r:snapshot.resources()) if(r.binary()!=null) binaries.put(r.binary(),files.getFile(resources.findById(r.id()).orElseThrow().getFilePath()));
            exporters.require("workspace","zip").write(snapshot,binaries,dir.resolve("workspace.zip"));
            phase(op,"SUCCEEDED","complete",100);
        } catch(Exception e) { throw new IllegalStateException("Export failed: "+e.getMessage(),e); }
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
                    if(++count>maxEntries || entry.isDirectory() || !names.add(name) || !(name.equals("manifest.json") || name.equals("workspace.json") || name.matches("files/[a-zA-Z0-9-]+"))) throw new IllegalArgumentException("Invalid, duplicate or excessive ZIP entries");
                    Path target=dir.resolve(name).normalize();if(!target.startsWith(dir)) throw new IllegalArgumentException("Invalid archive path");Files.createDirectories(target.getParent());
                    try(var out=Files.newOutputStream(target)) { byte[] buffer=new byte[8192];int read;long entrySize=0;while((read=zip.read(buffer))!=-1) { total+=read;entrySize+=read;if(total>maxExpanded) throw new IllegalArgumentException("Expanded archive exceeds "+maxExpanded+" bytes");if(name.endsWith(".json") && entrySize>20*1024*1024) throw new IllegalArgumentException("JSON entry exceeds 20 MiB");out.write(buffer,0,read); } }
                }
            }
            var manifest=mapper.readValue(Files.readString(dir.resolve("manifest.json")),Manifest.class);
            if((manifest.version()<1 || manifest.version()>3) || manifest.checksums()==null) throw new IllegalArgumentException("Unsupported archive format");
            Set<String> expected=new HashSet<>(manifest.checksums().keySet());expected.add("manifest.json");if(!expected.equals(names)) throw new IllegalArgumentException("Archive entries do not match manifest");
            for(var item:manifest.checksums().entrySet()) {
                if(!names.contains(item.getKey())) throw new IllegalArgumentException("Missing archive entry");
                try(var in=Files.newInputStream(dir.resolve(item.getKey()))) { if(!hash(in).equals(item.getValue())) throw new IllegalArgumentException("Checksum mismatch: "+item.getKey()); }
            }
            Workspace workspace=readWorkspace(op); if(manifest.version()>=2 && workspace.organization()==null) throw new IllegalArgumentException("Organization section missing"); validateWorkspace(workspace,dir);
            if(workspace.resources().size()!=manifest.resources() || workspace.tags().size()!=manifest.tags()) throw new IllegalArgumentException("Manifest counts do not match");
            List<String> warnings=new ArrayList<>();
            if(workspace.organization()!=null) warnings.add("Organization: "+workspace.organization().collections().size()+" collections; "+workspace.organization().favorites().size()+" favorite resources. Merge matches collections by name and preserves existing collection favorites.");
            Set<String> ids=new HashSet<>();workspace.resources().forEach(r->ids.add(r.id()));
            for(var r:workspace.resources()) if(r.content()!=null) for(String target:documents.references(r.content())) if(!ids.contains(target)) warnings.add("Missing reference "+target+" in "+r.id());
            op.setDetail(warnings.isEmpty()?"Archive validated":String.join("; ",warnings).substring(0,Math.min(1000,String.join("; ",warnings).length())));
            op.setResourceCount(workspace.resources().size());op.setTagCount(workspace.tags().size());op.setFileCount((int)workspace.resources().stream().filter(r->"file".equals(r.type())).count());
            phase(op,"PREVIEW","review",0);
            int fileCount=(int)workspace.resources().stream().filter(r->r.type().equals("file")).count();
            return new Preview(dto(op),workspace.resources().size(),fileCount,workspace.resources().size()-fileCount,workspace.tags().size(),warnings.stream().limit(100).toList());
        } catch(Exception e) { fail(op,e); throw new IllegalArgumentException("Cannot import archive: "+e.getMessage(),e); }
    }
    private Workspace readWorkspace(TransferOperation op) throws IOException { return mapper.readValue(Files.readString(directory(op.getId()).resolve("workspace.json")),Workspace.class); }
    private void validateWorkspace(Workspace w,Path dir) throws Exception {
        if(w.resources()==null || w.tags()==null || w.settings()==null) throw new IllegalArgumentException("Workspace sections missing");
        Set<String> ids=new HashSet<>();Set<String> tagIds=new HashSet<>();Set<String> tagNames=new HashSet<>();
        for(var tag:w.tags()) if(tag.id()==null || !tagIds.add(tag.id()) || tag.name()==null || tag.name().isBlank() || tag.name().length()>100 || !tagNames.add(tag.name().trim().toLowerCase(Locale.ROOT))) throw new IllegalArgumentException("Invalid or duplicate tag");
        for(var r:w.resources()) {
            if(r.id()==null || !r.id().matches("[a-zA-Z0-9-]{1,80}") || !ids.add(r.id()) || r.title()==null || r.title().isBlank() || r.title().length()>500 || r.tags()==null || !tagIds.containsAll(r.tags())) throw new IllegalArgumentException("Invalid resource or tag reference");
            if("note".equals(r.type())) { documents.validate(r.content()); if(r.binary()!=null) throw new IllegalArgumentException("Note cannot have a binary"); }
            else if("file".equals(r.type())) {
                if(!("files/"+r.id()).equals(r.binary()) || !Files.isRegularFile(dir.resolve(r.binary())) || r.size()==null || Files.size(dir.resolve(r.binary()))!=r.size()) throw new IllegalArgumentException("File missing or size mismatch");
            } else throw new IllegalArgumentException("Unknown resource type");
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
        op.setMode(mode);phase(op,"QUEUED","queued",0);
        worker.submit(()->run(op,()-> {
            gate.exclusive(()->apply(op));
            // Reconcile again after the mutation gate opens, including interrupted cleanup.
            if(List.of("CLEANUP","SUCCEEDED").contains(operations.findById(op.getId()).orElseThrow().getStatus()))
                changeFeed.committed("workspace",List.of(),op.getRequestId());
        }));return dto(op);
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
            Map<String,String> ids=new HashMap<>();Map<String,String> binaries=new HashMap<>();Map<String,String> verifiedMimes=new HashMap<>();
            for(var r:w.resources()) ids.put(r.id(),"replace".equals(op.getMode()) ? r.id() : UUID.randomUUID().toString());
            for(var r:w.resources()) if(r.binary()!=null) binaries.put(r.id(),UUID.randomUUID()+"_import");
            op.setJournal(mapper.writeValueAsString(binaries.values()));operations.save(op);
            Files.createDirectories(Path.of(storagePath));
            for(var r:w.resources()) if(r.binary()!=null) {
                Files.copy(directory(op.getId()).resolve(r.binary()),files.getFile(binaries.get(r.id())));
                verifiedMimes.put(r.id(),FileMime.detect(files.getFile(binaries.get(r.id())),r.mimeType()));
            }
            synchronized(this) {
                if(cancellationRequests.remove(op.getId())) { discardStagedFiles(op); phase(op,"CANCELLED","cancelled",0); return; }
                phase(op,"RUNNING","committing",60);
            }
            transaction.executeWithoutResult(status -> {
                List<String> oldFiles=new ArrayList<>();
                if("replace".equals(op.getMode())) {
                    lifecycleRequests.deleteAll();lifecycleRequests.flush();
                    workspaceIdentity.replaced();
                    resources.findAll().forEach(r->{if(r.getFilePath()!=null) oldFiles.add(r.getFilePath());});
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
                    entity.setTags(new HashSet<>(r.tags().stream().map(mappedTags::get).toList()));resources.save(entity);
                    if("note".equals(r.type())) linkService.updateLinksForNote(entity.getId(),entity.getContent());
                }
                resources.flush();
                if(w.organization()!=null) organization.restore(w.organization(),ids,"merge".equals(op.getMode()));
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
            var live=new HashSet<String>();resources.findAll().forEach(r->{if(r.getFilePath()!=null) live.add(r.getFilePath());});
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
