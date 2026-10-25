package vaultor.linked;

import java.io.IOException;
import java.lang.foreign.*;
import java.nio.file.*;
import java.util.*;
import static java.lang.foreign.ValueLayout.*;

/** Narrow regression for ordinary files with NTFS tracking object IDs. */
public final class LinkedMetadataTests extends SafetyTests {
    static byte[] objectId(Path file,boolean create)throws IOException {
        try(var h=WindowsFiles.open(file,WindowsFiles.READ,7,WindowsFiles.OPEN,false);var a=Arena.ofConfined()){
            var data=a.allocate(64,8);var count=a.allocate(JAVA_INT);
            var result=WindowsFiles.invoke("DeviceIoControl",FunctionDescriptor.of(JAVA_INT,ADDRESS,JAVA_INT,ADDRESS,JAVA_INT,ADDRESS,JAVA_INT,ADDRESS,ADDRESS),h.value,create?0x900c0:0x9009c,MemorySegment.NULL,0,data,64,count,MemorySegment.NULL);
            WindowsFiles.yes(create?"FixtureObjectId":"ReadObjectId",result);require(count.get(JAVA_INT,0)==64);return data.toArray(JAVA_BYTE);
        }
    }
    public static void main(String[] args)throws Exception {
        check("ordinary object-ID inspection succeeds without changing source metadata or bytes",()->{
            try(var f=new LinkedPublicationTests.LinkedFixture("guide.md","# Guide\r\n\r\nOriginal.\r\n",null)){
                byte[] id=objectId(f.file,true),bytes=Files.readAllBytes(f.file);WindowsFiles.Info before;
                try(var h=WindowsFiles.open(f.file,WindowsFiles.READ,1,WindowsFiles.OPEN,false)){
                    before=WindowsFiles.info(h);PracticalMetadata.inspect(h);
                    rejects("OBJECT_ID_UNQUALIFIED",()->ReplacementMetadata.observe(h)); // historical strict mode stays strict
                }
                require(Arrays.equals(id,objectId(f.file,false)));require(Arrays.equals(bytes,Files.readAllBytes(f.file)));
                try(var h=WindowsFiles.open(f.file,WindowsFiles.READ,1,WindowsFiles.OPEN,false)){require(before.equals(WindowsFiles.info(h)));}
                var doc=f.store.openLinked(OWNER,f.rootCap,"guide.md");require(f.store.readonlyReason(OWNER,doc.document()).isEmpty());
            }
        });
        check("CODEBASE-sized source with an object ID opens and saves only the intended edit",()->{
            byte[] original=Files.readAllBytes(Path.of("docs/CODEBASE.md"));String source=new String(original,java.nio.charset.StandardCharsets.UTF_8);
            try(var f=new LinkedPublicationTests.LinkedFixture("CODEBASE.md",source,null)){
                objectId(f.file,true);var doc=f.store.openLinked(OWNER,f.rootCap,"CODEBASE.md");require(f.store.readonlyReason(OWNER,doc.document()).isEmpty());require(Arrays.equals(original,doc.base().bytes()));
                String local=source.replaceFirst("# Vaultor:","# Vaultor regression:");require(!local.equals(source));
                var receipt=f.store.saveLinked(OWNER,doc.document(),doc.epoch(),candidate(f.store,doc,1,local),UUID.randomUUID().toString());require(receipt.state().equals("COMMITTED"));require(Arrays.equals(LinkedStore.utf8(local),Files.readAllBytes(f.file)));
                Path captured=f.journal.resolve(receipt.operation()).resolve("captured.md");require(Arrays.equals(original,Files.readAllBytes(captured)));try(var h=WindowsFiles.open(captured,WindowsFiles.READ,1,WindowsFiles.OPEN,false)){require(WindowsFiles.info(h).identity().equals(doc.base().revision().identity()));}
            }
        });
        check("object ID does not bypass alternate-stream refusal",()->{
            try(var f=new LinkedPublicationTests.LinkedFixture("guide.md","Base",null)){objectId(f.file,true);try(var stream=new java.io.FileOutputStream(f.file+":extra")){stream.write(LinkedStore.utf8("Private stream"));}var doc=f.store.openLinked(OWNER,f.rootCap,"guide.md");require(f.store.readonlyReason(OWNER,doc.document()).equals("SPECIAL_FILE"));require(candidate(f.store,doc,1,"Local")==null);require(Files.readString(f.file).equals("Base"));}
        });
        check("object ID does not bypass extended-attribute refusal",()->{
            try(var f=new LinkedPublicationTests.LinkedFixture("guide.md","Base",null)){objectId(f.file,true);MetadataAudit.setEa(f.file);var doc=f.store.openLinked(OWNER,f.rootCap,"guide.md");require(f.store.readonlyReason(OWNER,doc.document()).equals("SPECIAL_FILE"));require(candidate(f.store,doc,1,"Local")==null);require(Files.readString(f.file).equals("Base"));}
        });
        check("object ID does not bypass multiple-hardlink refusal",()->{
            try(var f=new LinkedPublicationTests.LinkedFixture("guide.md","Base",null)){objectId(f.file,true);Path alias=f.dir.resolve("outside.md");Files.createLink(alias,f.file);var doc=f.store.openLinked(OWNER,f.rootCap,"guide.md");require(f.store.readonlyReason(OWNER,doc.document()).equals("HARDLINKED_FILE"));require(candidate(f.store,doc,1,"Local")==null);require(Files.readString(alias).equals("Base"));}
        });
        Files.writeString(Path.of("native/linked-markdown/evidence/production/metadata-admission-tests.txt"),String.join("\n",results)+"\npassed="+passed+" failed="+failed+"\n");System.out.println("TOTAL "+passed+" passed; "+failed+" failed");if(failed>0)System.exit(1);
    }
}
