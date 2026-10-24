package vaultor.linked;

import java.io.*;
import java.lang.foreign.*;
import java.util.*;
import static java.lang.foreign.ValueLayout.*;

/** Read-only source audit and metadata preparation on a NEW inode only.
 * The limited observation mode is qualification evidence, never write admission. */
final class ReplacementMetadata {
    record Observed(byte[] owner,byte[] group,byte[] dacl,boolean protectedDacl,long creation,int attributes,String fingerprint){}
    static WindowsFiles.Handle sourceLease(WindowsFiles.Handle parent,String name,boolean fullSecurity)throws IOException {
        if(!fullSecurity)return WindowsFiles.leaseRelative(parent,name,true);
        WindowsFiles.Handle handle;
        // Request ACCESS_SYSTEM_SECURITY on the actual source handle. A failed
        // SACL query on a plain READ_CONTROL handle alone would not prove that
        // the current token cannot obtain the required access.
        try{handle=WindowsFiles.relative(parent,name,WindowsFiles.READ|WindowsFiles.DELETE|0x01000000,1,false);}catch(IOException e){throw new IOException("SACL_ACCESS_UNQUALIFIED:"+e.getMessage(),e);}
        try{var info=WindowsFiles.info(handle);if(info.links()!=1||(info.attributes()&~(0x20|0x80))!=0)throw new IOException("REPLACEMENT_FILE_UNQUALIFIED");WindowsFiles.streams(handle);return handle;}catch(IOException e){handle.close();throw e;}
    }
    static boolean sameExceptCreation(Observed a,Observed b){return Arrays.equals(a.owner(),b.owner())&&Arrays.equals(a.group(),b.group())&&Arrays.equals(a.dacl(),b.dacl())&&a.protectedDacl()==b.protectedDacl()&&a.attributes()==b.attributes();}
    static void protectPrivateStage(WindowsFiles.Handle h)throws IOException{var security=WindowsFiles.security(h);try(var a=Arena.ofConfined()){int status=(int)WindowsFiles.invoke("SetSecurityInfo",FunctionDescriptor.of(JAVA_INT,ADDRESS,JAVA_INT,JAVA_INT,ADDRESS,ADDRESS,ADDRESS,ADDRESS),h.value,1,0x80000004,MemorySegment.NULL,MemorySegment.NULL,a.allocateFrom(JAVA_BYTE,security.dacl()),MemorySegment.NULL).value();if(status!=0)throw new IOException("STAGE_PROTECTION:"+status);}}
    static byte[] sid(MemorySegment pointer)throws IOException {
        int length=(int)WindowsFiles.invoke("GetLengthSid",FunctionDescriptor.of(JAVA_INT,ADDRESS),pointer).value();
        if(length<8||length>256)throw new IOException("METADATA_SID");return pointer.reinterpret(length).toArray(JAVA_BYTE);
    }
    static byte[] acl(MemorySegment pointer)throws IOException {
        if(pointer.address()==0)throw new IOException("NULL_DACL_UNQUALIFIED");
        int length=Short.toUnsignedInt(pointer.reinterpret(8).get(JAVA_SHORT,2));if(length<8)throw new IOException("METADATA_ACL");return pointer.reinterpret(length).toArray(JAVA_BYTE);
    }
    static void requireFullSecurityInspection(WindowsFiles.Handle h)throws IOException {
        try(var a=Arena.ofConfined()) {
            var descriptor=a.allocate(ADDRESS);var sacl=a.allocate(ADDRESS);
            int status=(int)WindowsFiles.invoke("GetSecurityInfo",FunctionDescriptor.of(JAVA_INT,ADDRESS,JAVA_INT,JAVA_INT,ADDRESS,ADDRESS,ADDRESS,ADDRESS,ADDRESS),h.value,1,0x1f,MemorySegment.NULL,MemorySegment.NULL,MemorySegment.NULL,sacl,descriptor).value();
            try{if(status!=0)throw new IOException("SACL_INSPECTION_UNQUALIFIED:"+status);
                // No transfer/privileged SACL policy has been qualified yet.
                throw new IOException("SACL_TRANSFER_UNQUALIFIED");
            }finally{if(descriptor.get(ADDRESS,0).address()!=0)WindowsFiles.invoke("LocalFree",FunctionDescriptor.of(ADDRESS,ADDRESS),descriptor.get(ADDRESS,0));}
        }
    }
    static Observed observe(WindowsFiles.Handle h)throws IOException {
        return observe(h,false);
    }
    static Observed observe(WindowsFiles.Handle h,boolean ordinaryNames)throws IOException {
        var info=WindowsFiles.info(h);if((info.attributes()&~(0x20|0x80))!=0)throw new IOException("REPLACEMENT_ATTRIBUTES_UNQUALIFIED");WindowsFiles.streams(h);
        try(var a=Arena.ofConfined()) {
            var io=a.allocate(16,8);var ea=a.allocate(65536,4);
            int result=(int)WindowsFiles.invoke("NtQueryEaFile",FunctionDescriptor.of(JAVA_INT,ADDRESS,ADDRESS,ADDRESS,JAVA_INT,JAVA_BYTE,ADDRESS,JAVA_INT,ADDRESS,JAVA_BYTE),h.value,io,ea,65536,(byte)0,MemorySegment.NULL,0,MemorySegment.NULL,(byte)1).value();
            if(result!=0xc0000052)throw new IOException("EA_UNQUALIFIED:"+Integer.toUnsignedString(result,16));
            var alternate=a.allocate(1024,4);int alternateStatus=(int)WindowsFiles.invoke("NtQueryInformationFile",FunctionDescriptor.of(JAVA_INT,ADDRESS,ADDRESS,ADDRESS,JAVA_INT,JAVA_INT),h.value,io,alternate,1024,21).value();
            if(alternateStatus!=0xc0000034){int length=alternate.get(JAVA_INT,0);if(alternateStatus!=0||length<0||length>1020)throw new IOException("SHORT_NAME_UNQUALIFIED");String shortName=new String(alternate.asSlice(4,length).toArray(JAVA_BYTE),java.nio.charset.StandardCharsets.UTF_16LE);if(!ordinaryNames&&length!=0&&!shortName.equalsIgnoreCase(WindowsFiles.canonical(h).getFileName().toString()))throw new IOException("SHORT_NAME_UNQUALIFIED");}
            var object=a.allocate(64,8);var count=a.allocate(JAVA_INT);
            var objectResult=WindowsFiles.invoke("DeviceIoControl",FunctionDescriptor.of(JAVA_INT,ADDRESS,JAVA_INT,ADDRESS,JAVA_INT,ADDRESS,JAVA_INT,ADDRESS,ADDRESS),h.value,0x9009c,MemorySegment.NULL,0,object,64,count,MemorySegment.NULL);
            if((int)objectResult.value()!=0||objectResult.error()!=2)throw new IOException("OBJECT_ID_UNQUALIFIED:"+objectResult.error());
            var owner=a.allocate(ADDRESS);var group=a.allocate(ADDRESS);var dacl=a.allocate(ADDRESS);var label=a.allocate(ADDRESS);var descriptor=a.allocate(ADDRESS);
            int status=(int)WindowsFiles.invoke("GetSecurityInfo",FunctionDescriptor.of(JAVA_INT,ADDRESS,JAVA_INT,JAVA_INT,ADDRESS,ADDRESS,ADDRESS,ADDRESS,ADDRESS),h.value,1,0x17,owner,group,dacl,label,descriptor).value();if(status!=0)throw new IOException("METADATA_SECURITY:"+status);
            try {
                var mandatory=label.get(ADDRESS,0);if(mandatory.address()!=0&&Short.toUnsignedInt(mandatory.reinterpret(8).get(JAVA_SHORT,4))!=0)throw new IOException("EXPLICIT_LABEL_UNQUALIFIED");
                var control=a.allocate(JAVA_SHORT);var revision=a.allocate(JAVA_INT);WindowsFiles.yes("SecurityControl",WindowsFiles.invoke("GetSecurityDescriptorControl",FunctionDescriptor.of(JAVA_INT,ADDRESS,ADDRESS,ADDRESS),descriptor.get(ADDRESS,0),control,revision));
                var basic=a.allocate(40,8);WindowsFiles.yes("BasicAudit",WindowsFiles.invoke("GetFileInformationByHandleEx",FunctionDescriptor.of(JAVA_INT,ADDRESS,JAVA_INT,ADDRESS,JAVA_INT),h.value,0,basic,40));
                byte[] o=sid(owner.get(ADDRESS,0)),g=sid(group.get(ADDRESS,0)),d=acl(dacl.get(ADDRESS,0));boolean protect=(control.get(JAVA_SHORT,0)&0x1000)!=0;long creation=basic.get(JAVA_LONG,0);
                var combined=new ByteArrayOutputStream();combined.write(o);combined.write(g);combined.write(d);combined.write(LinkedStore.utf8(protect+":"+creation+":"+info.attributes()));
                return new Observed(o,g,d,protect,creation,info.attributes(),LinkedStore.hash(combined.toByteArray()));
            }finally{WindowsFiles.invoke("LocalFree",FunctionDescriptor.of(ADDRESS,ADDRESS),descriptor.get(ADDRESS,0));}
        }
    }
    static void prepareNew(Observed m,WindowsFiles.Handle stage)throws IOException {
        try(var a=Arena.ofConfined()) {
            // UNPROTECTED_DACL would recompute inheritance from the PRIVATE
            // staging parent, dropping the source's inherited ACEs. Preserve
            // the existing unprotected control and verify exact bytes instead.
            int flags=7|(m.protectedDacl()?0x80000000:0);
            int result=(int)WindowsFiles.invoke("SetSecurityInfo",FunctionDescriptor.of(JAVA_INT,ADDRESS,JAVA_INT,JAVA_INT,ADDRESS,ADDRESS,ADDRESS,ADDRESS),stage.value,1,flags,a.allocateFrom(JAVA_BYTE,m.owner()),a.allocateFrom(JAVA_BYTE,m.group()),a.allocateFrom(JAVA_BYTE,m.dacl()),MemorySegment.NULL).value();if(result!=0)throw new IOException("NEW_METADATA_SECURITY:"+result);
            var basic=a.allocate(40,8);basic.set(JAVA_LONG,0,m.creation());basic.set(JAVA_INT,32,m.attributes());WindowsFiles.yes("NewBasic",WindowsFiles.invoke("SetFileInformationByHandle",FunctionDescriptor.of(JAVA_INT,ADDRESS,JAVA_INT,ADDRESS,JAVA_INT),stage.value,0,basic,40));
            WindowsFiles.yes("MetadataFlush",WindowsFiles.invoke("FlushFileBuffers",FunctionDescriptor.of(JAVA_INT,ADDRESS),stage.value));
        }
        if(!observe(stage).fingerprint().equals(m.fingerprint()))throw new IOException("NEW_METADATA_MISMATCH");
    }
}
