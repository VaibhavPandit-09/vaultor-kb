package vaultor.linked;
import java.io.*;
import java.util.*;
/** APFS ordinary POSIX metadata only. ACLs, xattrs and flags refuse Save. */
final class ReplacementMetadata {
    record Observed(byte[] owner,byte[] group,byte[] dacl,boolean protectedDacl,long creation,int attributes,String fingerprint){}
    static NativeFiles.Handle sourceLease(NativeFiles.Handle parent,String name,boolean full)throws IOException{return NativeFiles.leaseRelative(parent,name,true);}
    static boolean sameExceptCreation(Observed a,Observed b){return Arrays.equals(a.owner(),b.owner())&&Arrays.equals(a.group(),b.group())&&Arrays.equals(a.dacl(),b.dacl())&&a.attributes()==b.attributes();}
    static void protectPrivateStage(NativeFiles.Handle h)throws IOException{}
    static void requireFullSecurityInspection(NativeFiles.Handle h)throws IOException{throw new IOException("EXACT_METADATA_UNQUALIFIED");}
    static Observed observe(NativeFiles.Handle h)throws IOException{return observe(h,true);}
    static Observed observe(NativeFiles.Handle h,boolean practical)throws IOException{
        NativeFiles.admit(h);long[] s=NativeFiles.stat(h);var bytes=java.nio.ByteBuffer.allocate(12*8).order(java.nio.ByteOrder.nativeOrder());for(long n:s)bytes.putLong(n);
        byte[] owner=LinkedStore.utf8("uid:"+s[8]),group=LinkedStore.utf8("gid:"+s[9]),plan=bytes.array();
        String signature=LinkedStore.hash(LinkedStore.utf8(s[2]+":"+s[3]+":"+s[8]+":"+s[9]+":"+s[10]+":"+s[11]));
        return new Observed(owner,group,plan,true,s[2]*1000000000L+s[3],NativeFiles.info(h).attributes(),signature);
    }
    static void prepareNew(Observed m,NativeFiles.Handle stage)throws IOException{PracticalMetadata.apply(m,stage,true);}
}
