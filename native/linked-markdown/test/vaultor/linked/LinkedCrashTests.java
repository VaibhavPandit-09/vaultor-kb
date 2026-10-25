package vaultor.linked;
import java.nio.file.*;
import java.util.*;
import java.util.concurrent.TimeUnit;

/** Real abrupt child-process exit; not a physical power-loss experiment. */
public final class LinkedCrashTests extends SafetyTests {
    static final String LOCAL="# Validated local 😀\r\n\r\n"+"Saved paragraph. ".repeat(1000)+"\r\n";
    public static void main(String[] args)throws Exception{
        if(args.length>0){child(args);return;}
        for(String phase:List.of("replacement-prepared","replacement-stage-chunk","replacement-stage-before-flush","replacement-staged","replacement-metadata-ready","replacement-before-capture","replacement-captured-before-record","replacement-captured","replacement-before-publish","replacement-published-before-record","replacement-published","replacement-released","replacement-finalized"))check("abrupt production child exit preserves and explicitly recovers at "+phase,()->crash(phase));
        Files.writeString(Path.of("native/linked-markdown/evidence/production/crash-tests.txt"),String.join("\n",results)+"\npassed="+passed+" failed="+failed+"\n");System.out.println("TOTAL "+passed+" passed; "+failed+" failed");if(failed>0)System.exit(1);
    }
    static void child(String[] args)throws Exception{
        Path dir=Path.of(args[1]);try(var store=new LinkedStore(OWNER,dir.resolve("private"),VALIDATOR,CONSENT,List.of(dir.resolve("managed")),(at,op)->{if(at.equals(args[0]))Runtime.getRuntime().halt(76);})){String root=grant(store,dir.resolve("root"));var opened=store.openLinked(OWNER,root,"guide.md");store.saveLinked(OWNER,opened.document(),opened.epoch(),candidate(store,opened,1,LOCAL),UUID.randomUUID().toString());}
    }
    static void crash(String phase)throws Exception{
        Path dir=Files.createTempDirectory(Path.of("native/linked-markdown/.scratch"),"product-crash-").toAbsolutePath(),root=Files.createDirectory(dir.resolve("root")),file=root.resolve("guide.md");Files.writeString(file,"Base\r\n");var child=process("vaultor.linked.LinkedCrashTests",phase,dir.toString());if(!child.waitFor(15,TimeUnit.SECONDS)){child.destroyForcibly().waitFor();throw new AssertionError("Crash child timeout");}child.getInputStream().readAllBytes();require(child.exitValue()==76);
        try(var store=new LinkedStore(OWNER,dir.resolve("private"),VALIDATOR,CONSENT,List.of(dir.resolve("managed")),null)){
            var recovery=store.recover(OWNER).stream().filter(r->r.record()!=null&&!r.record().state().startsWith("DRAFT_")).findFirst().orElseThrow();var record=recovery.record();require(Arrays.equals(record.base(),LinkedStore.utf8("Base\r\n")));require(Arrays.equals(record.local(),LinkedStore.utf8(LOCAL)));require(record.visual().contains("recover me"));
            boolean gap=Set.of("replacement-captured-before-record","replacement-captured","replacement-before-publish").contains(phase),published=Set.of("replacement-published-before-record","replacement-published","replacement-released","replacement-finalized").contains(phase);
            if(gap)require(!Files.exists(file));else require(Files.readString(file).equals(published?LOCAL:"Base\r\n"));
            String capability=grant(store,root);var review=store.reviewRecovery(OWNER,record.operation(),capability);
            if(gap){require(review.state().equals("PATH_MISSING"));require(store.restoreMissingBase(OWNER,review.ticket()).state().equals("BASE_RESTORED_REOPEN_REQUIRED"));require(Files.readString(file).equals("Base\r\n"));}
            else if(published){require(review.state().equals("PUBLISHED_VAULTOR_REPLACEMENT"));require(store.completeLinkedMetadata(OWNER,review.ticket()).state().equals("METADATA_RESTORED_REOPEN_REQUIRED"));require(Files.readString(file).equals(LOCAL));}
            require(Arrays.equals(store.inspectRecovery(OWNER,record.operation()).local(),LinkedStore.utf8(LOCAL)));
            Files.write(dir.resolve("private").resolve(record.operation()).resolve("09.rec"),new byte[]{1,2});require(store.recover(OWNER).stream().anyMatch(r->r.operation().equals(record.operation())&&r.damagedTail()));rejects("CORRUPT",()->store.reviewRecovery(OWNER,record.operation(),capability));
        }
    }
}
