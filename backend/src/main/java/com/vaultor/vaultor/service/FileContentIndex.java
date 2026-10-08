package com.vaultor.vaultor.service;

import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.context.annotation.DependsOn;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.boot.system.ApplicationHome;
import java.nio.file.*;
import java.io.*;
import java.util.*;
import java.util.concurrent.*;

/** One bounded file at a time. Parsing never holds SQLite or workspace admission. */
@Service @RequiredArgsConstructor @DependsOn("entityManagerFactory")
public class FileContentIndex {
    private final JdbcTemplate jdbc;
    private final TransactionTemplate transaction;
    private final FileStorageService storage;
    private final WorkspaceIdentityService identity;
    private final WorkspaceGate gate;
    private final ScheduledExecutorService worker=Executors.newSingleThreadScheduledExecutor(Thread.ofPlatform().name("file-text-index").factory());
    private volatile Process child;
    private volatile String failure="";
    private Path scratch;
    public record Coverage(long files,long indexed,long queued,long indexing,long unsupported,long limitExceeded,long encrypted,long invalid,long noText,long failed,boolean complete,String failure) {}
    record Job(String id,String path,String mime,long size,String version,String generation) {}
    // Changes to source metadata invalidate the derived entry; a generation change invalidates all entries.
    static final String VERSION="coalesce(r.revision_seed,'')||':'||coalesce(r.revision_number,0)||':'||coalesce(r.file_path,'')";
    @PostConstruct public void initialize(){
        try {
            storage.init();scratch=storage.getFile(".file-search-scratch");Files.createDirectories(scratch);
            if(Files.isSymbolicLink(scratch))throw new IOException("Invalid scratch directory");
            try(var old=Files.list(scratch)){for(Path p:old.filter(p->p.getFileName().toString().matches("vaultor-file-text-.*\\.(input|result)")).toList())Files.deleteIfExists(p);}
        }catch(IOException e){failure="File indexing storage unavailable; retry after resolving storage access";}
        transaction.executeWithoutResult(tx->{
            jdbc.execute("create table if not exists file_search(id text primary key,version text not null,generation text not null,state text not null,body text not null default '',hash text not null default '',detail text not null default '')");
            jdbc.update("update file_search set state='queued' where state='indexing'");
            jdbc.execute("drop trigger if exists file_search_delete");
            jdbc.execute("create trigger file_search_delete after delete on resources begin delete from file_search where id=old.id; end");
        });
        identity.current();
        transaction.executeWithoutResult(tx->{
            jdbc.execute("drop trigger if exists file_search_update");
            jdbc.execute("create trigger file_search_update after update of revision_number,revision_seed,file_path,mime_type,type,trashed_at on resources when old.type='file' or new.type='file' begin delete from file_search where id=old.id; update resource_fts set body='' where id=old.id; end");
            jdbc.execute("drop trigger if exists file_search_generation");
            jdbc.execute("create trigger file_search_generation after update of value on settings when new.key_name='workspace_generation' and new.value<>old.value begin delete from file_search; update resource_fts set body='' where id in(select id from resources where type='file'); end");
        });
        worker.scheduleWithFixedDelay(this::tick,3000,100,TimeUnit.MILLISECONDS);
    }
    @PreDestroy public void shutdown(){worker.shutdownNow();var p=child;if(p!=null)p.destroyForcibly();}
    public void rebuild(){gate.exclusive(()->transaction.executeWithoutResult(tx->{jdbc.update("delete from file_search");jdbc.update("update resource_fts set body='' where id in(select id from resources where type='file')");}));failure="";}
    public record Entry(String id,String title,String state,String detail) {}
    public com.vaultor.vaultor.controller.ApiDtos.PageDto<Entry> jobs(int page,int size){
        if(page<0||size<1||size>100)throw new IllegalArgumentException("File status allows page>=0 and size 1–100");
        String join=" from resources r left join file_search f on f.id=r.id and f.version="+VERSION+" and f.generation=(select value from settings where key_name='workspace_generation') where r.type='file' and r.trashed_at is null";
        long count=jdbc.queryForObject("select count(*)"+join,Long.class);
        var items=jdbc.query("select r.id,r.title,coalesce(f.state,'queued'),coalesce(f.detail,'Awaiting saved file extraction')"+join+" order by lower(r.title),r.id limit ? offset ?",(rs,n)->new Entry(rs.getString(1),rs.getString(2),rs.getString(3),rs.getString(4)),size,(long)page*size);
        return new com.vaultor.vaultor.controller.ApiDtos.PageDto<>(items,page,size,count,(int)((count+size-1)/size));
    }
    public void retry(String id){
        if(id!=null&&id.length()>100)throw new IllegalArgumentException("Invalid resource ID");
        transaction.executeWithoutResult(tx->{if(id==null)jdbc.update("update file_search set state='queued' where state in ('failed','invalid','encrypted','limit-exceeded')");else jdbc.update("update file_search set state='queued' where id=? and state not in ('indexing','queued')",id);});failure="";
    }
    public Coverage coverage(String where,List<Object> args){
        var states=jdbc.query("select coalesce(f.state,'queued'),count(*) from resources r left join file_search f on f.id=r.id and f.version="+VERSION+" and f.generation=(select value from settings where key_name='workspace_generation') where r.type='file' and r.trashed_at is null "+where+" group by coalesce(f.state,'queued')",(rs,n)->Map.entry(rs.getString(1),rs.getLong(2)),args.toArray());
        var counts=new HashMap<String,Long>();states.forEach(e->counts.put(e.getKey(),e.getValue()));long total=counts.values().stream().mapToLong(Long::longValue).sum();
        long indexed=counts.getOrDefault("indexed",0L),empty=counts.getOrDefault("no-text",0L),unsupported=counts.getOrDefault("unsupported",0L);
        return new Coverage(total,indexed,counts.getOrDefault("queued",0L),counts.getOrDefault("indexing",0L),unsupported,counts.getOrDefault("limit-exceeded",0L),counts.getOrDefault("encrypted",0L),counts.getOrDefault("invalid",0L),empty,counts.getOrDefault("failed",0L),failure.isEmpty()&&total==indexed+empty+unsupported,failure);
    }
    public synchronized void tick(){
        if(Thread.currentThread().isInterrupted())return;
        Job active=null;
        try {
            var jobs=jdbc.query("select r.id,r.file_path,r.mime_type,coalesce(r.size,0),"+VERSION+",(select value from settings where key_name='workspace_generation') from resources r left join file_search f on f.id=r.id where r.type='file' and r.trashed_at is null and (f.id is null or f.version<>"+VERSION+" or f.generation<>(select value from settings where key_name='workspace_generation') or f.state='queued') order by r.id limit 1",(rs,n)->new Job(rs.getString(1),rs.getString(2),rs.getString(3),rs.getLong(4),rs.getString(5),rs.getString(6)));
            if(jobs.isEmpty())return;
            Job job=jobs.getFirst();
            active=job;
            transaction.executeWithoutResult(tx->{jdbc.update("insert into file_search(id,version,generation,state) values(?,?,?,'indexing') on conflict(id) do update set version=excluded.version,generation=excluded.generation,state='indexing',body='',hash='',detail=''",job.id(),job.version(),job.generation());jdbc.update("update resource_fts set body='' where id=?",job.id());});
            String kind=job.mime()==null?"":job.mime().equals("application/pdf")?"pdf":job.mime().startsWith("text/")||List.of("application/json","application/xml","application/javascript").contains(job.mime())?"text":"";
            FileTextProcess.Result result;String hash="";
            if(kind.isEmpty())result=new FileTextProcess.Result("unsupported","","Only PDF and UTF-8 text are supported");
            else if(job.size()>(kind.equals("pdf")?FileTextProcess.PDF_BYTES:FileTextProcess.TEXT_BYTES))result=new FileTextProcess.Result("limit-exceeded","","File byte limit exceeded");
            else {
                if(scratch==null||Files.isSymbolicLink(scratch))throw new IOException("File extraction storage unavailable");
                Files.createDirectories(scratch);
                Path copy=Files.createTempFile(scratch,"vaultor-file-text-",".input");
                try {
                    var digest=java.security.MessageDigest.getInstance("SHA-256");long count=0,limit=kind.equals("pdf")?FileTextProcess.PDF_BYTES:FileTextProcess.TEXT_BYTES;
                    try(var in=Files.newInputStream(storage.getFile(job.path()));var out=Files.newOutputStream(copy)){byte[] b=new byte[8192];int len;while((len=in.read(b))>=0){if((count+=len)>limit)throw new FileLimit();digest.update(b,0,len);out.write(b,0,len);}}
                    hash=HexFormat.of().formatHex(digest.digest());result=parse(copy,kind);
                }catch(FileLimit e){result=new FileTextProcess.Result("limit-exceeded","","File byte limit exceeded");}
                catch(Exception e){if(e instanceof InterruptedException)Thread.currentThread().interrupt();result=new FileTextProcess.Result("failed","","File extraction failed; retry from Diagnostics");}
                finally{Files.deleteIfExists(copy);}
            }
            publish(job,result,hash);failure="";
        }catch(Exception e){failure="File indexing paused by storage/database failure; retry from Diagnostics";if(active!=null)try{jdbc.update("update file_search set state='failed',detail='Storage or database failure; retry from Diagnostics' where id=? and version=? and generation=? and state='indexing'",active.id(),active.version(),active.generation());}catch(Exception ignored){}}
    }
    static class FileLimit extends IOException {}
    static boolean awaitBounded(Process process,long timeoutMillis)throws InterruptedException {
        if(process.waitFor(timeoutMillis,TimeUnit.MILLISECONDS))return true;
        process.destroyForcibly();process.waitFor();return false;
    }
    FileTextProcess.Result parse(Path copy,String kind)throws Exception {
        var args=new ArrayList<String>();args.add(Path.of(System.getProperty("java.home"),"bin",System.getProperty("os.name").startsWith("Windows")?"java.exe":"java").toString());args.add("-Xmx128m");args.add("-XX:MaxMetaspaceSize=96m");
        File home=new ApplicationHome(FileTextProcess.class).getSource();
        if(home!=null&&home.isFile()){args.add("-Dloader.main="+FileTextProcess.class.getName());args.add("-cp");args.add(home.getAbsolutePath());args.add("org.springframework.boot.loader.launch.PropertiesLauncher");}
        else{args.add("-cp");args.add(System.getProperty("java.class.path"));args.add(FileTextProcess.class.getName());}
        args.add(copy.toString());args.add(kind);
        Path output=Files.createTempFile(scratch,"vaultor-file-text-",".result");
        try {
            var builder=new ProcessBuilder(args).redirectError(ProcessBuilder.Redirect.DISCARD).redirectOutput(output.toFile());
            var environment=builder.environment();environment.clear();
            for(String key:List.of("SystemRoot","WINDIR","TEMP","TMP","TMPDIR","LANG")){String value=System.getenv(key);if(value!=null)environment.put(key,value);}
            child=builder.start();
            if(!awaitBounded(child,15000))return new FileTextProcess.Result("limit-exceeded","","Extraction time limit exceeded");
            if(child.exitValue()!=0)return new FileTextProcess.Result("failed","","Extractor failed; retry from Diagnostics");
            if(Files.size(output)>2_100_000)return new FileTextProcess.Result("limit-exceeded","","Extraction output limit exceeded");
            try(var in=new DataInputStream(Files.newInputStream(output))){String state=in.readUTF(),detail=in.readUTF();int length=in.readInt();if(length<0||length>2_000_000)throw new IOException("Invalid extractor result");byte[] bytes=in.readNBytes(length);if(bytes.length!=length)throw new IOException("Incomplete extractor result");return new FileTextProcess.Result(state,new String(bytes,java.nio.charset.StandardCharsets.UTF_8),detail);}
        }finally{var p=child;if(p!=null&&p.isAlive()){p.destroyForcibly();p.waitFor();}child=null;Files.deleteIfExists(output);}
    }
    void publish(Job job,FileTextProcess.Result result,String hash){
        gate.exclusive(()->transaction.executeWithoutResult(tx->{
            long current=jdbc.queryForObject("select count(*) from resources r where r.id=? and r.type='file' and r.trashed_at is null and "+VERSION+"=? and (select value from settings where key_name='workspace_generation')=?",Long.class,job.id(),job.version(),job.generation());
            if(current==0)return;
            int changed=jdbc.update("update file_search set state=?,body=?,hash=?,detail=? where id=? and version=? and generation=? and state='indexing'",result.state(),result.text(),hash,result.detail(),job.id(),job.version(),job.generation());
            if(changed>0)jdbc.update("update resource_fts set body=? where id=?",result.text(),job.id());
        }));
    }
}
