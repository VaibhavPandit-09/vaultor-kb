package vaultor.linked;
import java.io.*;import java.lang.foreign.*;import static java.lang.foreign.ValueLayout.*;
/** Fixture-only: Java NIO deliberately cannot spell an NTFS named stream. */
final class NamedStreamProbe {
    static String access(String name,String write)throws IOException{
        try(var a=Arena.ofConfined()){
            var result=WindowsFiles.invoke("CreateFileW",FunctionDescriptor.of(ADDRESS,ADDRESS,JAVA_INT,JAVA_INT,ADDRESS,JAVA_INT,JAVA_INT,ADDRESS),WindowsFiles.wide(a,name),write==null?WindowsFiles.READ:WindowsFiles.WRITE,7,MemorySegment.NULL,write==null?3:2,0x200000,MemorySegment.NULL);
            var handle=(MemorySegment)result.value();if(handle.address()==-1)throw new WindowsFiles.NativeFailure("StreamOpen",result.error());
            try{var count=a.allocate(JAVA_INT);var bytes=write==null?a.allocate(1024):a.allocateFrom(JAVA_BYTE,LinkedStore.utf8(write));WindowsFiles.yes("StreamIO",WindowsFiles.invoke(write==null?"ReadFile":"WriteFile",FunctionDescriptor.of(JAVA_INT,ADDRESS,ADDRESS,JAVA_INT,ADDRESS,ADDRESS),handle,bytes,(int)bytes.byteSize(),count,MemorySegment.NULL));return write==null?new String(bytes.asSlice(0,count.get(JAVA_INT,0)).toArray(JAVA_BYTE),java.nio.charset.StandardCharsets.UTF_8):"";}finally{WindowsFiles.yes("StreamClose",WindowsFiles.invoke("CloseHandle",FunctionDescriptor.of(JAVA_INT,ADDRESS),handle));}
        }
    }
}
