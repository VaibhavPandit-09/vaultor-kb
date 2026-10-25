package vaultor.linked;
import java.nio.file.*;
import java.util.*;

public final class LinkedRecoveryTests extends SafetyTests {
    public static void main(String[] args)throws Exception{
        check("private evidence can be explicitly resolved with a disconnected source and never changes external content",()->{
            try(var f=new LinkedPublicationTests.LinkedFixture("guide.md","Original",null)){
                var doc=f.store.openLinked(OWNER,f.rootCap,"guide.md");candidate(f.store,doc,1,"Protected draft");String op=f.store.recover(OWNER).getFirst().operation();f.store.closeDocument(OWNER,doc.document());f.store.disconnect(OWNER,f.rootCap);
                var review=f.store.reviewPrivateEvidence(OWNER,op);f.store.discardReviewedPrivateEvidence(OWNER,review.ticket());require(!Files.exists(f.journal.resolve(op)));require(Files.readString(f.file).equals("Original"));rejects("EXPIRED",()->f.store.discardReviewedPrivateEvidence(OWNER,review.ticket()));
            }
        });
        check("changed private evidence invalidates removal while corrupt journals still allow preserved-object export",()->{
            try(var f=new LinkedPublicationTests.LinkedFixture("guide.md","Original",null)){
                var doc=f.store.openLinked(OWNER,f.rootCap,"guide.md");candidate(f.store,doc,1,"Local");String op=f.store.recover(OWNER).getFirst().operation();f.store.closeDocument(OWNER,doc.document());Path directory=f.journal.resolve(op);WindowsFiles.createFlushed(directory.resolve("captured.md"),LinkedStore.utf8("Competing captured revision"));
                var review=f.store.reviewPrivateEvidence(OWNER,op);Files.write(directory.resolve("00.rec"),new byte[]{1,2,3});rejects("EVIDENCE_CHANGED",()->f.store.discardReviewedPrivateEvidence(OWNER,review.ticket()));
                require(LinkedExportTests.export(f,op,"captured",f.dir.resolve("captured-copy.md")).equals("EXPORTED_NEW_FILE"));require(Files.readString(f.dir.resolve("captured-copy.md")).equals("Competing captured revision"));require(Files.readString(f.file).equals("Original"));require(Files.exists(directory.resolve("captured.md")));
            }
        });
        check("an active recoverable draft cannot be removed through the private evidence endpoint",()->{
            try(var f=new LinkedPublicationTests.LinkedFixture("guide.md","Original",null)){
                var doc=f.store.openLinked(OWNER,f.rootCap,"guide.md");candidate(f.store,doc,1,"Keep while open");String op=f.store.recover(OWNER).getFirst().operation();var review=f.store.reviewPrivateEvidence(OWNER,op);rejects("EDITOR_ACTIVE",()->f.store.discardReviewedPrivateEvidence(OWNER,review.ticket()));var originalReview=f.store.reviewRecovery(OWNER,op,f.rootCap);rejects("EDITOR_ACTIVE",()->f.store.resolveRecovery(OWNER,originalReview.ticket()));require(Files.exists(f.journal.resolve(op)));require(Files.readString(f.file).equals("Original"));
            }
        });
        check("a late outside alias does not block private inspection or explicit missing-name restoration",()->{
            final Path[] file={null},alias={null};try(var f=new LinkedPublicationTests.LinkedFixture("guide.md","Original",(phase,op)->{if(phase.equals("replacement-before-capture"))Files.createLink(alias[0],file[0]);if(phase.equals("replacement-captured"))throw new java.io.IOException("INTERRUPTED_CAPTURE");})){
                file[0]=f.file;alias[0]=f.dir.resolve("outside.md");var doc=f.store.openLinked(OWNER,f.rootCap,"guide.md");var receipt=f.store.saveLinked(OWNER,doc.document(),doc.epoch(),candidate(f.store,doc,1,"Local"),UUID.randomUUID().toString());require(receipt.state().equals("RECOVERY_REQUIRED"));require(!Files.exists(f.file));require(Files.readString(alias[0]).equals("Original"));
                require(f.store.reviewPrivateEvidence(OWNER,receipt.operation()).artifacts().contains("captured"));require(Arrays.equals(f.store.readRecoveryArtifact(OWNER,receipt.operation(),"captured"),LinkedStore.utf8("Original")));
                var review=f.store.reviewRecovery(OWNER,receipt.operation(),f.rootCap);require(f.store.restoreMissingBase(OWNER,review.ticket()).state().equals("BASE_RESTORED_REOPEN_REQUIRED"));require(Files.readString(f.file).equals("Original"));require(Files.readString(alias[0]).equals("Original"));
            }
        });
        Files.writeString(Path.of("native/linked-markdown/evidence/production/recovery-tests.txt"),String.join("\n",results)+"\npassed="+passed+" failed="+failed+"\n");System.out.println("TOTAL "+passed+" passed; "+failed+" failed");if(failed>0)System.exit(1);
    }
}
