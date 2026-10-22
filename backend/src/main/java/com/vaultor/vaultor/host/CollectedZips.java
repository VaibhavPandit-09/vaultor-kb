package com.vaultor.vaultor.host;
import com.vaultor.vaultor.service.*;
import com.vaultor.vaultor.workspaces.*;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;
import tools.jackson.databind.ObjectMapper;
import java.nio.file.*;
import java.io.*;
import java.time.Instant;
import java.util.*;

/** A paired device can propose immutable bytes, never authorize host administration. */
@Service
public class CollectedZips {
    public record Input(String hostId,String workspaceId,String generation,String filename,String sha256,long bytes,String name) {}
    public record Receipt(int version,String id,String deviceId,Input input,String state,String createdAt,String destinationWorkspaceId,TransferService.Preview preview) {}
    private final HostAccess access;private final WorkspaceCatalog catalog;private final WorkspaceRegistry registry;
    private final WorkspaceImports imports;private final ObjectMapper json;private final Path root;
    public CollectedZips(HostAccess access,WorkspaceCatalog catalog,WorkspaceRegistry registry,WorkspaceImports imports,ObjectMapper json)throws Exception{
        this.access=access;this.catalog=catalog;this.registry=registry;this.imports=imports;this.json=json;
        root=access.directory.resolveSibling("collected-zips");if(Files.isSymbolicLink(root))throw new IllegalStateException("Invalid collected ZIP storage");Files.createDirectories(root);HostFiles.privatePath(root,true);
    }
    private Path dir(String id){return root.resolve(CompanionImports.uuid(id));}
    private Receipt read(String id)throws Exception{var path=dir(id).resolve("receipt.json");if(!Files.isRegularFile(path)||Files.isSymbolicLink(path)||Files.size(path)>131072)throw new AccessFailure(404,"ZIP_REQUEST_UNAVAILABLE","ZIP request unavailable");return json.readValue(Files.readAllBytes(path),Receipt.class);}
    private Receipt save(Receipt r)throws Exception{HostFiles.write(dir(r.id()).resolve("receipt.json"),json.writeValueAsBytes(r));return r;}
    private Receipt state(Receipt r,String state,String destination,TransferService.Preview preview)throws Exception{return save(new Receipt(1,r.id(),r.deviceId(),r.input(),state,r.createdAt(),destination,preview));}
    private void admit(Input i,String device)throws Exception{
        if(i==null||!access.hostId.equals(i.hostId())||!access.deviceActive(device)||!catalog.allowed(i.workspaceId(),device))throw new AccessFailure(404,"WORKSPACE_UNAVAILABLE","Original source approval required");
        var identity=registry.open(i.workspaceId()).context().getBean(WorkspaceIdentityService.class).current();
        if(!identity.generation().equals(i.generation()))throw new AccessFailure(409,"IMPORT_GENERATION_CHANGED","Source workspace replaced; ZIP remains bound to its original request");
    }
    public synchronized Receipt submit(String id,Input i,MultipartFile file,String device)throws Exception{
        CompanionImports.uuid(id);admit(i,device);
        if(i.filename()==null||i.filename().length()>180||i.filename().chars().anyMatch(c->c<32||"/\\".indexOf(c)>=0)||i.name()==null||i.name().isBlank()||i.name().length()>100||i.name().chars().anyMatch(Character::isISOControl)||i.bytes()<=0||i.bytes()>CompanionImports.MAX_BYTES||i.bytes()!=file.getSize()||i.sha256()==null||!i.sha256().matches("[a-f0-9]{64}"))throw new AccessFailure(400,"INVALID_ZIP_REQUEST","Invalid bounded ZIP input");
        try(var input=file.getInputStream()){if(!CompanionImports.hash(input).equals(i.sha256()))throw new AccessFailure(400,"IMPORT_BYTES_CHANGED","ZIP checksum differs");}
        if(Files.exists(dir(id).resolve("receipt.json"))){var old=read(id);if(!old.deviceId().equals(device)||!old.input().equals(i))throw new AccessFailure(409,"IMPORT_ID_REUSED","ZIP operation already has different intent");return get(id,device);}
        var all=list();long total=0;for(var r:all)if(Files.exists(dir(r.id()).resolve("archive.zip")))total+=r.input().bytes();
        long pending=all.stream().filter(r->!Set.of("SUCCEEDED","REJECTED").contains(r.state())).count();
        if(all.size()>=10000||pending>=32||total+i.bytes()>256L*1024*1024)throw new AccessFailure(409,"ZIP_REQUEST_LIMIT","Host pending ZIP storage or receipt budget is full; original remains on your device");
        var d=dir(id);Files.createDirectories(d);HostFiles.privatePath(d,true);var partial=d.resolve("incoming.tmp");
        try{try(var out=new FileOutputStream(partial.toFile());var input=file.getInputStream()){input.transferTo(out);out.getFD().sync();}HostFiles.privatePath(partial,false);admit(i,device);Files.move(partial,d.resolve("archive.zip"),StandardCopyOption.ATOMIC_MOVE,StandardCopyOption.REPLACE_EXISTING);return save(new Receipt(1,id,device,i,"AWAITING_OWNER",Instant.now().toString(),null,null));}finally{Files.deleteIfExists(partial);}
    }
    public synchronized List<Receipt> list()throws Exception{var rows=new ArrayList<Receipt>();try(var paths=Files.list(root)){for(var path:paths.toList())if(Files.exists(path.resolve("receipt.json")))rows.add(read(path.getFileName().toString()));}return rows;}
    public synchronized Receipt get(String id,String device)throws Exception{var r=read(id);if(!r.deviceId().equals(device))throw new AccessFailure(404,"ZIP_REQUEST_UNAVAILABLE","ZIP request unavailable");admit(r.input(),device);return refresh(r);}
    private Receipt refresh(Receipt r)throws Exception{
        if(r.state().equals("APPROVED")){var result=imports.get(r.id());if(result.state().equals("SUCCEEDED")){r=state(r,"SUCCEEDED",result.id(),r.preview());Files.deleteIfExists(dir(r.id()).resolve("archive.zip"));}}
        return r;
    }
    public synchronized Receipt preview(String id)throws Exception{var r=read(id);admit(r.input(),r.deviceId());if(!Set.of("AWAITING_OWNER","PREVIEWED").contains(r.state()))return refresh(r);
        var i=r.input();var result=imports.preview(id,i.name(),new WorkspaceImports.Origin(i.hostId(),i.workspaceId(),i.generation()),new Archive(dir(id).resolve("archive.zip")));return state(r,"PREVIEWED",null,result.preview());}
    public synchronized Receipt approve(String id)throws Exception{var r=read(id);admit(r.input(),r.deviceId());if(r.state().equals("SUCCEEDED"))return r;if(!Set.of("PREVIEWED","APPROVED").contains(r.state()))throw new AccessFailure(409,"ZIP_PREVIEW_REQUIRED","Review the exact archive before authorizing creation");
        // Persist owner authorization before dispatch; restart never turns an unapproved request into creation.
        if(!r.state().equals("APPROVED"))r=state(r,"APPROVED",null,r.preview());imports.commit(id);return refresh(r);}
    public synchronized Receipt reject(String id)throws Exception{var r=read(id);if(Set.of("APPROVED","SUCCEEDED").contains(r.state()))throw new AccessFailure(409,"ZIP_ALREADY_AUTHORIZED","Creation may already have committed; reconcile the same operation");try{imports.cancel(id);}catch(AccessFailure failure){if(failure.status!=404)throw failure;}r=state(r,"REJECTED",null,r.preview());Files.deleteIfExists(dir(id).resolve("archive.zip"));return r;}
    private record Archive(Path path) implements MultipartFile{
        public String getName(){return "file";}public String getOriginalFilename(){return "workspace.zip";}public String getContentType(){return "application/zip";}public boolean isEmpty(){return getSize()==0;}public long getSize(){try{return Files.size(path);}catch(IOException e){throw new java.io.UncheckedIOException(e);}}public byte[] getBytes()throws IOException{return Files.readAllBytes(path);}public InputStream getInputStream()throws IOException{return Files.newInputStream(path);}public void transferTo(File file)throws IOException{Files.copy(path,file.toPath());}
    }
}
