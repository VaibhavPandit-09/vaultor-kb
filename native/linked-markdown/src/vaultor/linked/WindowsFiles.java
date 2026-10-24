package vaultor.linked;

import java.io.IOException;
import java.lang.foreign.*;
import java.lang.invoke.MethodHandle;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.util.*;
import static java.lang.foreign.ValueLayout.*;

/** Windows x64 local-NTFS primitives. No ordinary Java path move/overwrite fallback. */
public final class WindowsFiles {
    static final int READ=0x80000000, WRITE=0x40000000, DELETE=0x10000, OPEN=3, NEW=1;
    static final int REPARSE=0x400, DIRECTORY=0x10;
    static final SymbolLookup KERNEL=SymbolLookup.libraryLookup("kernel32",Arena.global());
    static final SymbolLookup ADVAPI=SymbolLookup.libraryLookup("advapi32",Arena.global()),NTDLL=SymbolLookup.libraryLookup("ntdll",Arena.global());
    static final Linker LINKER=Linker.nativeLinker();
    static final Map<String,MethodHandle> CALLS=new HashMap<>();
    static final MemoryLayout ERRORS=Linker.Option.captureStateLayout();
    static final long ERROR_OFFSET=ERRORS.byteOffset(MemoryLayout.PathElement.groupElement("GetLastError"));
    public static final class NativeFailure extends IOException {
        public final int code;
        NativeFailure(String operation,int code){super(operation+":"+code);this.code=code;}
    }
    record Result(Object value,int error){}
    static synchronized MethodHandle function(String name,FunctionDescriptor descriptor){
        return CALLS.computeIfAbsent(name,n->LINKER.downcallHandle(KERNEL.find(n).or(()->ADVAPI.find(n)).or(()->NTDLL.find(n)).orElseThrow(),descriptor,Linker.Option.captureCallState("GetLastError")));
    }
    static Result invoke(String name,FunctionDescriptor descriptor,Object...args) throws IOException {
        try(var arena=Arena.ofConfined()){
            var state=arena.allocate(ERRORS);var values=new ArrayList<Object>();values.add(state);Collections.addAll(values,args);
            Object value=function(name,descriptor).invokeWithArguments(values);
            return new Result(value,state.get(JAVA_INT,ERROR_OFFSET));
        }catch(Throwable e){if(e instanceof IOException x)throw x;throw new IOException("NATIVE_CALL:"+name,e);}
    }
    static void wellFormedPath(String text)throws IOException{for(int i=0;i<text.length();i++){char c=text.charAt(i);if(Character.isHighSurrogate(c)){if(++i>=text.length()||!Character.isLowSurrogate(text.charAt(i)))throw new IOException("PATH_UNICODE_UNQUALIFIED");}else if(Character.isLowSurrogate(c))throw new IOException("PATH_UNICODE_UNQUALIFIED");}}
    static MemorySegment wide(Arena arena,String text)throws IOException{wellFormedPath(text);return arena.allocateFrom(text,StandardCharsets.UTF_16LE);}
    static void yes(String name,Result r)throws IOException{if((int)r.value()==0)throw new NativeFailure(name,r.error());}
    public static final class Handle implements AutoCloseable {
        final MemorySegment value; private boolean closed;
        Handle(MemorySegment value){this.value=value;}
        public void close()throws IOException{if(!closed){closed=true;yes("CloseHandle",invoke("CloseHandle",FunctionDescriptor.of(JAVA_INT,ADDRESS),value));}}
    }
    public record Info(int attributes,String identity,long size,int links){}
    static long handleCount()throws IOException{try(var arena=Arena.ofConfined()){var count=arena.allocate(JAVA_INT);yes("HandleCount",invoke("GetProcessHandleCount",FunctionDescriptor.of(JAVA_INT,ADDRESS,ADDRESS),MemorySegment.ofAddress(-1L),count));return Integer.toUnsignedLong(count.get(JAVA_INT,0));}}
    static long workingSet()throws IOException{try(var arena=Arena.ofConfined()){var info=arena.allocate(72,8);info.set(JAVA_INT,0,72);yes("ProcessMemory",invoke("K32GetProcessMemoryInfo",FunctionDescriptor.of(JAVA_INT,ADDRESS,ADDRESS,JAVA_INT),MemorySegment.ofAddress(-1L),info,72));return info.get(JAVA_LONG,16);}}
    static Handle open(Path path,int access,int sharing,int mode,boolean directory)throws IOException{
        try(var a=Arena.ofConfined()){
            var r=invoke("CreateFileW",FunctionDescriptor.of(ADDRESS,ADDRESS,JAVA_INT,JAVA_INT,ADDRESS,JAVA_INT,JAVA_INT,ADDRESS),wide(a,path.toString()),access,sharing,MemorySegment.NULL,mode,0x00200000|(directory?0x02000000:0),MemorySegment.NULL);
            var pointer=(MemorySegment)r.value();if(pointer.address()==-1L)throw new NativeFailure("CreateFile",r.error());
            var h=new Handle(pointer);try{var i=info(h);if((i.attributes()&REPARSE)!=0||directory!=((i.attributes()&DIRECTORY)!=0))throw new IOException("REPARSE_OR_TYPE");return h;}catch(IOException e){h.close();throw e;}
        }
    }
    /** One component only: no source path is reparsed from a mutable ancestor. */
    static Handle relative(Handle parent,String name,int access,int sharing,boolean directory)throws IOException{
        return relative(parent,name,access,sharing,directory,false);
    }
    private static Handle relative(Handle parent,String name,int access,int sharing,boolean directory,boolean asynchronous)throws IOException{
        wellFormedPath(name);
        if(name.isEmpty()||name.matches(".*[\\\\/:\\x00].*"))throw new IOException("RELATIVE_COMPONENT");
        try(var a=Arena.ofConfined()){
            byte[] utf16=name.getBytes(StandardCharsets.UTF_16LE);var string=a.allocate(16,8);string.set(JAVA_SHORT,0,(short)utf16.length);string.set(JAVA_SHORT,2,(short)utf16.length);string.set(ADDRESS,8,a.allocateFrom(JAVA_BYTE,utf16));
            var object=a.allocate(48,8);object.set(JAVA_INT,0,48);object.set(ADDRESS,8,parent.value);object.set(ADDRESS,16,string);object.set(JAVA_INT,24,0x40);
            var handle=a.allocate(ADDRESS);var status=a.allocate(16,8);
            var result=invoke("NtCreateFile",FunctionDescriptor.of(JAVA_INT,ADDRESS,JAVA_INT,ADDRESS,ADDRESS,ADDRESS,JAVA_INT,JAVA_INT,JAVA_INT,JAVA_INT,ADDRESS,JAVA_INT),handle,access|0x100000|0x80,object,status,MemorySegment.NULL,0,sharing,1,0x00200000|(asynchronous?0:0x20),MemorySegment.NULL,0);
            if((int)result.value()!=0){var partial=handle.get(ADDRESS,0);if(partial.address()!=0&&partial.address()!=-1L)invoke("CloseHandle",FunctionDescriptor.of(JAVA_INT,ADDRESS),partial);int error=(int)invoke("RtlNtStatusToDosError",FunctionDescriptor.of(JAVA_INT,JAVA_INT),(int)result.value()).value();throw new NativeFailure("OpenRelative",error);}
            var h=new Handle(handle.get(ADDRESS,0));try{var info=info(h);if((info.attributes()&REPARSE)!=0||directory!=((info.attributes()&DIRECTORY)!=0))throw new IOException("REPARSE_OR_TYPE");return h;}catch(IOException e){h.close();throw e;}
        }
    }
    public static Info info(Handle h)throws IOException{
        try(var a=Arena.ofConfined()){
            var out=a.allocate(56,8);yes("FileInformation",invoke("GetFileInformationByHandle",FunctionDescriptor.of(JAVA_INT,ADDRESS,ADDRESS),h.value,out));
            int attr=out.get(JAVA_INT,0),volume=out.get(JAVA_INT,28),high=out.get(JAVA_INT,44),low=out.get(JAVA_INT,48);
            long size=(Integer.toUnsignedLong(out.get(JAVA_INT,32))<<32)|Integer.toUnsignedLong(out.get(JAVA_INT,36));
            return new Info(attr,Integer.toUnsignedString(volume,16)+":"+Integer.toUnsignedString(high,16)+":"+Integer.toUnsignedString(low,16)+":"+Long.toUnsignedString(out.get(JAVA_LONG_UNALIGNED,4),16),size,out.get(JAVA_INT,40));
        }
    }
    public static Path canonical(Handle h)throws IOException{
        try(var a=Arena.ofConfined()){
            var buffer=a.allocate(65536,2);var r=invoke("GetFinalPathNameByHandleW",FunctionDescriptor.of(JAVA_INT,ADDRESS,ADDRESS,JAVA_INT,JAVA_INT),h.value,buffer,32768,0);
            int length=(int)r.value();if(length<=0||length>=32768)throw new NativeFailure("CanonicalPath",r.error());
            return Path.of(new String(buffer.asSlice(0,length*2L).toArray(JAVA_BYTE),StandardCharsets.UTF_16LE));
        }
    }
    public static void localNtfs(Path path)throws IOException{
        if(!System.getProperty("os.name").startsWith("Windows")||!Set.of("amd64","x86_64").contains(System.getProperty("os.arch"))||ADDRESS.byteSize()!=8)throw new IOException("WINDOWS_X64_ONLY");
        String root=path.toAbsolutePath().getRoot().toString();if(!root.matches("[A-Za-z]:\\\\"))throw new IOException("LOCAL_VOLUME_ONLY");
        try(var a=Arena.ofConfined()){
            var drive=invoke("GetDriveTypeW",FunctionDescriptor.of(JAVA_INT,ADDRESS),wide(a,root));if((int)drive.value()!=3)throw new IOException("FIXED_VOLUME_ONLY");
            var name=a.allocate(128,2);yes("VolumeInformation",invoke("GetVolumeInformationW",FunctionDescriptor.of(JAVA_INT,ADDRESS,ADDRESS,JAVA_INT,ADDRESS,ADDRESS,ADDRESS,ADDRESS,JAVA_INT),wide(a,root),MemorySegment.NULL,0,MemorySegment.NULL,MemorySegment.NULL,MemorySegment.NULL,name,64));
            if(!name.getString(0,StandardCharsets.UTF_16LE).equals("NTFS"))throw new IOException("NTFS_ONLY");
        }
    }
    /** Each ancestor is opened before its child, without delete sharing. */
    public static final class Pins implements AutoCloseable{
        final List<Handle> handles=new ArrayList<>();
        Path actual;
        Pins(Path directory)throws IOException{this(directory,false);}
        Pins(Path directory,boolean publication)throws IOException{
            Path absolute=directory.toAbsolutePath().normalize();localNtfs(absolute);Path current=absolute.getRoot();
            try{handles.add(open(current,publication?READ:0x80,publication?3:1,OPEN,true));ordinaryDirectory(handles.getLast());actual=canonical(handles.getLast());for(Path segment:absolute){current=current.resolve(segment);handles.add(relative(handles.getLast(),segment.toString(),publication?READ:0,publication?3:1,true));ordinaryDirectory(handles.getLast());Path child=canonical(handles.getLast());if(!child.toString().equalsIgnoreCase(actual.resolve(segment).toString()))throw new IOException("ANCESTOR_IDENTITY_CHANGED");actual=child;}}catch(IOException e){close();throw e;}
        }
        public Info last()throws IOException{return info(handles.getLast());}
        public Path canonicalPath(){return actual;}
        Handle handle(){return handles.getLast();}
        void verify()throws IOException{for(var h:handles)if((info(h).attributes()&REPARSE)!=0)throw new IOException("PINNED_DIRECTORY_BECAME_REPARSE");}
        public void close()throws IOException{IOException error=null;for(var h:handles.reversed())try{h.close();}catch(IOException e){error=e;}handles.clear();if(error!=null)throw error;}
    }
    public static Pins pin(Path directory)throws IOException{return new Pins(directory);}
    /** Read-data directory lease denies moves of an emptied publication parent.
     * Write sharing is necessary for our own rename target open. Reparse changes
     * are NOT prevented; checks and handle-relative operations remain mandatory. */
    static Pins pinPublication(Path directory)throws IOException{return new Pins(directory,true);}
    private static void ordinaryDirectory(Handle directory)throws IOException{try(var arena=Arena.ofConfined()){var flags=arena.allocate(JAVA_INT);yes("CaseSensitivityAdmission",invoke("GetFileInformationByHandleEx",FunctionDescriptor.of(JAVA_INT,ADDRESS,JAVA_INT,ADDRESS,JAVA_INT),directory.value,23,flags,4));if((flags.get(JAVA_INT,0)&1)!=0)throw new IOException("CASE_SENSITIVE_DIRECTORY_UNQUALIFIED");}}
    /** Notification requests are attached to an already confined directory, not
     * a pathname re-resolved by Java WatchService. Overflow is an invalidation.
     * Callers serialize poll/close; no event filenames leave this class. */
    static final class Notifications implements AutoCloseable {
        private static volatile boolean completionUncertain;
        private final Arena arena=Arena.ofShared();
        private final Handle directory;
        private final Handle event;
        private final MemorySegment buffer=arena.allocate(4096,4),overlapped=arena.allocate(32,8),count=arena.allocate(JAVA_INT);
        private boolean pending,closed;
        Notifications(Pins pins)throws IOException{
            if(completionUncertain){arena.close();throw new IOException("WATCH_RESTART_REQUIRED");}
            if(pins.handles.size()<2){arena.close();throw new IOException("VOLUME_WATCH_UNQUALIFIED");}
            Handle opened=null,created=null;
            try{
                opened=relative(pins.handles.get(pins.handles.size()-2),pins.canonicalPath().getFileName().toString(),1,7,true,true);
                if(!info(opened).identity().equals(pins.last().identity()))throw new IOException("WATCH_IDENTITY_CHANGED");
                var result=invoke("CreateEventW",FunctionDescriptor.of(ADDRESS,ADDRESS,JAVA_INT,JAVA_INT,ADDRESS),MemorySegment.NULL,1,0,MemorySegment.NULL);
                var pointer=(MemorySegment)result.value();if(pointer.address()==0)throw new NativeFailure("CreateEvent",result.error());
                created=new Handle(pointer);directory=opened;event=created;overlapped.set(ADDRESS,24,event.value);begin();
            }catch(IOException e){if(created!=null)created.close();if(opened!=null)opened.close();arena.close();throw e;}
        }
        private void begin()throws IOException{
            yes("ResetEvent",invoke("ResetEvent",FunctionDescriptor.of(JAVA_INT,ADDRESS),event.value));
            yes("ReadDirectoryChanges",invoke("ReadDirectoryChangesW",FunctionDescriptor.of(JAVA_INT,ADDRESS,ADDRESS,JAVA_INT,JAVA_INT,JAVA_INT,ADDRESS,ADDRESS,ADDRESS),directory.value,buffer,4096,0,0x11b,MemorySegment.NULL,overlapped,MemorySegment.NULL));
            pending=true;
        }
        boolean poll()throws IOException{
            if(closed)throw new IOException("WATCH_CLOSED");
            var wait=invoke("WaitForSingleObject",FunctionDescriptor.of(JAVA_INT,ADDRESS,JAVA_INT),event.value,0);
            if((int)wait.value()==258)return false;
            if((int)wait.value()!=0)throw new NativeFailure("WatchWait",wait.error());
            yes("WatchCompletion",invoke("GetOverlappedResult",FunctionDescriptor.of(JAVA_INT,ADDRESS,ADDRESS,ADDRESS,JAVA_INT),directory.value,overlapped,count,0));
            pending=false;begin();return true;
        }
        String identity()throws IOException{return info(directory).identity();}
        public void close()throws IOException{
            if(closed)return;closed=true;
            boolean drained=!pending;
            try{
                if(pending){
                    var cancel=invoke("CancelIoEx",FunctionDescriptor.of(JAVA_INT,ADDRESS,ADDRESS),directory.value,overlapped);
                    // Drain cancellation before freeing OVERLAPPED/buffer memory.
                    if((int)cancel.value()!=0||cancel.error()==1168)invoke("GetOverlappedResult",FunctionDescriptor.of(JAVA_INT,ADDRESS,ADDRESS,ADDRESS,JAVA_INT),directory.value,overlapped,count,1);
                    drained=overlapped.get(JAVA_LONG,0)!=0x103; // STATUS_PENDING
                    if(!drained)throw new IOException("WATCH_COMPLETION_UNCERTAIN_RESTART_REQUIRED");
                }
            }finally{
                // Fail closed on an unexpected kernel cancellation/completion
                // failure: never free memory still owned by an I/O request.
                // Retain this bounded allocation and deny new watches until restart.
                if(!drained)completionUncertain=true;
                try{directory.close();}finally{try{event.close();}finally{if(drained)arena.close();}}
            }
        }
    }
    /** Read+DELETE lease blocks other write/delete handles; own handle may rename. */
    public static Handle lease(Path path,boolean writable)throws IOException{
        var h=open(path,READ|(writable?DELETE:0),1,OPEN,false);
        try{var i=info(h);if(i.links()!=1)throw new IOException("SINGLE_LINK_ONLY");if((i.attributes()&~(0x20|0x80|1))!=0)throw new IOException("UNQUALIFIED_ATTRIBUTES");if(writable&&(i.attributes()&1)!=0)throw new IOException("READ_ONLY");streams(h);return h;}catch(IOException e){h.close();throw e;}
    }
    /** Gate3 alternative: preserve the original inode and all attached metadata.
     * Refuse competing readers/writers/delete handles and writable mappings. */
    static Handle exclusiveWriter(Handle parent,String name)throws IOException{
        if(!Boolean.getBoolean("vaultor.linked.g3.unsafe-publication-probe"))throw new IOException("G3_PUBLICATION_UNQUALIFIED");
        var h=relative(parent,name,READ|WRITE,0,false);
        try{var i=info(h);if(i.links()!=1||(i.attributes()&~(0x20|0x80))!=0)throw new IOException("UNQUALIFIED_WRITE_FILE");streams(h);requireImplicitLabel(h);return h;}catch(IOException e){h.close();throw e;}
    }
    private static void requireImplicitLabel(Handle handle)throws IOException{
        try(var arena=Arena.ofConfined()){
            var sacl=arena.allocate(ADDRESS);var descriptor=arena.allocate(ADDRESS);
            int status=(int)invoke("GetSecurityInfo",FunctionDescriptor.of(JAVA_INT,ADDRESS,JAVA_INT,JAVA_INT,ADDRESS,ADDRESS,ADDRESS,ADDRESS,ADDRESS),handle.value,1,0x10,MemorySegment.NULL,MemorySegment.NULL,MemorySegment.NULL,sacl,descriptor).value();
            if(status!=0)throw new NativeFailure("LabelAdmission",status);
            try{var label=sacl.get(ADDRESS,0);if(label.address()!=0&&Short.toUnsignedInt(label.reinterpret(8).get(JAVA_SHORT,4))>0)throw new IOException("EXPLICIT_INTEGRITY_LABEL_UNQUALIFIED");}finally{invoke("LocalFree",FunctionDescriptor.of(ADDRESS,ADDRESS),descriptor.get(ADDRESS,0));}
        }
    }
    /** Explicit recovery export: owner-only CREATE_NEW relative to a consented
     * directory. It does not need journal quota or admit arbitrary source Save. */
    static Handle createPrivateRelative(Handle parent,String name)throws IOException{
        wellFormedPath(name);
        if(name.isEmpty()||name.matches(".*[\\\\/:\\x00].*"))throw new IOException("RELATIVE_COMPONENT");
        try(var arena=Arena.ofConfined()){
            var descriptor=arena.allocate(ADDRESS);
            yes("ExportSecurity",invoke("ConvertStringSecurityDescriptorToSecurityDescriptorW",FunctionDescriptor.of(JAVA_INT,ADDRESS,JAVA_INT,ADDRESS,ADDRESS),wide(arena,"D:P(A;;FA;;;OW)"),1,descriptor,MemorySegment.NULL));
            var security=descriptor.get(ADDRESS,0);
            try{
                byte[] encoded=name.getBytes(StandardCharsets.UTF_16LE);var string=arena.allocate(16,8);string.set(JAVA_SHORT,0,(short)encoded.length);string.set(JAVA_SHORT,2,(short)encoded.length);string.set(ADDRESS,8,arena.allocateFrom(JAVA_BYTE,encoded));
                var object=arena.allocate(48,8);object.set(JAVA_INT,0,48);object.set(ADDRESS,8,parent.value);object.set(ADDRESS,16,string);object.set(JAVA_INT,24,0x40);object.set(ADDRESS,32,security);
                var handle=arena.allocate(ADDRESS);var status=arena.allocate(16,8);
                int result=(int)invoke("NtCreateFile",FunctionDescriptor.of(JAVA_INT,ADDRESS,JAVA_INT,ADDRESS,ADDRESS,ADDRESS,JAVA_INT,JAVA_INT,JAVA_INT,JAVA_INT,ADDRESS,JAVA_INT),handle,READ|WRITE|0x100000,object,status,MemorySegment.NULL,0,0,2,0x00200000|0x20,MemorySegment.NULL,0).value();
                if(result!=0){var partial=handle.get(ADDRESS,0);if(partial.address()!=0&&partial.address()!=-1L)invoke("CloseHandle",FunctionDescriptor.of(JAVA_INT,ADDRESS),partial);throw new NativeFailure("ExportCreateNew",(int)invoke("RtlNtStatusToDosError",FunctionDescriptor.of(JAVA_INT,JAVA_INT),result).value());}
                var opened=new Handle(handle.get(ADDRESS,0));try{var info=info(opened);if((info.attributes()&(REPARSE|DIRECTORY))!=0||info.links()!=1)throw new IOException("EXPORT_TYPE");return opened;}catch(IOException e){opened.close();throw e;}
            }finally{invoke("LocalFree",FunctionDescriptor.of(ADDRESS,ADDRESS),security);}
        }
    }
    static byte[] readStart(Handle h,int limit)throws IOException{
        yes("Seek",invoke("SetFilePointerEx",FunctionDescriptor.of(JAVA_INT,ADDRESS,JAVA_LONG,ADDRESS,JAVA_INT),h.value,0L,MemorySegment.NULL,0));return read(h,limit);
    }
    static void overwrite(Handle h,byte[] data,Boundary chunk,Boundary beforeFlush)throws IOException{
        yes("Seek",invoke("SetFilePointerEx",FunctionDescriptor.of(JAVA_INT,ADDRESS,JAVA_LONG,ADDRESS,JAVA_INT),h.value,0L,MemorySegment.NULL,0));
        try(var arena=Arena.ofConfined()){
            var bytes=arena.allocateFrom(JAVA_BYTE,data);var count=arena.allocate(JAVA_INT);int offset=0;
            while(offset<data.length){yes("WriteOriginal",invoke("WriteFile",FunctionDescriptor.of(JAVA_INT,ADDRESS,ADDRESS,JAVA_INT,ADDRESS,ADDRESS),h.value,bytes.asSlice(offset),Math.min(4096,data.length-offset),count,MemorySegment.NULL));int written=count.get(JAVA_INT,0);if(written<=0)throw new IOException("SHORT_WRITE");offset+=written;chunk.run();}
            yes("SetEndOfFile",invoke("SetEndOfFile",FunctionDescriptor.of(JAVA_INT,ADDRESS),h.value));beforeFlush.run();
            yes("FlushOriginal",invoke("FlushFileBuffers",FunctionDescriptor.of(JAVA_INT,ADDRESS),h.value));
        }
    }
    static Handle leaseRelative(Handle parent,String name,boolean writable)throws IOException{
        var h=relative(parent,name,READ|(writable?DELETE:0),1,false);
        try{var i=info(h);if(i.links()!=1)throw new IOException("SINGLE_LINK_ONLY");if((i.attributes()&~(0x20|0x80|1))!=0)throw new IOException("UNQUALIFIED_ATTRIBUTES");if(writable&&(i.attributes()&1)!=0)throw new IOException("READ_ONLY");streams(h);return h;}catch(IOException e){h.close();throw e;}
    }
    static Handle stageLease(Path path)throws IOException{return open(path,READ|DELETE|0x40000|0x80000|0x100,1,OPEN,false);}
    static void streams(Handle h)throws IOException{
        try(var a=Arena.ofConfined()){
            var b=a.allocate(65536,8);yes("StreamInformation",invoke("GetFileInformationByHandleEx",FunctionDescriptor.of(JAVA_INT,ADDRESS,JAVA_INT,ADDRESS,JAVA_INT),h.value,7,b,65536));
            int p=0;do{int next=b.get(JAVA_INT,p),length=b.get(JAVA_INT,p+4);if(length<0||p+24+length>65536)throw new IOException("STREAM_INFORMATION_LIMIT");String name=new String(b.asSlice(p+24,length).toArray(JAVA_BYTE),StandardCharsets.UTF_16LE);if(!name.equals("::$DATA"))throw new IOException("ALTERNATE_STREAM");if(next==0)break;if(next<24)throw new IOException("STREAM_INFORMATION");p+=next;}while(p<65536);
        }
    }
    public static byte[] read(Handle h,int limit)throws IOException{
        long size=info(h).size();if(size<0||size>limit)throw new IOException("FILE_SIZE_LIMIT");
        try(var a=Arena.ofConfined()){
            MemorySegment bytes=a.allocate(Math.max(1,size)),count=a.allocate(JAVA_INT);int offset=0;
            while(offset<size){yes("ReadFile",invoke("ReadFile",FunctionDescriptor.of(JAVA_INT,ADDRESS,ADDRESS,JAVA_INT,ADDRESS,ADDRESS),h.value,bytes.asSlice(offset),(int)size-offset,count,MemorySegment.NULL));int n=count.get(JAVA_INT,0);if(n<=0)throw new IOException("SHORT_READ");offset+=n;}
            return bytes.asSlice(0,size).toArray(JAVA_BYTE);
        }
    }
    public static byte[] readRange(Handle h,long offset,int length)throws IOException{
        long size=info(h).size();if(offset>size)throw new IOException("CHUNK_RANGE");
        yes("SetFilePointer",invoke("SetFilePointerEx",FunctionDescriptor.of(JAVA_INT,ADDRESS,JAVA_LONG,ADDRESS,JAVA_INT),h.value,offset,MemorySegment.NULL,0));
        int wanted=(int)Math.min(length,size-offset);if(wanted==0)return new byte[0];
        try(var a=Arena.ofConfined()){
            var bytes=a.allocate(wanted);var count=a.allocate(JAVA_INT);
            yes("ReadFile",invoke("ReadFile",FunctionDescriptor.of(JAVA_INT,ADDRESS,ADDRESS,JAVA_INT,ADDRESS,ADDRESS),h.value,bytes,wanted,count,MemorySegment.NULL));
            return bytes.asSlice(0,count.get(JAVA_INT,0)).toArray(JAVA_BYTE);
        }
    }
    public static void createFlushed(Path path,byte[] data)throws IOException{
        createFlushed(path,data,()->{},()->{});
    }
    @FunctionalInterface public interface Boundary {void run()throws IOException;}
    public static void createFlushed(Path path,byte[] data,Boundary chunk,Boundary beforeFlush)throws IOException{
        try(var h=open(path,WRITE,0,NEW,false);var a=Arena.ofConfined()){
            // Restrict the new empty inode before writing any private bytes.
            LinkedStore.privateAcl(path);
            MemorySegment bytes=a.allocateFrom(JAVA_BYTE,data),count=a.allocate(JAVA_INT);int offset=0;
            while(offset<data.length){yes("WriteFile",invoke("WriteFile",FunctionDescriptor.of(JAVA_INT,ADDRESS,ADDRESS,JAVA_INT,ADDRESS,ADDRESS),h.value,bytes.asSlice(offset),Math.min(4096,data.length-offset),count,MemorySegment.NULL));int n=count.get(JAVA_INT,0);if(n<=0)throw new IOException("SHORT_WRITE");offset+=n;chunk.run();}
            beforeFlush.run();
            yes("FlushFileBuffers",invoke("FlushFileBuffers",FunctionDescriptor.of(JAVA_INT,ADDRESS),h.value));
        }
    }
    static Info attributes(Path path)throws IOException{try(var h=open(path,0,7,OPEN,false)){return info(h);}}
    static void renameExclusive(Handle source,Handle directory,String name)throws IOException{
        wellFormedPath(name);
        if(name.isEmpty()||name.matches(".*[\\\\/:\\x00].*"))throw new IOException("RELATIVE_COMPONENT");
        byte[] encoded=name.getBytes(StandardCharsets.UTF_16LE);try(var a=Arena.ofConfined()){
            var data=a.allocate(24+encoded.length,8);data.set(JAVA_INT,0,0);data.set(ADDRESS,8,directory.value);data.set(JAVA_INT,16,encoded.length);MemorySegment.copy(encoded,0,data,JAVA_BYTE,20,encoded.length);
            var status=a.allocate(16,8);int result=(int)invoke("NtSetInformationFile",FunctionDescriptor.of(JAVA_INT,ADDRESS,ADDRESS,ADDRESS,JAVA_INT,JAVA_INT),source.value,status,data,(int)data.byteSize(),10).value();
            if(result!=0){int error=(int)invoke("RtlNtStatusToDosError",FunctionDescriptor.of(JAVA_INT,JAVA_INT),result).value();throw new NativeFailure("RenameRelativeExclusive",error);}
        }
    }
    record Security(byte[] owner,byte[] dacl,boolean protectedDacl){}
    static Security security(Handle h)throws IOException{
        try(var a=Arena.ofConfined()){
            var owner=a.allocate(ADDRESS);var dacl=a.allocate(ADDRESS);var descriptor=a.allocate(ADDRESS);
            int status=(int)invoke("GetSecurityInfo",FunctionDescriptor.of(JAVA_INT,ADDRESS,JAVA_INT,JAVA_INT,ADDRESS,ADDRESS,ADDRESS,ADDRESS,ADDRESS),h.value,1,5,owner,MemorySegment.NULL,dacl,MemorySegment.NULL,descriptor).value();if(status!=0)throw new NativeFailure("GetSecurityInfo",status);
            var sd=descriptor.get(ADDRESS,0);try{
                var sid=owner.get(ADDRESS,0);int sidSize=(int)invoke("GetLengthSid",FunctionDescriptor.of(JAVA_INT,ADDRESS),sid).value();if(sidSize<8||sidSize>256)throw new IOException("SID_LENGTH");
                var acl=dacl.get(ADDRESS,0);if(acl.address()==0)throw new IOException("NULL_DACL_UNQUALIFIED");int size=Short.toUnsignedInt(acl.reinterpret(8).get(JAVA_SHORT,2));if(size<8)throw new IOException("ACL_LENGTH");
                var control=a.allocate(JAVA_SHORT);var revision=a.allocate(JAVA_INT);yes("GetSecurityDescriptorControl",invoke("GetSecurityDescriptorControl",FunctionDescriptor.of(JAVA_INT,ADDRESS,ADDRESS,ADDRESS),sd,control,revision));
                return new Security(sid.reinterpret(sidSize).toArray(JAVA_BYTE),acl.reinterpret(size).toArray(JAVA_BYTE),(control.get(JAVA_SHORT,0)&0x1000)!=0);
            }finally{invoke("LocalFree",FunctionDescriptor.of(ADDRESS,ADDRESS),sd);}
        }
    }
    static void copyMetadata(Handle source,Handle target)throws IOException{
        var security=security(source);try(var a=Arena.ofConfined()){
            int flags=5|(security.protectedDacl()?0x80000000:0x20000000);
            int status=(int)invoke("SetSecurityInfo",FunctionDescriptor.of(JAVA_INT,ADDRESS,JAVA_INT,JAVA_INT,ADDRESS,ADDRESS,ADDRESS,ADDRESS),target.value,1,flags,a.allocateFrom(JAVA_BYTE,security.owner()),MemorySegment.NULL,a.allocateFrom(JAVA_BYTE,security.dacl()),MemorySegment.NULL).value();if(status!=0)throw new NativeFailure("SetSecurityInfo",status);
            var original=a.allocate(40,8);yes("BasicInfo",invoke("GetFileInformationByHandleEx",FunctionDescriptor.of(JAVA_INT,ADDRESS,JAVA_INT,ADDRESS,JAVA_INT),source.value,0,original,40));
            var basic=a.allocate(40,8);basic.set(JAVA_LONG,0,original.get(JAVA_LONG,0));basic.set(JAVA_INT,32,original.get(JAVA_INT,32));yes("SetBasicInfo",invoke("SetFileInformationByHandle",FunctionDescriptor.of(JAVA_INT,ADDRESS,JAVA_INT,ADDRESS,JAVA_INT),target.value,0,basic,40));
        }
    }
}
