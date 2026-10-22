package com.vaultor.vaultor.service;

import com.vaultor.vaultor.host.AccessFailure;
import com.vaultor.vaultor.repository.ResourceRepository;
import jakarta.annotation.PostConstruct;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.multipart.MultipartFile;
import tools.jackson.databind.ObjectMapper;
import java.io.*;
import java.nio.*;
import java.nio.charset.*;
import java.nio.file.*;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.*;

/** New-resource collection only. Receipts deliberately outlive original-resource purge. */
@Service
public class CompanionImports {
    public static final long MAX_BYTES=64L*1024*1024, MAX_TEXT=5L*1024*1024;
    private final JdbcTemplate jdbc; private final WorkspaceIdentityService identity;
    private final FileImportService imports; private final ResourceRepository resources;
    private final FileStorageService files; private final TransactionTemplate tx; private final ObjectMapper json;
    public CompanionImports(JdbcTemplate jdbc,WorkspaceIdentityService identity,FileImportService imports,ResourceRepository resources,FileStorageService files,TransactionTemplate tx,ObjectMapper json) {
        this.jdbc=jdbc;this.identity=identity;this.imports=imports;this.resources=resources;this.files=files;this.tx=tx;this.json=json;
    }
    public record Intent(String generation,String filename,String mime,String sha256,long bytes,String mode,String collectionId) {}
    public record Receipt(int version,String id,String workspaceId,String generation,String sha256,String fingerprint,String resourceId,String kind,String collectionId,String filename,long bytes,List<String> warnings,String createdAt) {}
    public record Converted(String content,List<String> warnings) {}
    @PostConstruct void init(){jdbc.execute("CREATE TABLE IF NOT EXISTS companion_import_receipts (id TEXT PRIMARY KEY,generation TEXT NOT NULL,device TEXT NOT NULL,fingerprint TEXT NOT NULL,receipt TEXT NOT NULL)");jdbc.execute("CREATE TABLE IF NOT EXISTS companion_import_rejections(id TEXT PRIMARY KEY,generation TEXT NOT NULL,device TEXT NOT NULL,fingerprint TEXT NOT NULL,code TEXT NOT NULL)");}
    private static void require(boolean ok,int status,String code,String detail){if(!ok)throw new AccessFailure(status,code,detail);}
    public static String uuid(String value){try{require(UUID.fromString(value).toString().equals(value),400,"INVALID_IMPORT","Use a canonical operation identity");return value;}catch(IllegalArgumentException|NullPointerException e){throw new AccessFailure(400,"INVALID_IMPORT","Use a canonical operation identity");}}
    public static String hash(InputStream input) throws Exception {var d=MessageDigest.getInstance("SHA-256");byte[] buffer=new byte[65536];int n;while((n=input.read(buffer))!=-1)d.update(buffer,0,n);return HexFormat.of().formatHex(d.digest());}
    private Intent validate(Intent i){
        require(i!=null,400,"INVALID_IMPORT","Import intent required");uuid(i.generation());
        require(i.filename()!=null&&!i.filename().isBlank()&&i.filename().length()<=180&&i.filename().chars().noneMatch(c->c<32||"/\\:*?\"<>|".indexOf(c)>=0),400,"INVALID_IMPORT","Choose a safe filename (at most 180 characters)");
        require(i.mime()!=null&&i.mime().matches("[a-z0-9.+-]+/[a-z0-9.+-]+")&&i.mime().length()<=120,400,"INVALID_IMPORT","Invalid MIME metadata");
        require(i.sha256()!=null&&i.sha256().matches("[a-f0-9]{64}")&&i.bytes()>=0&&i.bytes()<=MAX_BYTES,413,"IMPORT_LIMIT","Imports are limited to 64 MiB per item");
        require(Set.of("original","text","markdown").contains(i.mode()),400,"IMPORT_FORMAT_UNSUPPORTED","Choose original file, text or Markdown");
        if(i.collectionId()!=null)uuid(i.collectionId());return i;
    }
    private void generation(String expected){require(identity.current().generation().equals(expected),409,"IMPORT_GENERATION_CHANGED","Workspace replaced. Retain the import for its original destination.");}
    public Receipt get(String id,String expected,String device){uuid(id);return tx.execute(status->{generation(expected);var rows=jdbc.queryForList("SELECT device,receipt FROM companion_import_receipts WHERE id=? AND generation=?",id,expected);require(!rows.isEmpty(),404,"IMPORT_NOT_FOUND","No acknowledged import for this identity");var row=rows.getFirst();require(device.equals(row.get("device")),404,"IMPORT_NOT_FOUND","Import unavailable");return json.readValue((String)row.get("receipt"),Receipt.class);});}
    public synchronized Receipt create(String id,Intent raw,MultipartFile file,String device) throws Exception {
        return create(id,raw,file,device,()->true);
    }
    public synchronized Receipt create(String id,Intent raw,MultipartFile file,String device,java.util.function.BooleanSupplier admitted) throws Exception {
        uuid(id);Intent i=validate(raw);require(file!=null&&file.getSize()==i.bytes(),400,"IMPORT_BYTES_CHANGED","Input length differs from confirmed intent");
        try(var in=file.getInputStream()){require(hash(in).equals(i.sha256()),400,"IMPORT_BYTES_CHANGED","Input checksum differs from confirmed intent");}
        require(i.mime().equals(file.getContentType()),400,"IMPORT_BYTES_CHANGED","Upload MIME differs from confirmed intent");
        String fingerprint=hash(new ByteArrayInputStream(String.join("\0",i.generation(),i.filename(),i.mime(),i.sha256(),Long.toString(i.bytes()),i.mode(),i.collectionId()==null?"":i.collectionId()).getBytes(StandardCharsets.UTF_8)));
        // Same transaction owns generation admission, receipt, new resource and membership.
        String[] provenance={null}, createdBinary={null};
        try{return tx.execute(status->{
            require(admitted.getAsBoolean(),404,"WORKSPACE_UNAVAILABLE","Original source approval required");
            generation(i.generation());var rows=jdbc.queryForList("SELECT device,fingerprint,receipt FROM companion_import_receipts WHERE id=?",id);
            if(!rows.isEmpty()){var r=rows.getFirst();require(device.equals(r.get("device"))&&fingerprint.equals(r.get("fingerprint")),409,"IMPORT_ID_REUSED","Operation already has different immutable intent");return json.readValue((String)r.get("receipt"),Receipt.class);}
            var rejected=jdbc.queryForList("SELECT device,fingerprint,code FROM companion_import_rejections WHERE id=?",id);if(!rejected.isEmpty()){var r=rejected.getFirst();require(device.equals(r.get("device"))&&fingerprint.equals(r.get("fingerprint")),409,"IMPORT_ID_REUSED","Operation has a durable rejection for different intent");throw new AccessFailure(409,(String)r.get("code"),"This exact import was definitively rejected. Retain its identity; a separately confirmed new import may choose another mode or collection.");}
            require(jdbc.queryForObject("SELECT (SELECT COUNT(*) FROM companion_import_receipts)+(SELECT COUNT(*) FROM companion_import_rejections)",Integer.class)<10000,409,"IMPORT_RECEIPT_LIMIT","Host import receipt limit reached; keep local input");
            require(!resources.existsById(id),409,"IMPORT_ID_REUSED","Resource identity already exists without this import receipt");
            try {
                Converted converted="original".equals(i.mode())?null:convert(file,i.mode());
                String title=converted==null?i.filename():i.filename().replaceFirst("(?i)\\.(?:txt|md|markdown)$","");if(title.isBlank())title="Imported note";
                var resource=imports.create(id,title,converted==null?null:converted.content(),converted==null?new NamedFile(file,i.filename()):null,i.collectionId());
                createdBinary[0]=resource.getFilePath();
                if(converted!=null){provenance[0]=files.storeFile(new NamedFile(file,i.filename()));resource.setImportOriginalPath(provenance[0]);resource.setImportOriginalName(i.filename());resource.setImportOriginalMime(i.mime());resource.setImportOriginalHash(i.sha256());resource.setImportOriginalSize(i.bytes());resources.saveAndFlush(resource);}
                var result=new Receipt(1,id,identity.current().id(),i.generation(),i.sha256(),fingerprint,resource.getId(),resource.getType(),i.collectionId(),i.filename(),i.bytes(),converted==null?List.of():converted.warnings(),Instant.now().toString());
                jdbc.update("INSERT INTO companion_import_receipts(id,generation,device,fingerprint,receipt) VALUES(?,?,?,?,?)",id,i.generation(),device,fingerprint,json.writeValueAsString(result));return result;
            }catch(java.util.NoSuchElementException e){throw new AccessFailure(409,"IMPORT_COLLECTION_UNAVAILABLE","The confirmed destination collection no longer exists. Original input and operation remain on the collecting device; do not silently use workspace root.");}catch(RuntimeException e){throw e;}catch(Exception e){throw new IllegalStateException("Import failed; original input remains on the collecting device",e);}
        });}catch(Exception e){
            if(e instanceof AccessFailure failure&&Set.of("IMPORT_COLLECTION_UNAVAILABLE","IMPORT_ENCODING_UNSUPPORTED","IMPORT_CONVERSION_LIMIT").contains(failure.code))tx.executeWithoutResult(status->{generation(i.generation());jdbc.update("INSERT OR IGNORE INTO companion_import_rejections(id,generation,device,fingerprint,code) VALUES(?,?,?,?,?)",id,i.generation(),device,fingerprint,failure.code);});
            try{if(!resources.existsById(id))for(String path:new String[]{provenance[0],createdBinary[0]})if(path!=null)try{files.deleteFile(path);}catch(IOException ignored){}}catch(Exception uncertain){/* Retain bytes if database outcome cannot be established. */}throw e;}
    }
    public Path original(String id){var r=resources.findById(uuid(id)).orElseThrow();require(!Boolean.TRUE.equals(r.getPurgePending())&&r.getImportOriginalPath()!=null,404,"IMPORT_ORIGINAL_UNAVAILABLE","No retained converted-import original");return files.getFile(r.getImportOriginalPath());}
    public String originalName(String id){return resources.findById(uuid(id)).orElseThrow().getImportOriginalName();}
    public Converted convert(MultipartFile file,String mode)throws Exception {
        require(file.getSize()<=MAX_TEXT,413,"IMPORT_CONVERSION_LIMIT","Text conversion is limited to 5 MiB; keep as an original file instead");
        byte[] bytes=file.getBytes();Charset encoding=StandardCharsets.UTF_8;int skip=0;
        if(bytes.length>=2&&bytes[0]==(byte)0xff&&bytes[1]==(byte)0xfe){encoding=StandardCharsets.UTF_16LE;skip=2;}else if(bytes.length>=2&&bytes[0]==(byte)0xfe&&bytes[1]==(byte)0xff){encoding=StandardCharsets.UTF_16BE;skip=2;}
        String text;try{text=encoding.newDecoder().onMalformedInput(CodingErrorAction.REPORT).onUnmappableCharacter(CodingErrorAction.REPORT).decode(ByteBuffer.wrap(bytes,skip,bytes.length-skip)).toString().replaceFirst("^\\uFEFF","").replace("\r\n","\n").replace('\r','\n');}catch(CharacterCodingException e){throw new AccessFailure(400,"IMPORT_ENCODING_UNSUPPORTED","Use UTF-8 or BOM-marked UTF-16, or import as an original file");}
        require(text.indexOf('\0')<0,400,"IMPORT_ENCODING_UNSUPPORTED","Binary text cannot become a note");
        if(mode.equals("markdown")){var converted=ImportMarkdown.parse(text);String content=json.writeValueAsString(Map.of("type","doc","content",converted.blocks()));require(content.getBytes(StandardCharsets.UTF_8).length<=1048576,413,"IMPORT_CONVERSION_LIMIT","Converted structured note exceeds 1 MiB; keep original instead");return new Converted(content,converted.warnings());}
        List<Map<String,Object>> blocks=new ArrayList<>();
        for(String line:text.split("\n",-1)){
            require(blocks.size()<10000,413,"IMPORT_CONVERSION_LIMIT","Converted note has too many blocks");
            Map<String,Object> block=new LinkedHashMap<>();block.put("type","paragraph");
            if(!line.isEmpty())block.put("content",List.of(Map.of("type","text","text",line)));blocks.add(block);
        }
        String content=json.writeValueAsString(Map.of("type","doc","content",blocks));require(content.getBytes(StandardCharsets.UTF_8).length<=1048576,413,"IMPORT_CONVERSION_LIMIT","Converted structured note exceeds 1 MiB; keep original instead");return new Converted(content,List.of());
    }
    private record NamedFile(MultipartFile original,String name) implements MultipartFile {
        public String getName(){return "file";}public String getOriginalFilename(){return name;}public String getContentType(){return original.getContentType();}public boolean isEmpty(){return original.isEmpty();}public long getSize(){return original.getSize();}public byte[] getBytes()throws IOException{return original.getBytes();}public InputStream getInputStream()throws IOException{return original.getInputStream();}public void transferTo(File target)throws IOException{original.transferTo(target);}
    }
}
