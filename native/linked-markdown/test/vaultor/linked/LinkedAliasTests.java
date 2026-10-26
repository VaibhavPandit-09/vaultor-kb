package vaultor.linked;
import java.nio.file.*;
import java.lang.foreign.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import static java.lang.foreign.ValueLayout.*;

public final class LinkedAliasTests extends SafetyTests {
    static String shortLeaf(Path file)throws Exception{
        try(var arena=Arena.ofConfined()){
            var output=arena.allocate(65536,2);var result=NativeFiles.invoke("GetShortPathNameW",FunctionDescriptor.of(JAVA_INT,ADDRESS,ADDRESS,JAVA_INT),NativeFiles.wide(arena,file.toString()),output,32768);
            int length=(int)result.value();if(length<=0||length>=32768)throw new NativeFiles.NativeFailure("ShortPath",result.error());
            return Path.of(new String(output.asSlice(0,length*2L).toArray(JAVA_BYTE),StandardCharsets.UTF_16LE)).getFileName().toString();
        }
    }
    public static void main(String[] args)throws Exception{
        check("Save through a real DOS alias preserves the original long directory entry",()->{
            try(var f=new LinkedPublicationTests.LinkedFixture("LongDocumentationFilename.md","Base",null)){
                String alias=shortLeaf(f.file);require(!alias.equalsIgnoreCase(f.file.getFileName().toString()));var doc=f.store.openLinked(OWNER,f.rootCap,alias);
                var receipt=f.store.saveLinked(OWNER,doc.document(),doc.epoch(),candidate(f.store,doc,1,"Local"),UUID.randomUUID().toString());require(receipt.state().equals("COMMITTED"));
                require(Files.exists(f.file));require(Files.readString(f.file).equals("Local"));try(var entries=Files.list(f.root)){require(entries.map(p->p.getFileName().toString()).toList().equals(List.of("LongDocumentationFilename.md")));}
            }
        });
        check("case-insensitive link spelling never changes original filename casing",()->{
            try(var f=new LinkedPublicationTests.LinkedFixture("CaseSensitivePresentation.md","Base",null)){
                var doc=f.store.openLinked(OWNER,f.rootCap,"casesensitivepresentation.md");var receipt=f.store.saveLinked(OWNER,doc.document(),doc.epoch(),candidate(f.store,doc,1,"Local"),UUID.randomUUID().toString());require(receipt.state().equals("COMMITTED"));
                try(var entries=Files.list(f.root)){require(entries.map(p->p.getFileName().toString()).toList().equals(List.of("CaseSensitivePresentation.md")));}
            }
        });
        Files.writeString(Path.of("native/linked-markdown/evidence/production/alias-tests.txt"),String.join("\n",results)+"\npassed="+passed+" failed="+failed+"\n");System.out.println("TOTAL "+passed+" passed; "+failed+" failed");if(failed>0)System.exit(1);
    }
}
