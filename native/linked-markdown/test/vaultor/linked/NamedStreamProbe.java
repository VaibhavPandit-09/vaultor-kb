package vaultor.linked;
import java.io.*;import java.lang.foreign.*;import static java.lang.foreign.ValueLayout.*;
/** Fixture-only: Java NIO deliberately cannot spell an NTFS named stream. */
final class NamedStreamProbe {
    static String access(String name,String write)throws IOException{
        try(var a=Arena.ofConfined()){
            var result=NativeFiles.invoke("CreateFileW",FunctionDescriptor.of(ADDRESS,ADDRESS,JAVA_INT,JAVA_INT,ADDRESS,JAVA_INT,JAVA_INT,ADDRESS),NativeFiles.wide(a,name),write==null?NativeFiles.READ:NativeFiles.WRITE,7,MemorySegment.NULL,write==null?3:2,0x200000,MemorySegment.NULL);
            var handle=(MemorySegment)result.value();if(handle.address()==-1)throw new NativeFiles.NativeFailure("StreamOpen",result.error());
            try{var count=a.allocate(JAVA_INT);var bytes=write==null?a.allocate(1024):a.allocateFrom(JAVA_BYTE,LinkedStore.utf8(write));NativeFiles.yes("StreamIO",NativeFiles.invoke(write==null?"ReadFile":"WriteFile",FunctionDescriptor.of(JAVA_INT,ADDRESS,ADDRESS,JAVA_INT,ADDRESS,ADDRESS),handle,bytes,(int)bytes.byteSize(),count,MemorySegment.NULL));return write==null?new String(bytes.asSlice(0,count.get(JAVA_INT,0)).toArray(JAVA_BYTE),java.nio.charset.StandardCharsets.UTF_8):"";}finally{NativeFiles.yes("StreamClose",NativeFiles.invoke("CloseHandle",FunctionDescriptor.of(JAVA_INT,ADDRESS),handle));}
        }
    }
}
