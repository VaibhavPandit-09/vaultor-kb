package vaultor.linked;
import java.nio.file.*;
import java.util.*;
import static vaultor.linked.MacFilesTests.*;
/** Three explicit phases around a real APFS image detach/remount. */
public final class MacVolumeTests {
 public static void main(String[] args)throws Exception{
  Path home=Path.of(args[1]).toAbsolutePath(),source=Path.of(args[2]).toAbsolutePath(),journal=home.resolve("journal");Files.createDirectories(home);
  if(args[0].equals("first")){
   Files.createDirectory(source);Files.writeString(source.resolve("guide.md"),"Base\r\n");
   try(var store=new LinkedStore(S,journal,V,C,List.of(),null)){
    require(!NativeFiles.volumeIdentity(home).equals(NativeFiles.volumeIdentity(source)));String cap=grant(store,source);var doc=store.openLinked(S,cap,"guide.md");String text="Local\r\n";String ticket=store.journalDraft(S,doc.document(),doc.epoch(),1,"{}",LinkedStore.utf8(text),sign(V,LinkedStore.proofPayload(doc.document(),doc.epoch(),1,doc.base().revision(),LinkedStore.utf8(text),"{}")));
    var r=store.saveLinked(S,doc.document(),doc.epoch(),ticket,UUID.randomUUID().toString());require(r.state().equals("COMMITTED"));require(Files.readString(source.resolve("guide.md")).equals(text));require(new String(store.readRecoveryArtifact(S,r.operation(),"captured")).equals("Base\r\n"));
    try(var carrier=new RecoveryCarriers(journal,S,List.of())){refused(()->carrier.provision(source,home.resolve("wrong-volume")));}
    Files.writeString(home.resolve("volume"),NativeFiles.volumeIdentity(source));Files.writeString(home.resolve("rootIdentity"),store.rootIdentity(S,cap));
   }System.out.println("PASS distinct APFS source-local carrier Save, capture and volume mismatch refusal");
  }else if(args[0].equals("absent")){
   try(var store=new LinkedStore(S,journal,V,C,List.of(),null)){require(!store.recover(S).isEmpty());refused(()->grant(store,source));refused(()->NativeFiles.mountedVolume(Files.readString(home.resolve("volume"))));}System.out.println("PASS detached APFS volume retains primary recovery and grants no source authority");
  }else{
   Path located=NativeFiles.locateRoot(source,Files.readString(home.resolve("volume")));require(!located.equals(source));
   try(var store=new LinkedStore(S,journal,V,C,List.of(),null)){String cap=grant(store,located);require(store.rootIdentity(S,cap).equals(Files.readString(home.resolve("rootIdentity"))));require(Files.readString(located.resolve("guide.md")).equals("Local\r\n"));require(store.recover(S).stream().anyMatch(r->r.captured()));var doc=store.openLinked(S,cap,"guide.md");require(store.readonlyReason(S,doc.document()).isEmpty());}System.out.println("PASS APFS UUID discovery after changed mountpoint and verified carrier recovery");
  }
 }
}
