package vaultor.linked;
import java.io.*;import java.lang.foreign.*;import java.nio.file.*;
import static java.lang.foreign.ValueLayout.*;

/** Fixture-only observation. No production requirement for SACL privileges. */
final class MetadataAudit {
    static byte[] sid(MemorySegment pointer)throws IOException{int size=(int)WindowsFiles.invoke("GetLengthSid",FunctionDescriptor.of(JAVA_INT,ADDRESS),pointer).value();return pointer.reinterpret(size).toArray(JAVA_BYTE);}
    static byte[] acl(MemorySegment pointer){if(pointer.address()==0)return new byte[0];int size=Short.toUnsignedInt(pointer.reinterpret(8).get(JAVA_SHORT,2));return pointer.reinterpret(size).toArray(JAVA_BYTE);}
    static String security(Path file)throws IOException{
        try(var handle=WindowsFiles.open(file,WindowsFiles.READ,7,3,false);var arena=Arena.ofConfined()){
            var owner=arena.allocate(ADDRESS);var group=arena.allocate(ADDRESS);var dacl=arena.allocate(ADDRESS);var label=arena.allocate(ADDRESS);var descriptor=arena.allocate(ADDRESS);
            int result=(int)WindowsFiles.invoke("GetSecurityInfo",FunctionDescriptor.of(JAVA_INT,ADDRESS,JAVA_INT,JAVA_INT,ADDRESS,ADDRESS,ADDRESS,ADDRESS,ADDRESS),handle.value,1,0x17,owner,group,dacl,label,descriptor).value();if(result!=0)throw new IOException("METADATA_SECURITY:"+result);
            try{var bytes=new ByteArrayOutputStream();bytes.write(sid(owner.get(ADDRESS,0)));bytes.write(sid(group.get(ADDRESS,0)));bytes.write(acl(dacl.get(ADDRESS,0)));bytes.write(acl(label.get(ADDRESS,0)));return LinkedStore.hash(bytes.toByteArray());}finally{WindowsFiles.invoke("LocalFree",FunctionDescriptor.of(ADDRESS,ADDRESS),descriptor.get(ADDRESS,0));}
        }
    }
    static void setEa(Path file)throws IOException{
        try(var handle=WindowsFiles.open(file,WindowsFiles.READ|WindowsFiles.WRITE,7,3,false);var arena=Arena.ofConfined()){
            byte[] name=LinkedStore.utf8("VaultorFixture");var data=arena.allocate(8+name.length+1+3,4);data.set(JAVA_BYTE,5,(byte)name.length);data.set(JAVA_SHORT,6,(short)3);MemorySegment.copy(name,0,data,JAVA_BYTE,8,name.length);data.set(JAVA_BYTE,9+name.length,(byte)11);data.set(JAVA_BYTE,10+name.length,(byte)22);data.set(JAVA_BYTE,11+name.length,(byte)33);
            var status=arena.allocate(16,8);int result=(int)WindowsFiles.invoke("NtSetEaFile",FunctionDescriptor.of(JAVA_INT,ADDRESS,ADDRESS,ADDRESS,JAVA_INT),handle.value,status,data,(int)data.byteSize()).value();if(result!=0)throw new IOException("SET_EA:"+result);
        }
    }
    static String ea(Path file)throws IOException{
        try(var handle=WindowsFiles.open(file,WindowsFiles.READ,7,3,false);var arena=Arena.ofConfined()){
            var status=arena.allocate(16,8);var data=arena.allocate(4096,4);
            int result=(int)WindowsFiles.invoke("NtQueryEaFile",FunctionDescriptor.of(JAVA_INT,ADDRESS,ADDRESS,ADDRESS,JAVA_INT,JAVA_BYTE,ADDRESS,JAVA_INT,ADDRESS,JAVA_BYTE),handle.value,status,data,4096,(byte)0,MemorySegment.NULL,0,MemorySegment.NULL,(byte)1).value();if(result!=0)throw new IOException("QUERY_EA:"+result);
            return LinkedStore.hash(data.asSlice(0,status.get(JAVA_LONG,8)).toArray(JAVA_BYTE));
        }
    }
}
