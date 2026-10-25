package vaultor.linked;
import java.nio.file.*;
import java.nio.file.attribute.*;
import java.util.*;

public final class LinkedParentPermissionTests extends SafetyTests {
    public static void main(String[] args)throws Exception{
        check("a parent that denies creating replacement files refuses Save before original capture",()->{
            try(var f=new LinkedPublicationTests.LinkedFixture("guide.md","Base",null)){
                var access=Files.getFileAttributeView(f.root,AclFileAttributeView.class);var original=access.getAcl();
                try{
                    var changed=new ArrayList<AclEntry>();changed.add(AclEntry.newBuilder().setType(AclEntryType.DENY).setPrincipal(Files.getOwner(f.root)).setPermissions(AclEntryPermission.WRITE_DATA).build());changed.addAll(original);access.setAcl(changed);
                    var doc=f.store.openLinked(OWNER,f.rootCap,"guide.md");var receipt=f.store.saveLinked(OWNER,doc.document(),doc.epoch(),candidate(f.store,doc,1,"Local"),UUID.randomUUID().toString());
                    System.out.println("PARENT_PERMISSION state="+receipt.state()+" originalExists="+Files.exists(f.file));require(!receipt.state().equals("COMMITTED"));require(Files.exists(f.file));require(Files.readString(f.file).equals("Base"));
                    require(f.store.recover(OWNER).stream().anyMatch(r->r.record()!=null&&Arrays.equals(r.record().local(),LinkedStore.utf8("Local"))));
                }finally{access.setAcl(original);}
            }
        });
        check("a probe-name collision never deletes or overwrites the existing entry",()->{
            try(var f=new LinkedPublicationTests.LinkedFixture("guide.md","Base",null)){
                String operation=UUID.randomUUID().toString();Path sentinel=f.root.resolve(".vaultor-recovery-probe-"+operation+".tmp");Files.writeString(sentinel,"Independent sentinel");var doc=f.store.openLinked(OWNER,f.rootCap,"guide.md");
                var receipt=f.store.saveLinked(OWNER,doc.document(),doc.epoch(),candidate(f.store,doc,1,"Local"),operation);require(!receipt.state().equals("COMMITTED"));require(Files.readString(f.file).equals("Base"));require(Files.readString(sentinel).equals("Independent sentinel"));
            }
        });
        Files.writeString(Path.of("native/linked-markdown/evidence/production/parent-permission-tests.txt"),String.join("\n",results)+"\npassed="+passed+" failed="+failed+"\n");System.out.println("TOTAL "+passed+" passed; "+failed+" failed");if(failed>0)System.exit(1);
    }
}
