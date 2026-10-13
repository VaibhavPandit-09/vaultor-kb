package com.vaultor.vaultor.host;

import com.vaultor.vaultor.workspaces.WorkspaceRegistry;
import com.vaultor.vaultor.service.TransferService;
import jakarta.annotation.PreDestroy;
import org.springframework.stereotype.Service;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.web.multipart.MultipartFile;
import tools.jackson.databind.ObjectMapper;
import java.nio.file.*;
import java.io.*;
import java.time.Instant;
import java.util.*;
import java.util.concurrent.*;
import java.security.MessageDigest;

/** Private, retry-addressed fork staging. The public catalog never contains an incomplete import. */
@Service
public class WorkspaceImports {
    public record Origin(String hostId,String workspaceId,String generation) {}
    public record Receipt(int version,String id,String name,String sha256,String state,String operationId,
                          TransferService.Preview preview,Origin origin,String copiedAt,String detail) {}
    private final WorkspaceCatalog catalog;private final WorkspaceRegistry registry;private final ObjectMapper json;
    private final Path root;private final long limit;private final ExecutorService worker=Executors.newSingleThreadExecutor();
    private final Set<String> running=new HashSet<>();
    public WorkspaceImports(WorkspaceCatalog catalog,WorkspaceRegistry registry,ObjectMapper json,@Value("${app.transfer.max-archive-bytes}")long limit) throws Exception {
        this.catalog=catalog;this.registry=registry;this.json=json;this.limit=limit;root=catalog.directory.resolveSibling("workspace-imports");
        if(Files.isSymbolicLink(root))throw new IllegalStateException("Invalid workspace import storage");Files.createDirectories(root);HostFiles.privatePath(root,true);
        for(var r:list())if(!List.of("SUCCEEDED","CANCELLED").contains(r.state())) {
            boolean published=catalog.list(null).stream().anyMatch(e->e.id().equals(r.id()));
            if(!published)catalog.reserve(r.id(),r.name());
        }
    }
    private Path dir(String id){if(id==null||!id.matches("[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}"))throw new IllegalArgumentException("Use a canonical import UUID");Path p=root.resolve(id);if(Files.isSymbolicLink(p))throw new IllegalStateException("Invalid import directory");return p;}
    private Receipt read(String id) throws Exception {Path p=dir(id).resolve("receipt.json");if(Files.isSymbolicLink(p)||!Files.isRegularFile(p)||Files.size(p)>131072)throw new AccessFailure(404,"WORKSPACE_IMPORT_UNAVAILABLE","Workspace import is unavailable");var r=json.readValue(Files.readAllBytes(p),Receipt.class);if(r.version()!=1||!r.id().equals(id)||!r.sha256().matches("[a-f0-9]{64}"))throw new IllegalStateException("Invalid import receipt; data retained");return r;}
    private Receipt save(Receipt r) throws Exception {HostFiles.write(dir(r.id()).resolve("receipt.json"),json.writeValueAsBytes(r));return r;}
    private Receipt state(Receipt r,String status,String detail) throws Exception {return save(new Receipt(1,r.id(),r.name(),r.sha256(),status,r.operationId(),r.preview(),r.origin(),r.copiedAt(),detail));}
    public synchronized List<Receipt> list() throws Exception {var result=new ArrayList<Receipt>();try(var paths=Files.list(root)){for(var p:paths.toList())if(p.getFileName().toString().matches("[a-f0-9-]{36}")){if(result.size()>=128)throw new IllegalStateException("Import receipt limit exceeded");if(Files.exists(p.resolve("receipt.json")))result.add(read(p.getFileName().toString()));}}return result;}
    public synchronized Receipt preview(String id,String name,Origin origin,MultipartFile file) throws Exception {
        registry.beginHostWork();try{return previewWork(id,name,origin,file);}finally{registry.endHostWork();}
    }
    private Receipt previewWork(String id,String name,Origin origin,MultipartFile file) throws Exception {
        Path d=dir(id);if(name==null||name.isBlank()||name.strip().length()>100||name.chars().anyMatch(Character::isISOControl))throw new IllegalArgumentException("Workspace names contain1–100 characters");name=name.strip();
        if(origin!=null)for(String value:List.of(origin.hostId(),origin.workspaceId(),origin.generation()))if(!value.matches("[a-f0-9-]{36}"))throw new IllegalArgumentException("Invalid copy origin");
        if(file.isEmpty()||file.getSize()>limit)throw new IllegalArgumentException("Choose a workspace ZIP up to"+limit+"bytes");
        boolean existing=Files.exists(d.resolve("receipt.json"));if(!existing){if(list().size()>=128)throw new AccessFailure(409,"WORKSPACE_IMPORT_LIMIT","Import receipt limit reached; existing receipts retained");if(list().stream().anyMatch(r->!List.of("SUCCEEDED","CANCELLED").contains(r.state())))throw new AccessFailure(409,"WORKSPACE_IMPORT_PENDING","Finish or cancel the pending workspace import first");catalog.reserve(id,name);}
        Files.createDirectories(d);HostFiles.privatePath(d,true);Path incoming=d.resolve("incoming-"+UUID.randomUUID()+".tmp");
        try {
            var hash=MessageDigest.getInstance("SHA-256");long total=0;
            try(var input=file.getInputStream();var output=Files.newOutputStream(incoming,StandardOpenOption.CREATE_NEW)){byte[] bytes=new byte[65536];int n;while((n=input.read(bytes))!=-1){if((total+=n)>limit)throw new IllegalArgumentException("Archive exceeds byte limit");hash.update(bytes,0,n);output.write(bytes,0,n);}}
            String digest=HexFormat.of().formatHex(hash.digest());
            if(existing){var old=read(id);if(!old.name().equals(name)||!old.sha256().equals(digest)||!Objects.equals(old.origin(),origin))throw new AccessFailure(409,"WORKSPACE_IMPORT_CONFLICT","Retry requires the same name, source and archive bytes");return get(id);}
            Files.move(incoming,d.resolve("archive.zip"),StandardCopyOption.ATOMIC_MOVE,StandardCopyOption.REPLACE_EXISTING);
            var receipt=save(new Receipt(1,id,name,digest,"VALIDATING",null,null,origin,Instant.now().toString(),"Validating archive"));
            try {return validate(receipt);}catch(Exception e){state(receipt,"FAILED","Archive validation failed. Retry the same archive or cancel.");throw e;}
        }catch(Exception e){if(!Files.exists(d.resolve("receipt.json")))catalog.release(id);throw e;}finally{Files.deleteIfExists(incoming);}
    }
    private Receipt validate(Receipt r) throws Exception {
        var transfers=registry.prepare(r.id(),dir(r.id()).resolve("staging")).context().getBean(TransferService.class);
        var preview=transfers.preview(new Archive(dir(r.id()).resolve("archive.zip")));
        return save(new Receipt(1,r.id(),r.name(),r.sha256(),"PREVIEW",preview.operation().id(),preview,r.origin(),r.copiedAt(),"Ready to create a separate workspace"));
    }
    public synchronized Receipt get(String id) throws Exception {
        var r=read(id);if(List.of("SUCCEEDED","CANCELLED").contains(r.state()))return r;if(!running.contains(id)&&(!r.state().equals("CANCELLED")&&Files.exists(catalog.directory.resolve(id).resolve("fork-origin.json"))||List.of("READY","MOVED").contains(r.state()))){registry.beginHostWork();try{return finish(r);}finally{registry.endHostWork();}}
        if(!running.contains(id)&&r.state().equals("VALIDATING"))return state(r,"FAILED","Validation was interrupted. Retry the retained archive or cancel.");
        if(!running.contains(id)&&r.state().equals("COMMITTING")) {
            Path stage=dir(id).resolve("staging");var t=registry.prepare(id,stage).context().getBean(TransferService.class);var op=t.get(r.operationId());
            if(op.status().equals("SUCCEEDED"))return finish(state(r,"READY","Publishing workspace"));
            if(List.of("FAILED","PREVIEW","CANCELLED").contains(op.status()))return state(r,"FAILED","Interrupted import retained. Retry to validate the original archive again.");
        }
        return r;
    }
    public synchronized Receipt commit(String id) throws Exception {
        var r=get(id);if(r.state().equals("SUCCEEDED")||running.contains(id))return r;
        if(r.state().equals("FAILED")||r.state().equals("VALIDATING"))r=validate(r);
        if(!r.state().equals("PREVIEW"))throw new AccessFailure(409,"WORKSPACE_IMPORT_NOT_READY","Import is not ready to commit");
        registry.beginHostWork();try{r=state(r,"COMMITTING","Creating separate workspace");}catch(Exception failure){registry.endHostWork();throw failure;}running.add(id);final Receipt captured=r;
        worker.submit(()->{try{
            var t=registry.prepare(id,dir(id).resolve("staging")).context().getBean(TransferService.class);t.commit(captured.operationId(),"replace");
            for(int n=0;;n++){TransferService.Operation op;try{op=t.get(captured.operationId());}catch(org.springframework.web.server.ResponseStatusException busy){if(busy.getStatusCode().value()!=409||n>=2400)throw busy;Thread.sleep(250);continue;}if(op.status().equals("SUCCEEDED"))break;if(List.of("FAILED","CANCELLED").contains(op.status()))throw new IllegalStateException("Import failed");if(n>=2400)throw new IllegalStateException("Import still pending; retry status later");Thread.sleep(250);}
            synchronized(this){finish(state(read(id),"READY","Publishing workspace"));}
        }catch(Exception e){synchronized(this){try{state(read(id),"FAILED","Import could not complete. Source retained; retry the same operation.");}catch(Exception ignored){/* Durable prior state survives storage failure. */}}}
        finally{synchronized(this){running.remove(id);}registry.endHostWork();}});return r;
    }
    private Receipt finish(Receipt r) throws Exception {
        Path stage=dir(r.id()).resolve("staging"),target=catalog.directory.resolve(r.id()),marker=target.resolve("fork-origin.json");
        if(Files.exists(stage)&&!Files.exists(target)){
            HostFiles.write(stage.resolve("fork-origin.json"),json.writeValueAsBytes(Map.of("importId",r.id(),"sha256",r.sha256())));
            registry.closePrepared(r.id());if(Files.exists(target))throw new AccessFailure(409,"WORKSPACE_ID_CONFLICT","Destination storage already exists; nothing overwritten");Files.move(stage,target,StandardCopyOption.ATOMIC_MOVE);r=state(r,"MOVED","Publishing workspace");
        }
        if(Files.isSymbolicLink(target)||Files.isSymbolicLink(marker)||!Files.isRegularFile(marker)||Files.size(marker)>1024)throw new IllegalStateException("Prepared workspace marker unavailable; nothing published");
        var identity=json.readTree(Files.readAllBytes(marker));if(!identity.path("importId").asText().equals(r.id())||!identity.path("sha256").asText().equals(r.sha256()))throw new IllegalStateException("Prepared workspace differs; nothing published");
        catalog.publish(r.id(),r.name());var done=state(r,"SUCCEEDED","Separate workspace ready. It does not synchronize with its source.");Files.deleteIfExists(dir(r.id()).resolve("archive.zip"));return done;
    }
    public synchronized Receipt cancel(String id) throws Exception {
        var r=get(id);if(running.contains(id)||List.of("COMMITTING","READY","MOVED","SUCCEEDED").contains(r.state()))throw new AccessFailure(409,"WORKSPACE_IMPORT_STARTED","Committed/preparing imports cannot be discarded");
        registry.closePrepared(id);r=state(r,"CANCELLED","Cancelled; source unchanged");catalog.release(id);Files.deleteIfExists(dir(id).resolve("archive.zip"));Path stage=dir(id).resolve("staging").toAbsolutePath().normalize();if(!stage.startsWith(root.toAbsolutePath().normalize()))throw new IllegalStateException("Invalid staging path");if(Files.exists(stage))try(var paths=Files.walk(stage)){for(var p:paths.sorted(Comparator.reverseOrder()).toList())Files.delete(p);}return r;
    }
    @PreDestroy public void stop(){worker.shutdown();try{if(!worker.awaitTermination(15,TimeUnit.SECONDS))worker.shutdownNow();}catch(InterruptedException e){worker.shutdownNow();Thread.currentThread().interrupt();}}
    private record Archive(Path path) implements MultipartFile {
        public String getName(){return "file";}public String getOriginalFilename(){return "workspace.zip";}public String getContentType(){return "application/zip";}public boolean isEmpty(){return getSize()==0;}public long getSize(){try{return Files.size(path);}catch(IOException e){throw new UncheckedIOException(e);}}
        public byte[] getBytes() throws IOException {throw new IOException("Streaming archive required");}public InputStream getInputStream()throws IOException{return Files.newInputStream(path);}public void transferTo(File file)throws IOException{Files.copy(path,file.toPath());}
    }
}
