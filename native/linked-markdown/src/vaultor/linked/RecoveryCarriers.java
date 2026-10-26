package vaultor.linked;

import java.io.*;
import java.nio.channels.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.util.*;

/** Source-local publication storage. Primary drafts remain available without
 * the source volume. Descriptors confer evidence access, never source authority.
 * Windows volume discovery is isolated from journal/publication coordination. */
final class RecoveryCarriers implements AutoCloseable {
    private record Carrier(String volume,String relative,String identity){}
    private record Lease(Path path,FileChannel channel,FileLock lock){}
    private final Path primary,catalog;
    private final byte[] marker;
    private final List<Path> protectedPaths;
    private final Map<String,Carrier> carriers=new LinkedHashMap<>();
    private final Map<String,Lease> leases=new HashMap<>();
    RecoveryCarriers(Path primary,LinkedStore.Scope scope,List<Path> protectedPaths)throws IOException{
        this.primary=primary;this.catalog=primary.getParent().resolve("carriers");
        this.marker=LinkedStore.utf8("G2-PRIVATE-STORE-1\n"+scope.workspace()+"\n"+scope.generation());
        this.protectedPaths=protectedPaths;
        if(Files.exists(catalog,LinkOption.NOFOLLOW_LINKS))try(var pins=NativeFiles.pin(catalog);var entries=Files.list(catalog)){
            for(Path file:entries.limit(9).toList()){
                if(carriers.size()>=8||!file.getFileName().toString().matches("[a-f0-9]{64}"))throw new IOException("CARRIER_CATALOG_INVALID");
                try(var h=NativeFiles.lease(file,false)){
                    String[] fields=new String(NativeFiles.read(h,8192),StandardCharsets.UTF_8).split("\n",-1);
                    if(fields.length!=3||!file.getFileName().toString().equals(LinkedStore.hash(LinkedStore.utf8(fields[0]))))throw new IOException("CARRIER_CATALOG_INVALID");
                    Path relative=Path.of(fields[1]);if(relative.isAbsolute()||relative.getNameCount()<1||fields[1].contains("..")||fields[1].contains(":"))throw new IOException("CARRIER_CATALOG_INVALID");
                    carriers.put(fields[0],new Carrier(fields[0],fields[1],fields[2]));
                }
            }
        }
    }
    private void outsideSource(Path carrier,Path source)throws IOException{
        if(carrier.startsWith(source)||source.startsWith(carrier)||source.getParent()==null)throw new IOException("CARRIER_UNSAFE_LOCATION");
        for(Path ancestor=carrier.getParent();ancestor!=null;ancestor=ancestor.getParent())if(Files.exists(ancestor.resolve(".git"),LinkOption.NOFOLLOW_LINKS))throw new IOException("CARRIER_IN_REPOSITORY");
        for(Path excluded:protectedPaths)if(carrier.startsWith(excluded)||excluded.startsWith(carrier))throw new IOException("CARRIER_UNSAFE_LOCATION");
    }
    Path forSource(Path source)throws IOException{
        String volume=NativeFiles.volumeIdentity(source);
        if(volume.equals(NativeFiles.volumeIdentity(primary)))return primary;
        Carrier known=carriers.get(volume);
        if(known!=null){Path path=locate(known);outsideSource(path,source);return path;}
        String account=Files.getOwner(primary).getName();
        Path path=NativeFiles.volumeRoot(source).resolve(".vaultor-recovery-"+LinkedStore.hash(LinkedStore.utf8(account)).substring(0,16)+"-"+LinkedStore.hash(LinkedStore.utf8(new String(marker,StandardCharsets.UTF_8)+primary)).substring(0,16));
        try{return provision(source,path);}catch(IOException e){throw new IOException("CARRIER_SETUP_REQUIRED",e);}
    }
    /** Called only from main-process signed folder selection; never a renderer path. */
    Path provision(Path source,Path path)throws IOException{
        path=path.toAbsolutePath().normalize();
        String volume=NativeFiles.volumeIdentity(source);
        if(!volume.equals(NativeFiles.volumeIdentity(path)))throw new IOException("CARRIER_VOLUME_MISMATCH");
        outsideSource(path,source);
        if(carriers.containsKey(volume))return locate(carriers.get(volume));
        if(carriers.size()>=8)throw new IOException("CARRIER_LIMIT");
        try(var parent=NativeFiles.pin(path.getParent())){
            if(!parent.canonicalPath().equals(path.getParent()))throw new IOException("CARRIER_ALIAS");
            // Never take over a pre-existing directory or rewrite its ACL.
            if(Files.exists(path,LinkOption.NOFOLLOW_LINKS))throw new IOException("CARRIER_LOCATION_EXISTS");
            Files.createDirectory(path);LinkedStore.privateAcl(path);
            try(var pins=NativeFiles.pin(path)){
                NativeFiles.createFlushed(path.resolve("store.marker"),marker);
                var carrier=new Carrier(volume,NativeFiles.volumeRoot(path).relativize(path).toString(),pins.last().identity());
                acquire(carrier,path);
                if(!Files.exists(catalog,LinkOption.NOFOLLOW_LINKS)){Files.createDirectory(catalog);LinkedStore.privateAcl(catalog);}
                try(var catalogPins=NativeFiles.pin(catalog)){
                    NativeFiles.createFlushed(catalog.resolve(LinkedStore.hash(LinkedStore.utf8(volume))),LinkedStore.utf8(volume+"\n"+carrier.relative()+"\n"+carrier.identity()));
                }
                carriers.put(volume,carrier);return path;
            }
        }
    }
    private void acquire(Carrier carrier,Path path)throws IOException{
        var existing=leases.get(carrier.volume());if(existing!=null&&existing.path().equals(path)&&existing.lock().isValid())return;
        if(existing!=null){existing.lock().release();existing.channel().close();leases.remove(carrier.volume());}
        var channel=FileChannel.open(path.resolve("owner.lock"),StandardOpenOption.CREATE,StandardOpenOption.WRITE);
        try{LinkedStore.privateAcl(path.resolve("owner.lock"));var lock=channel.tryLock();if(lock==null)throw new IOException("CARRIER_OWNER_LOCK");leases.put(carrier.volume(),new Lease(path,channel,lock));}
        catch(IOException|OverlappingFileLockException e){channel.close();throw new IOException("CARRIER_OWNER_LOCK",e);}
    }
    private Path locate(Carrier carrier)throws IOException{
        Path path=NativeFiles.mountedVolume(carrier.volume()).resolve(carrier.relative());
        try(var pins=NativeFiles.pin(path);var h=NativeFiles.lease(path.resolve("store.marker"),false)){
            if(!pins.last().identity().equals(carrier.identity())||!Arrays.equals(marker,NativeFiles.read(h,4096)))throw new IOException("CARRIER_IDENTITY_CHANGED");
            try(var original=NativeFiles.lease(primary.resolve("store.marker"),false)){
                if(!Arrays.equals(NativeFiles.security(original).owner(),NativeFiles.security(h).owner()))throw new IOException("CARRIER_OWNER_CHANGED");
            }
            var acl=Files.getFileAttributeView(path,java.nio.file.attribute.AclFileAttributeView.class,LinkOption.NOFOLLOW_LINKS);
            var owner=Files.getOwner(path,LinkOption.NOFOLLOW_LINKS);
            if(System.getProperty("os.name").startsWith("Mac"))NativeFiles.checkPrivatePermissions(path);else if(acl==null||acl.getAcl().stream().anyMatch(entry->entry.type()==java.nio.file.attribute.AclEntryType.ALLOW&&!entry.principal().equals(owner)))throw new IOException("CARRIER_PERMISSIONS_CHANGED");
            acquire(carrier,path);return path;
        }
    }
    List<Path> available()throws IOException{
        var result=new ArrayList<Path>();result.add(primary);
        for(Carrier carrier:carriers.values())try{result.add(locate(carrier));}catch(IOException ignored){/* Retain descriptor/evidence; no automatic replacement. */}
        return result;
    }
    Path operation(String id)throws IOException{
        try{if(!UUID.fromString(id).toString().equals(id))throw new IllegalArgumentException();}catch(Exception e){throw new IOException("OPERATION_ID");}
        Path found=null;
        for(Path root:available())if(Files.exists(root.resolve(id),LinkOption.NOFOLLOW_LINKS)){
            if(found!=null)throw new IOException("RECOVERY_OPERATION_AMBIGUOUS");found=root.resolve(id);
        }
        if(found==null)throw new IOException("RECOVERY_VOLUME_UNAVAILABLE");return found;
    }
    public void close()throws IOException{for(Lease lease:leases.values())try{lease.lock().release();}finally{lease.channel().close();}leases.clear();}
}
