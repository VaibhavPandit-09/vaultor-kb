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
    private final ResourceRepository resources;
    private final TagRepository tags;
    private final RelationshipRepository relationships;
    private final RelationshipService linkService;
    private final SettingsService settings;
    private final FileStorageService files;
    private final DocumentService documents;
    private final ObjectMapper mapper;
    private final TransactionTemplate transaction;
    private final WorkspaceGate gate;
    private final ExporterRegistry exporters;
    @Value("${app.storage.path}") private String storagePath;
    @Value("${app.transfer.max-archive-bytes}") private long maxArchive;
    @Value("${app.transfer.max-expanded-bytes}") private long maxExpanded;
    @Value("${app.transfer.max-entries}") private int maxEntries;
    private final ExecutorService worker=Executors.newSingleThreadExecutor();
    private final Set<String> cancellationRequests = ConcurrentHashMap.newKeySet();
    private Path root;
    public record TagData(String id,String name,String color) {}
    public record ResourceData(String id,String type,String title,JsonNode content,String mimeType,Long size,
        LocalDateTime createdAt,LocalDateTime updatedAt,LocalDateTime lastOpenedAt,List<String> tags,String binary) {}
    public record Workspace(List<ResourceData> resources,List<TagData> tags,SettingsService.WorkspaceSettings settings) {}
    public record Manifest(int version,String createdAt,int resources,int tags,Map<String,String> checksums) {}
    public record Operation(String id,String kind,String status,String phase,int progress,String mode,String detail,String requestId,Map<String,Integer> counts) {}
    public record Preview(Operation operation,int resources,int files,int notes,int tags,List<String> warnings) {}
    @PostConstruct public void init() throws Exception {
        root=Path.of(storagePath).toAbsolutePath().normalize().resolveSibling("operations"); Files.createDirectories(root);
        for(var op:operations.findAll()) {
            if("CLEANUP".equals(op.getStatus())) { cleanup(op); }
            else if(List.of("QUEUED","RUNNING").contains(op.getStatus())) {
                discardStagedFiles(op);
                fail(op,new IllegalStateException("Operation interrupted by restart. Retry from the source archive."));
            }
        }
    }
    @PreDestroy public void shutdown() { worker.shutdown(); }
    private Path directory(String id) { return root.resolve(UUID.fromString(id).toString()); }
    public Operation dto(TransferOperation op) { return new Operation(op.getId(),op.getKind(),op.getStatus(),op.getPhase(),op.getProgress(),op.getMode(),op.getDetail(),op.getRequestId(),Map.of("resources",Optional.ofNullable(op.getResourceCount()).orElse(0),"files",Optional.ofNullable(op.getFileCount()).orElse(0),"tags",Optional.ofNullable(op.getTagCount()).orElse(0))); }
    public Operation get(String id) { return dto(operations.findById(id).orElseThrow()); }
    private TransferOperation create(String kind) {
        var op=new TransferOperation(); op.setKind(kind); op.setRequestId(MDC.get("requestId")); return operations.save(op);
    }
    private void phase(TransferOperation op,String status,String phase,int progress) {
        op.setStatus(status);op.setPhase(phase);op.setProgress(progress);operations.save(op);
        log.info("transfer operationId={} kind={} phase={} progress={} requestId={}",op.getId(),op.getKind(),phase,progress,op.getRequestId());
    }
    private void fail(TransferOperation op,Exception e) {
        op.setDetail(e.getMessage()==null?"Transfer failed":e.getMessage().substring(0,Math.min(1000,e.getMessage().length())));
        phase(op,"FAILED","failed",op.getProgress()); log.error("transfer failed operationId={}",op.getId(),e);
    }
    public Operation export(String scope,String format) {
        exporters.require(scope,format); var op=create("export");
        worker.submit(()->run(op,()->gate.exclusive(()->exportArchive(op)))); return dto(op);
    }
    private void run(TransferOperation op,Runnable task) {
        MDC.put("build","modernization-1"); MDC.put("operationId",op.getId()); if(op.getRequestId()!=null) MDC.put("requestId",op.getRequestId());
        try { synchronized(this) { if("CANCELLED".equals(operations.findById(op.getId()).orElseThrow().getStatus())) return; phase(op,"RUNNING","preparing",5); } task.run(); }
        catch(Exception e) { fail(op,e); } finally { MDC.clear(); }
    }
    private void exportArchive(TransferOperation op) {
        try {
            Path dir=directory(op.getId());Files.createDirectories(dir);
            Workspace snapshot=transaction.execute(status -> new Workspace(resources.findAll().stream().map(r->new ResourceData(
                r.getId(),r.getType(),r.getTitle(),documents.parse(r.getContent()),r.getMimeType(),r.getSize(),r.getCreatedAt(),r.getUpdatedAt(),r.getLastOpenedAt(),r.getTags().stream().map(Tag::getId).toList(),"file".equals(r.getType())?"files/"+r.getId():null)).toList(),
                tags.findAll().stream().map(t->new TagData(t.getId(),t.getName(),t.getColor())).toList(),settings.getSettings().workspace()));
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
            if(manifest.version()!=1 || manifest.checksums()==null) throw new IllegalArgumentException("Unsupported archive format");
            Set<String> expected=new HashSet<>(manifest.checksums().keySet());expected.add("manifest.json");if(!expected.equals(names)) throw new IllegalArgumentException("Archive entries do not match manifest");
            for(var item:manifest.checksums().entrySet()) {
                if(!names.contains(item.getKey())) throw new IllegalArgumentException("Missing archive entry");
                try(var in=Files.newInputStream(dir.resolve(item.getKey()))) { if(!hash(in).equals(item.getValue())) throw new IllegalArgumentException("Checksum mismatch: "+item.getKey()); }
            }
            Workspace workspace=readWorkspace(op); validateWorkspace(workspace,dir);
            if(workspace.resources().size()!=manifest.resources() || workspace.tags().size()!=manifest.tags()) throw new IllegalArgumentException("Manifest counts do not match");
            List<String> warnings=new ArrayList<>();Set<String> ids=new HashSet<>();workspace.resources().forEach(r->ids.add(r.id()));
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
        }
    }
    public synchronized Operation commit(String id,String mode) {
        var op=operations.findById(id).orElseThrow();
        if(!List.of("merge","replace").contains(mode)) throw new IllegalArgumentException("Choose merge or replace");
        if(!op.getKind().equals("import")) throw new IllegalArgumentException("Not an import");
        if(op.getMode()!=null) { if(!mode.equals(op.getMode())) throw new IllegalArgumentException("Import already committed with another mode");return dto(op); }
        if(!op.getStatus().equals("PREVIEW")) throw new IllegalArgumentException("Import is not ready");
        op.setMode(mode);phase(op,"QUEUED","queued",0);
        worker.submit(()->run(op,()->gate.exclusive(()->apply(op))));return dto(op);
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
            Map<String,String> ids=new HashMap<>();Map<String,String> binaries=new HashMap<>();
            for(var r:w.resources()) ids.put(r.id(),"replace".equals(op.getMode()) ? r.id() : UUID.randomUUID().toString());
            for(var r:w.resources()) if(r.binary()!=null) binaries.put(r.id(),UUID.randomUUID()+"_import");
            op.setJournal(mapper.writeValueAsString(binaries.values()));operations.save(op);
            Files.createDirectories(Path.of(storagePath));
            for(var r:w.resources()) if(r.binary()!=null) {
                Files.copy(directory(op.getId()).resolve(r.binary()),files.getFile(binaries.get(r.id())));
            }
            synchronized(this) {
                if(cancellationRequests.remove(op.getId())) { discardStagedFiles(op); phase(op,"CANCELLED","cancelled",0); return; }
                phase(op,"RUNNING","committing",60);
            }
            transaction.executeWithoutResult(status -> {
                List<String> oldFiles=new ArrayList<>();
                if("replace".equals(op.getMode())) {
                    resources.findAll().forEach(r->{if(r.getFilePath()!=null) oldFiles.add(r.getFilePath());});
                    relationships.deleteAll();resources.deleteAll();resources.flush();tags.deleteAll();tags.flush();
                    var existing=settings.getSettings();settings.updateSettings(new SettingsService.SettingsDocument(w.settings(),existing.local(),existing.keybindings()));
                }
                Map<String,Tag> mappedTags=new HashMap<>();
                for(var t:w.tags()) {
                    var tag=tags.findByNameIgnoreCase(t.name().trim()).orElseGet(()->tags.save(new Tag(t.name().trim().toLowerCase(Locale.ROOT),t.color())));
                    mappedTags.put(t.id(),tag);
                }
                for(var r:w.resources()) {
                    var entity=new Resource();entity.setId(ids.get(r.id()));entity.setType(r.type());entity.setTitle(r.title());entity.setContent(r.content()==null?null:documents.remap(r.content(),ids).toString());entity.setFilePath(binaries.get(r.id()));entity.setMimeType(r.mimeType());entity.setSize(r.size());entity.setCreatedAt(r.createdAt());entity.setUpdatedAt(r.updatedAt());entity.setLastOpenedAt(r.lastOpenedAt());
                    entity.setTags(new HashSet<>(r.tags().stream().map(mappedTags::get).toList()));resources.save(entity);
                    if("note".equals(r.type())) linkService.updateLinksForNote(entity.getId(),entity.getContent());
                }
                op.setJournal(mapper.writeValueAsString(oldFiles));op.setStatus("CLEANUP");op.setPhase("cleanup");operations.save(op);
            });
            cleanup(op);
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
    public Path download(String id) { var op=operations.findById(id).orElseThrow();if(!"export".equals(op.getKind()) || !"SUCCEEDED".equals(op.getStatus())) throw new IllegalArgumentException("Export is not ready");return directory(id).resolve("workspace.zip"); }
    private static String hash(InputStream input) throws Exception { var digest=MessageDigest.getInstance("SHA-256");byte[] buffer=new byte[8192];int n;while((n=input.read(buffer))!=-1) digest.update(buffer,0,n);return HexFormat.of().formatHex(digest.digest()); }
}
