package vaultor.linked;
import java.io.*;
import java.lang.foreign.*;
import java.util.*;
import static java.lang.foreign.ValueLayout.*;
final class PracticalMetadata {
    static void prepareCaptureDirectory(java.nio.file.Path operation,NativeFiles.Handle parent)throws IOException{NativeFiles.checkPrivatePermissions(operation);}
    static ReplacementMetadata.Observed inspect(NativeFiles.Handle h)throws IOException{return ReplacementMetadata.observe(h,true);}
    static void apply(ReplacementMetadata.Observed plan,NativeFiles.Handle fresh,boolean before)throws IOException{
        try(var arena=Arena.ofConfined()){NativeFiles.call("vf_metadata",new MemoryLayout[]{JAVA_INT,ADDRESS},fresh.fd,arena.allocateFrom(JAVA_BYTE,plan.dacl()));}
        if(!inspect(fresh).fingerprint().equals(plan.fingerprint()))throw new IOException("ORDINARY_METADATA_CHANGED_REVIEW");
    }
}
