package vaultor.linked;

import java.io.*;
import java.lang.foreign.*;
import java.lang.invoke.MethodHandle;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.util.*;
import static java.lang.foreign.ValueLayout.*;

/** Ordinary local APFS primitives. All source traversal uses no-follow openat.
 * POSIX does not deny unrelated writers: capture is revalidated and retained. */
public final class NativeFiles {
    static final int READ=0x80000000,WRITE=0x40000000,DELETE=0x10000,OPEN=3,NEW=1,REPARSE=0x400,DIRECTORY=0x10;
    static final Linker LINKER=Linker.nativeLinker();
    static final SymbolLookup LIB=SymbolLookup.libraryLookup(Path.of(System.getProperty("vaultor.linked.library")),Arena.global());
    static final Map<String,MethodHandle> CALLS=new HashMap<>();
    static boolean supported(){return System.getProperty("os.name").startsWith("Mac")&&Set.of("aarch64","arm64").contains(System.getProperty("os.arch"));}
    public static final class NativeFailure extends IOException {public final int code;NativeFailure(String op,int code){super(op+":"+code);this.code=code;}}
    static synchronized MethodHandle function(String name,MemoryLayout...types){return CALLS.computeIfAbsent(name,n->LINKER.downcallHandle(LIB.find(n).orElseThrow(),FunctionDescriptor.of(JAVA_INT,types)));}
    static int call(String name,MemoryLayout[] types,Object...args)throws IOException{
        try{int n=(int)function(name,types).invokeWithArguments(args);if(n<0)throw new NativeFailure(name,-n);return n;}catch(Throwable e){if(e instanceof IOException x)throw x;throw new IOException("MAC_NATIVE_CALL:"+name,e);}
    }
    static void component(String name)throws IOException{if(name.isEmpty()||name.equals(".")||name.equals("..")||name.contains("/")||name.contains("\0")||!StandardCharsets.UTF_8.newEncoder().canEncode(name))throw new IOException("RELATIVE_COMPONENT");}
    public static final class Handle implements AutoCloseable {
        final int fd;Handle parent;String name;boolean closed;Pins ownedPins;
        Handle(int fd,Handle parent,String name){this.fd=fd;this.parent=parent;this.name=name;}
        public void close()throws IOException{if(!closed){closed=true;try{call("vf_close",new MemoryLayout[]{JAVA_INT},fd);}finally{if(ownedPins!=null)ownedPins.close();}}}
    }
    public record Info(int attributes,String identity,long size,int links,long modified){}
    record DirectoryEntry(String name,int attributes,long size,long modified,String identity){}
    record Security(byte[] owner,byte[] dacl,boolean protectedDacl){}
    static long[] stat(Handle h)throws IOException{if(h.closed)throw new IOException("HANDLE_CLOSED");try(var a=Arena.ofConfined()){var out=a.allocate(12*8,8);call("vf_stat",new MemoryLayout[]{JAVA_INT,ADDRESS},h.fd,out);return out.toArray(JAVA_LONG);}}
    public static Info info(Handle h)throws IOException{var s=stat(h);int mode=(int)s[10];return new Info((mode&0170000)==0040000?DIRECTORY:((mode&0200)==0?1:0),volume(h)[0].substring(5)+":"+Long.toUnsignedString(s[1],16)+":"+s[2]+":"+s[3],s[4],(int)s[5],s[6]*1000000000L+s[7]);}
    static Security security(Handle h)throws IOException{var s=stat(h);return new Security(LinkedStore.utf8("uid:"+s[8]),LinkedStore.utf8(s[9]+":"+(s[10]&07777)+":"+s[11]),true);}
    static Handle raw(Handle parent,String name,int access,int mode,boolean directory)throws IOException{
        try(var a=Arena.ofConfined()){return new Handle(call("vf_open",new MemoryLayout[]{JAVA_INT,ADDRESS,JAVA_INT,JAVA_INT,JAVA_INT},parent==null?-2:parent.fd,a.allocateFrom(name),(access&WRITE)!=0?1:0,mode==NEW?1:0,directory?1:0),parent,name);}
    }
    static Handle relative(Handle parent,String name,int access,int sharing,boolean directory)throws IOException{component(name);return raw(parent,name,access,OPEN,directory);}
    static Handle open(Path path,int access,int sharing,int mode,boolean directory)throws IOException{
        Path absolute=path.toAbsolutePath().normalize();if(absolute.getParent()==null)return raw(null,"/",access,mode,directory);
        // Retain the parent chain for handle-relative rename until file closure.
        var pins=pin(absolute.getParent());try{var h=raw(pins.handle(),absolute.getFileName().toString(),access,mode,directory);h.ownedPins=pins;return h;}catch(IOException e){pins.close();throw e;}
    }
    public static Path canonical(Handle h)throws IOException{try(var a=Arena.ofConfined()){var out=a.allocate(1024);call("vf_path",new MemoryLayout[]{JAVA_INT,ADDRESS},h.fd,out);return Path.of(out.getString(0));}}
    static String[] volume(Handle h)throws IOException{try(var a=Arena.ofConfined()){var id=a.allocate(37);var mount=a.allocate(1024);call("vf_volume",new MemoryLayout[]{JAVA_INT,ADDRESS,ADDRESS},h.fd,id,mount);return new String[]{"apfs:"+id.getString(0),mount.getString(0)};}}
    static Path existing(Path path)throws IOException{Path p=path.toAbsolutePath().normalize();while(!Files.exists(p,LinkOption.NOFOLLOW_LINKS)){p=p.getParent();if(p==null)throw new IOException("SOURCE_VOLUME_UNAVAILABLE");}return p;}
    static String[] volume(Path path)throws IOException{Path p=existing(path);try(var pins=pin(p.toFile().isDirectory()?p:p.getParent())){return volume(pins.handle());}}
    public static void localFilesystem(Path path)throws IOException{volume(path);}
    public static String volumeIdentity(Path path)throws IOException{return volume(path)[0];}
    static Path volumeRoot(Path path)throws IOException{return Path.of(volume(path)[1]);}
    static Path mountedVolume(String id)throws IOException{
        var candidates=new ArrayList<Path>();candidates.add(Path.of("/"));candidates.add(Path.of(System.getProperty("user.home")));Path volumes=Path.of("/Volumes");
        try(var items=Files.list(volumes)){candidates.addAll(items.limit(32).toList());}
        for(Path p:candidates)try{var v=volume(p);if(v[0].equals(id))return Path.of(v[1]);}catch(IOException ignored){}
        throw new IOException("SOURCE_VOLUME_UNAVAILABLE");
    }
    static Path locateRoot(Path original,String id)throws IOException{
        try{if(volumeIdentity(original).equals(id))return original;}catch(IOException ignored){}
        // Only remap an external mount's suffix. Internal APFS firmlinks keep
        // their persisted pathname; a different volume can never inherit it.
        Path prefix=Path.of("/Volumes");if(original.startsWith(prefix)&&original.getNameCount()>2)return mountedVolume(id).resolve(original.subpath(2,original.getNameCount()));
        throw new IOException("SOURCE_VOLUME_UNAVAILABLE");
    }
    public static final class Pins implements AutoCloseable {
        final List<Handle> handles=new ArrayList<>();final List<Path> paths=new ArrayList<>();Path actual;
        Pins(Path directory)throws IOException{
            Path absolute=directory.toAbsolutePath().normalize();try{
                Handle h=raw(null,"/",READ,OPEN,true);handles.add(h);paths.add(Path.of("/"));actual=Path.of("/");
                for(Path segment:absolute){h=relative(h,segment.toString(),READ,7,true);handles.add(h);actual=actual.resolve(segment);paths.add(actual);if(!canonical(h).equals(actual))throw new IOException("ANCESTOR_ALIAS_UNQUALIFIED");}
                volume(handle());
            }catch(IOException e){close();throw e;}
        }
        public Info last()throws IOException{return info(handle());}public Path canonicalPath(){return actual;}Handle handle(){return handles.getLast();}
        void verify()throws IOException{for(int i=0;i<handles.size();i++)if(!canonical(handles.get(i)).equals(paths.get(i)))throw new IOException("ANCESTOR_IDENTITY_CHANGED");}
        public void close()throws IOException{IOException error=null;for(var h:handles.reversed())try{h.close();}catch(IOException e){error=e;}handles.clear();if(error!=null)throw error;}
    }
    public static Pins pin(Path path)throws IOException{return new Pins(path);}static Pins pinPublication(Path path)throws IOException{return pin(path);}
    static List<DirectoryEntry> entries(Handle directory,int maximum)throws IOException{
        byte[] bytes;int n;try(var a=Arena.ofConfined()){var out=a.allocate(16*1024*1024);n=call("vf_entries",new MemoryLayout[]{JAVA_INT,ADDRESS,JAVA_INT},directory.fd,out,16*1024*1024);bytes=out.asSlice(0,n).toArray(JAVA_BYTE);}
        var result=new ArrayList<DirectoryEntry>();int start=0;for(int i=0;i<n;i++)if(bytes[i]==0){String name=new String(bytes,start,i-start,StandardCharsets.UTF_8);if(!Arrays.equals(name.getBytes(StandardCharsets.UTF_8),Arrays.copyOfRange(bytes,start,i)))throw new IOException("PATH_ENCODING_UNQUALIFIED");start=i+1;
            try(var child=relative(directory,name,READ,7,true)){var s=info(child);result.add(new DirectoryEntry(name,DIRECTORY,s.size(),s.modified(),s.identity()));}
            catch(IOException e){try(var child=relative(directory,name,READ,7,false)){var s=info(child);result.add(new DirectoryEntry(name,s.attributes(),s.size(),s.modified(),s.identity()));}catch(IOException unsupported){result.add(new DirectoryEntry(name,REPARSE,0,0,"unsupported:"+name));}}
            if(result.size()>=maximum)break;
        }return result;
    }
    static final class Notifications implements AutoCloseable {
        final Pins pins;final int queue;Notifications(Pins source)throws IOException{pins=pin(source.canonicalPath());queue=call("vf_watch",new MemoryLayout[]{JAVA_INT},pins.handle().fd);}
        boolean poll()throws IOException{return call("vf_poll",new MemoryLayout[]{JAVA_INT},queue)>0;}String identity()throws IOException{return pins.last().identity();}
        public void close()throws IOException{try{call("vf_close",new MemoryLayout[]{JAVA_INT},queue);}finally{pins.close();}}
    }
    static void admit(Handle h)throws IOException{call("vf_admit",new MemoryLayout[]{JAVA_INT},h.fd);}
    public static Handle lease(Path path,boolean writable)throws IOException{var h=open(path,READ,1,OPEN,false);try{if(writable)admit(h);return h;}catch(IOException e){h.close();throw e;}}
    static Handle leaseRelative(Handle parent,String name,boolean writable)throws IOException{var h=relative(parent,name,READ,1,false);try{if(writable)admit(h);return h;}catch(IOException e){h.close();throw e;}}
    static Handle stageLease(Path path)throws IOException{return open(path,READ|WRITE,1,OPEN,false);}
    static Handle exclusiveWriter(Handle parent,String name)throws IOException{throw new IOException("IN_PLACE_PUBLICATION_UNQUALIFIED");}
    static Handle createPrivateRelative(Handle parent,String name)throws IOException{component(name);try{return raw(parent,name,READ|WRITE,NEW,false);}catch(NativeFailure e){throw new IOException("ExportCreateNew:"+e.code,e);}}
    static void probeParentWrite(Handle parent,String operation)throws IOException{String name=".vaultor-recovery-probe-"+operation;try(var h=createPrivateRelative(parent,name)){}try(var a=Arena.ofConfined()){call("vf_unlink",new MemoryLayout[]{JAVA_INT,ADDRESS},parent.fd,a.allocateFrom(name));}}
    static void privatePermissions(Path path)throws IOException{boolean directory=Files.isDirectory(path,LinkOption.NOFOLLOW_LINKS);try(var parent=pin(path.getParent());var h=relative(parent.handle(),path.getFileName().toString(),READ,7,directory)){call("vf_private",new MemoryLayout[]{JAVA_INT,JAVA_INT},h.fd,directory?1:0);}}
    static void checkPrivatePermissions(Path path)throws IOException{try(var pins=pin(path)){call("vf_check_private",new MemoryLayout[]{JAVA_INT},pins.handle().fd);}}
    public static byte[] read(Handle h,int limit)throws IOException{return readStart(h,limit);}
    static byte[] readStart(Handle h,int limit)throws IOException{long size=info(h).size();if(size<0||size>limit)throw new IOException("FILE_SIZE_LIMIT");return readRange(h,0,(int)size);}
    public static byte[] readRange(Handle h,long offset,int length)throws IOException{
        int wanted=(int)Math.min(length,Math.max(0,info(h).size()-offset));if(wanted==0)return new byte[0];
        try(var a=Arena.ofConfined()){var out=a.allocate(wanted);int at=0;while(at<wanted){int n=call("vf_read",new MemoryLayout[]{JAVA_INT,ADDRESS,JAVA_INT,JAVA_LONG},h.fd,out.asSlice(at),wanted-at,offset+at);if(n==0)throw new IOException("SHORT_READ");at+=n;}return out.toArray(JAVA_BYTE);}
    }
    @FunctionalInterface public interface Boundary{void run()throws IOException;}
    static void overwrite(Handle h,byte[] data,Boundary chunk,Boundary flush)throws IOException{try(var a=Arena.ofConfined()){var bytes=a.allocateFrom(JAVA_BYTE,data);int at=0;while(at<data.length){int n=call("vf_write",new MemoryLayout[]{JAVA_INT,ADDRESS,JAVA_INT,JAVA_LONG},h.fd,bytes.asSlice(at),Math.min(4096,data.length-at),(long)at);if(n==0)throw new IOException("SHORT_WRITE");at+=n;chunk.run();}flush.run();call("vf_flush",new MemoryLayout[]{JAVA_INT,JAVA_LONG},h.fd,(long)data.length);}}
    public static void createFlushed(Path path,byte[] data)throws IOException{createFlushed(path,data,()->{},()->{});}
    public static void createFlushed(Path path,byte[] data,Boundary chunk,Boundary flush)throws IOException{try(var parent=pin(path.getParent());var h=createPrivateRelative(parent.handle(),path.getFileName().toString())){overwrite(h,data,chunk,flush);}}
    static Info attributes(Path path)throws IOException{try(var h=open(path,READ,7,OPEN,false)){return info(h);}}
    static void renameExclusive(Handle source,Handle directory,String name)throws IOException{
        component(name);if(source.parent==null)throw new IOException("SOURCE_PARENT_REQUIRED");
        try(var a=Arena.ofConfined()){call("vf_move",new MemoryLayout[]{JAVA_INT,JAVA_INT,ADDRESS,JAVA_INT,ADDRESS},source.fd,source.parent.fd,a.allocateFrom(source.name),directory.fd,a.allocateFrom(name));source.parent=directory;source.name=name;}
    }
    static void copyMetadata(Handle old,Handle fresh)throws IOException{PracticalMetadata.apply(PracticalMetadata.inspect(old),fresh,false);}
    static long handleCount(){return -1;}static long workingSet(){return -1;}
}
