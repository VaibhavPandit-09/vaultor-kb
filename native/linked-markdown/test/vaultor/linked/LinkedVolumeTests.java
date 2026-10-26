package vaultor.linked;
import java.io.*;
import java.nio.file.*;
import java.util.*;

/** Real distinct NTFS volumes required; no mock volume IDs count as evidence. */
public final class LinkedVolumeTests extends SafetyTests {
    static Path secondary;
    static class Multi implements AutoCloseable {
        final Path home=Files.createTempDirectory(Path.of("native/linked-markdown/.scratch"),"volumes-").toAbsolutePath();
        final Path source=Files.createTempDirectory(secondary,"vaultor-multivol-"),file=source.resolve("guide.md"),journal=home.resolve("private");
        LinkedStore store;String cap;LinkedStore.Opened doc;
        Multi(LinkedStore.Faults faults)throws Exception{
            Files.writeString(file,"# Guide\r\n\r\nBase paragraph.\r\n");
            store=new LinkedStore(OWNER,journal,VALIDATOR,CONSENT,List.of(home.resolve("managed")),faults);
            cap=grant(store,source);doc=store.openLinked(OWNER,cap,"guide.md");
            require(store.readonlyReason(OWNER,doc.document()).isEmpty());
        }
        LinkedStore.Receipt save()throws Exception{return store.saveLinked(OWNER,doc.document(),doc.epoch(),candidate(store,doc,1,"# Guide\r\n\r\nEdited paragraph.\r\n"),UUID.randomUUID().toString());}
        public void close()throws Exception{store.close();}
    }
    public static void main(String[] args)throws Exception{
        if(args.length==3&&args[0].equals("crash")){
            Path journal=Path.of(args[1]),source=Path.of(args[2]);
            try(var store=new LinkedStore(OWNER,journal,VALIDATOR,CONSENT,List.of(journal.getParent().resolve("managed")),(phase,op)->{if(phase.equals("replacement-captured-before-record"))Runtime.getRuntime().halt(73);})){String cap=grant(store,source);var doc=store.openLinked(OWNER,cap,"guide.md");store.saveLinked(OWNER,doc.document(),doc.epoch(),candidate(store,doc,2,"Crash local"),UUID.randomUUID().toString());}
            throw new AssertionError("Crash boundary not reached");
        }
        if(args.length!=1)throw new IllegalArgumentException("Explicit disposable secondary NTFS test volume required");
        secondary=Path.of(args[0]).toAbsolutePath();NativeFiles.localFilesystem(secondary);
        require(!NativeFiles.volumeIdentity(secondary).equals(NativeFiles.volumeIdentity(Path.of(".").toAbsolutePath())));
        check("real secondary NTFS Save retains source-local captured original; unrelated Git bytes unchanged",()->{
            try(var f=new Multi(null)){
                Files.createDirectory(f.source.resolve(".git"));Path unrelated=f.source.resolve("unrelated.md");Files.writeString(unrelated,"Unchanged\r\n");
                var receipt=f.save();require(receipt.state().equals("COMMITTED"));require(Files.readString(f.file).contains("Edited paragraph."));require(Files.readString(unrelated).equals("Unchanged\r\n"));
                var record=f.store.inspectRecovery(OWNER,receipt.operation());require(new String(record.base(),java.nio.charset.StandardCharsets.UTF_8).contains("Base paragraph."));
                require(f.store.readRecoveryArtifact(OWNER,receipt.operation(),"captured").length==record.base().length);
                f.store.acknowledgeLinkedSave(OWNER,receipt.operation());require(f.store.inspectRecovery(OWNER,receipt.operation()).state().equals("LINKED_ACKNOWLEDGED"));
            }
        });
        check("interrupted secondary publication survives restart and explicit missing-base restoration",()->{
            try(var f=new Multi((phase,op)->{if(phase.equals("replacement-captured"))throw new IOException("VOLUME_INTERRUPTION");})){
                var receipt=f.save();require(receipt.state().equals("RECOVERY_REQUIRED"));require(!Files.exists(f.file));f.store.close();
                f.store=new LinkedStore(OWNER,f.journal,VALIDATOR,CONSENT,List.of(f.home.resolve("managed")),null);f.cap=grant(f.store,f.source);
                require(f.store.recover(OWNER).stream().anyMatch(r->r.operation().equals(receipt.operation())&&r.captured()));
                var review=f.store.reviewRecovery(OWNER,receipt.operation(),f.cap);require(f.store.restoreMissingBase(OWNER,review.ticket()).state().equals("BASE_RESTORED_REOPEN_REQUIRED"));require(Files.readString(f.file).contains("Base paragraph."));
            }
        });
        check("multiple source roots share one carrier with isolated operation evidence",()->{
            try(var f=new Multi(null)){
                Path second=Files.createDirectory(f.source.resolveSibling(f.source.getFileName()+"-second"));Files.writeString(second.resolve("guide.md"),"Second base");
                String cap=grant(f.store,second);var doc=f.store.openLinked(OWNER,cap,"guide.md");var first=f.save();var other=f.store.saveLinked(OWNER,doc.document(),doc.epoch(),candidate(f.store,doc,1,"Second local"),UUID.randomUUID().toString());
                require(other.state().equals("COMMITTED"));require(!f.store.inspectRecovery(OWNER,first.operation()).rootIdentity().equals(f.store.inspectRecovery(OWNER,other.operation()).rootIdentity()));
                try(var entries=Files.list(f.home.resolve("carriers"))){require(entries.count()==1);}
            }
        });
        check("disconnected source cannot Save; primary draft remains reviewable",()->{
            try(var f=new Multi(null)){
                String candidate=candidate(f.store,f.doc,1,"Retained offline work");f.store.disconnect(OWNER,f.cap);
                rejects("SOURCE_UNAVAILABLE",()->f.store.saveLinked(OWNER,f.doc.document(),f.doc.epoch(),candidate,UUID.randomUUID().toString()));
                require(f.store.recover(OWNER).stream().anyMatch(r->r.record()!=null&&Arrays.equals(r.record().local(),LinkedStore.utf8("Retained offline work"))));require(Files.readString(f.file).contains("Base paragraph."));
            }
        });
        check("source/carrier volume mismatch and Git/source placements refuse",()->{
            try(var f=new Multi(null);var carriers=new RecoveryCarriers(f.journal,OWNER,List.of())){
                rejects("CARRIER_VOLUME_MISMATCH",()->carriers.provision(f.source,f.home.resolve("wrong-volume")));
                rejects("CARRIER_UNSAFE_LOCATION",()->carriers.provision(f.source,f.source.resolve("private")));
                Path repo=Files.createDirectory(f.source.resolveSibling(f.source.getFileName()+"-repo"));Files.createDirectory(repo.resolve(".git"));
                rejects("CARRIER_IN_REPOSITORY",()->carriers.provision(f.source,repo.resolve("private")));
            }
        });
        check("missing secondary source at restart does not block primary recovery",()->{
            try(var f=new Multi(null)){
                candidate(f.store,f.doc,1,"Restart draft");f.store.close();Path moved=f.source.resolveSibling(f.source.getFileName()+"-absent");Files.move(f.source,moved);
                f.store=new LinkedStore(OWNER,f.journal,VALIDATOR,CONSENT,List.of(f.home.resolve("managed")),null);
                require(f.store.recover(OWNER).stream().anyMatch(r->r.record()!=null&&Arrays.equals(r.record().local(),LinkedStore.utf8("Restart draft"))));
                Files.move(moved,f.source);f.cap=grant(f.store,f.source);require(f.store.rootVolume(OWNER,f.cap).equals(NativeFiles.volumeIdentity(secondary)));
            }
        });
        check("real process termination after secondary capture retains usable recovery",()->{
            try(var f=new Multi(null)){
                f.store.close();var child=process("vaultor.linked.LinkedVolumeTests","crash",f.journal.toString(),f.source.toString());child.getInputStream().readAllBytes();require(child.waitFor(20,java.util.concurrent.TimeUnit.SECONDS));require(child.exitValue()==73);
                f.store=new LinkedStore(OWNER,f.journal,VALIDATOR,CONSENT,List.of(f.home.resolve("managed")),null);f.cap=grant(f.store,f.source);
                var recovery=f.store.recover(OWNER).stream().filter(r->r.captured()).findFirst().orElseThrow();require(!Files.exists(f.file));
                var review=f.store.reviewRecovery(OWNER,recovery.operation(),f.cap);require(f.store.restoreMissingBase(OWNER,review.ticket()).state().equals("BASE_RESTORED_REOPEN_REQUIRED"));require(Files.readString(f.file).contains("Base paragraph."));
            }
        });
        check("replaced carrier identity refuses Save and preserves primary draft",()->{
            try(var f=new Multi(null)){
                candidate(f.store,f.doc,1,"Retained with lost carrier");f.store.close();
                Path descriptor;try(var files=Files.list(f.home.resolve("carriers"))){descriptor=files.findFirst().orElseThrow();}
                String[] fields=Files.readString(descriptor).split("\n");Path carrier=secondary.resolve(fields[1]),retained=carrier.resolveSibling(carrier.getFileName()+"-retained");Files.move(carrier,retained);Files.createDirectory(carrier);Files.writeString(carrier.resolve("store.marker"),"G2-PRIVATE-STORE-1\nworkspace\ngeneration");
                f.store=new LinkedStore(OWNER,f.journal,VALIDATOR,CONSENT,List.of(f.home.resolve("managed")),null);
                rejects("CARRIER_IDENTITY_CHANGED",()->grant(f.store,f.source));require(f.store.recover(OWNER).stream().anyMatch(r->r.record()!=null&&Arrays.equals(r.record().local(),LinkedStore.utf8("Retained with lost carrier")))) ;
                Files.delete(carrier.resolve("store.marker"));Files.delete(carrier);Files.move(retained,carrier);
            }
        });
        System.out.println("SECONDARY "+secondary+" "+NativeFiles.volumeIdentity(secondary));
        System.out.println("TOTAL "+passed+" passed; "+failed+" failed");if(failed>0)System.exit(1);
    }
}
