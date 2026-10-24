package vaultor.linked;

import java.lang.foreign.*;
import java.nio.file.*;
import java.util.concurrent.TimeUnit;
import static java.lang.foreign.ValueLayout.*;

/** Isolated experiment, not a writer or production lock implementation. */
public final class OplockProbe extends SafetyTests {
    public static void main(String[] args)throws Exception {
        Path dir=Files.createTempDirectory(Path.of("native/linked-markdown/.scratch"),"oplock-").toAbsolutePath();
        Path file=dir.resolve("source.md"),alias=dir.resolve("alias.md");Files.writeString(file,"Base");
        try(var arena=Arena.ofConfined();var parent=WindowsFiles.pin(dir)) {
            // OPEN_REPARSE_POINT | OVERLAPPED; the source parent is pinned and this
            // probe only uses a freshly created disposable file.
            var opened=WindowsFiles.invoke("CreateFileW",FunctionDescriptor.of(ADDRESS,ADDRESS,JAVA_INT,JAVA_INT,ADDRESS,JAVA_INT,JAVA_INT,ADDRESS),WindowsFiles.wide(arena,file.toString()),WindowsFiles.READ|WindowsFiles.WRITE,0,MemorySegment.NULL,3,0x40200000,MemorySegment.NULL);
            var pointer=(MemorySegment)opened.value();if(pointer.address()==-1)throw new Exception("open:"+opened.error());
            var event=(MemorySegment)WindowsFiles.invoke("CreateEventW",FunctionDescriptor.of(ADDRESS,ADDRESS,JAVA_INT,JAVA_INT,ADDRESS),MemorySegment.NULL,1,0,MemorySegment.NULL).value();
            var in=arena.allocate(12,4);in.set(JAVA_SHORT,0,(short)1);in.set(JAVA_SHORT,2,(short)12);in.set(JAVA_INT,4,7);in.set(JAVA_INT,8,1);
            var out=arena.allocate(24,8);var overlapped=arena.allocate(32,8);overlapped.set(ADDRESS,24,event);var count=arena.allocate(JAVA_INT);
            Process child=null;
            try {
                var requested=WindowsFiles.invoke("DeviceIoControl",FunctionDescriptor.of(JAVA_INT,ADDRESS,JAVA_INT,ADDRESS,JAVA_INT,ADDRESS,JAVA_INT,ADDRESS,ADDRESS),pointer,0x90240,in,12,out,24,MemorySegment.NULL,overlapped);
                System.out.println("request="+requested.value()+" error="+requested.error());
                require((int)requested.value()==0&&requested.error()==997);
                child=process("vaultor.linked.Adversary","hardlink",java.util.Base64.getEncoder().encodeToString(LinkedStore.utf8(alias.toString())),java.util.Base64.getEncoder().encodeToString(LinkedStore.utf8(file.toString())));
                boolean completed=child.waitFor(1500,TimeUnit.MILLISECONDS);
                System.out.println("hardlink completed before release="+completed+" alias exists="+Files.exists(alias)+" output flags="+out.get(JAVA_INT,12));
                require(completed&&child.exitValue()==0&&Files.exists(alias));
                var bytes=arena.allocateFrom(JAVA_BYTE,LinkedStore.utf8("Edit"));var write=arena.allocate(32,8);
                var result=WindowsFiles.invoke("WriteFile",FunctionDescriptor.of(JAVA_INT,ADDRESS,ADDRESS,JAVA_INT,ADDRESS,ADDRESS),pointer,bytes,4,count,write);
                if((int)result.value()==0){require(result.error()==997);WindowsFiles.yes("ProbeWrite",WindowsFiles.invoke("GetOverlappedResult",FunctionDescriptor.of(JAVA_INT,ADDRESS,ADDRESS,ADDRESS,JAVA_INT),pointer,write,count,1));}
                WindowsFiles.yes("ProbeFlush",WindowsFiles.invoke("FlushFileBuffers",FunctionDescriptor.of(JAVA_INT,ADDRESS),pointer));
            } finally {
                WindowsFiles.invoke("CancelIoEx",FunctionDescriptor.of(JAVA_INT,ADDRESS,ADDRESS),pointer,overlapped);
                WindowsFiles.invoke("GetOverlappedResult",FunctionDescriptor.of(JAVA_INT,ADDRESS,ADDRESS,ADDRESS,JAVA_INT),pointer,overlapped,count,1);
                // Never return the kernel's OVERLAPPED storage to the arena
                // while completion is uncertain, even in this disposable probe.
                if(overlapped.get(JAVA_LONG,0)==0x103)Runtime.getRuntime().halt(91);
                WindowsFiles.invoke("CloseHandle",FunctionDescriptor.of(JAVA_INT,ADDRESS),pointer);
                WindowsFiles.invoke("CloseHandle",FunctionDescriptor.of(JAVA_INT,ADDRESS),event);
                if(child!=null){require(child.waitFor(5,TimeUnit.SECONDS));System.out.println("child after release="+child.exitValue()+" alias="+Files.exists(alias));System.out.write(child.getInputStream().readAllBytes());}
            }
        }
        require(Files.readString(alias).equals("Edit"));
        System.out.println("CONFIRMED unsafe candidate: the outside-root alias received the in-place edit; do not enable this writer");
    }
}
