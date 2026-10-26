package vaultor.linked;

import java.io.IOException;
import java.lang.foreign.*;
import java.util.Arrays;
import static java.lang.foreign.ValueLayout.*;

/** First-release ordinary NTFS policy. Optional audit SACLs are neither assumed
 * absent nor promised copied. Source handles are never passed to either setter. */
final class PracticalMetadata {
    /** NTFS recomputes inherited ACEs on rename. Give the private operation
     * directory the source parent's inheritance rules as INHERIT_ONLY: they
     * grant no directory access. This avoids changing the captured inode's
     * permissions. New journals/drafts still receive owner-only ACLs before
     * any private bytes are written; staged publication keeps its own policy. */
    static void prepareCaptureDirectory(java.nio.file.Path operation,WindowsFiles.Handle sourceParent)throws IOException{
        byte[] inherited=WindowsFiles.security(sourceParent).dacl();
        try(var directory=WindowsFiles.open(operation,0x60000,3,WindowsFiles.OPEN,true);var a=Arena.ofConfined()){
            byte[] privateAcl=WindowsFiles.security(directory).dacl();
            var source=java.nio.ByteBuffer.wrap(inherited).order(java.nio.ByteOrder.LITTLE_ENDIAN);
            var own=java.nio.ByteBuffer.wrap(privateAcl).order(java.nio.ByteOrder.LITTLE_ENDIAN);
            var entries=new java.io.ByteArrayOutputStream();entries.writeBytes(java.util.Arrays.copyOfRange(privateAcl,8,privateAcl.length));
            int count=Short.toUnsignedInt(own.getShort(4)),offset=8;
            for(int i=0;i<Short.toUnsignedInt(source.getShort(4));i++){
                if(offset+4>inherited.length)throw new IOException("CAPTURE_PARENT_ACL");
                int size=Short.toUnsignedInt(source.getShort(offset+2));if(size<4||offset+size>inherited.length)throw new IOException("CAPTURE_PARENT_ACL");
                int flags=inherited[offset+1]&255;
                if((flags&3)!=0){byte[] ace=java.util.Arrays.copyOfRange(inherited,offset,offset+size);ace[1]=(byte)((flags&~0x10)|8);entries.writeBytes(ace);count++;}
                offset+=size;
            }
            if(entries.size()+8>65535)throw new IOException("CAPTURE_PARENT_ACL");
            byte[] acl=new byte[entries.size()+8];System.arraycopy(privateAcl,0,acl,0,8);System.arraycopy(entries.toByteArray(),0,acl,8,entries.size());
            var out=java.nio.ByteBuffer.wrap(acl).order(java.nio.ByteOrder.LITTLE_ENDIAN);out.putShort(2,(short)acl.length);out.putShort(4,(short)count);
            int result=(int)WindowsFiles.invoke("SetSecurityInfo",FunctionDescriptor.of(JAVA_INT,ADDRESS,JAVA_INT,JAVA_INT,ADDRESS,ADDRESS,ADDRESS,ADDRESS),directory.value,1,0x80000004,MemorySegment.NULL,MemorySegment.NULL,a.allocateFrom(JAVA_BYTE,acl),MemorySegment.NULL).value();
            if(result!=0)throw new IOException("CAPTURE_PARENT_ACL:"+result);
        }
    }
    static ReplacementMetadata.Observed inspect(WindowsFiles.Handle source)throws IOException{return ReplacementMetadata.observe(source,true);}
    static byte[] explicitRules(byte[] original)throws IOException {
        byte[] copy=original.clone();var bytes=java.nio.ByteBuffer.wrap(copy).order(java.nio.ByteOrder.LITTLE_ENDIAN);if(copy.length<8)throw new IOException("INVALID_ACL");int count=Short.toUnsignedInt(bytes.getShort(4)),offset=8;
        for(int i=0;i<count;i++){if(offset+4>copy.length)throw new IOException("INVALID_ACE");int size=Short.toUnsignedInt(bytes.getShort(offset+2));if(size<4||offset+size>copy.length)throw new IOException("INVALID_ACE");copy[offset+1]=(byte)(copy[offset+1]&~0x10);offset+=size;}return copy;
    }
    static void apply(ReplacementMetadata.Observed plan,WindowsFiles.Handle fresh,boolean beforePublication)throws IOException {
        if(WindowsFiles.info(fresh).links()!=1)throw new IOException("NEW_INODE_LINKED_REVIEW_REQUIRED");
        var before=inspect(fresh);boolean ownerChanged=!Arrays.equals(plan.owner(),before.owner()),groupChanged=!Arrays.equals(plan.group(),before.group());
        try(var a=Arena.ofConfined()) {
            int flags=4|(ownerChanged?1:0)|(groupChanged?2:0)|(beforePublication||plan.protectedDacl()?0x80000000:0x20000000);
            byte[] acl=beforePublication?explicitRules(plan.dacl()):plan.dacl();
            int result=(int)WindowsFiles.invoke("SetSecurityInfo",FunctionDescriptor.of(JAVA_INT,ADDRESS,JAVA_INT,JAVA_INT,ADDRESS,ADDRESS,ADDRESS,ADDRESS),fresh.value,1,flags,ownerChanged?a.allocateFrom(JAVA_BYTE,plan.owner()):MemorySegment.NULL,groupChanged?a.allocateFrom(JAVA_BYTE,plan.group()):MemorySegment.NULL,a.allocateFrom(JAVA_BYTE,acl),MemorySegment.NULL).value();
            if(result!=0)throw new IOException("ORDINARY_PERMISSIONS_REVIEW:"+result);
            var basic=a.allocate(40,8);basic.set(JAVA_LONG,0,plan.creation());basic.set(JAVA_INT,32,plan.attributes());WindowsFiles.yes("OrdinaryAttributes",WindowsFiles.invoke("SetFileInformationByHandle",FunctionDescriptor.of(JAVA_INT,ADDRESS,JAVA_INT,ADDRESS,JAVA_INT),fresh.value,0,basic,40));
            WindowsFiles.yes("OrdinaryMetadataFlush",WindowsFiles.invoke("FlushFileBuffers",FunctionDescriptor.of(JAVA_INT,ADDRESS),fresh.value));
        }
        var actual=inspect(fresh);
        if(!Arrays.equals(plan.owner(),actual.owner())||!Arrays.equals(plan.group(),actual.group())||!Arrays.equals(beforePublication?explicitRules(plan.dacl()):plan.dacl(),actual.dacl())||actual.protectedDacl()!=(beforePublication||plan.protectedDacl())||actual.creation()!=plan.creation()||actual.attributes()!=plan.attributes())throw new IOException("ORDINARY_METADATA_CHANGED_REVIEW:"+beforePublication);
    }
}
