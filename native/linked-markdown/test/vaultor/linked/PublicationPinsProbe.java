package vaultor.linked;
import java.nio.file.*;import java.util.*;
/** Directory sharing experiment; no stronger lease is assumed before testing. */
public final class PublicationPinsProbe extends SafetyTests {
    public static void main(String[] args)throws Exception {
        var output=new ArrayList<String>();
        for(int access:List.of(NativeFiles.READ,NativeFiles.READ|NativeFiles.WRITE))for(int sharing:List.of(1,3,7)){
            Path base=Files.createTempDirectory(Path.of("native/linked-markdown/.scratch"),"g3b-pin-").toAbsolutePath(),dir=Files.createDirectory(base.resolve("root")),outside=Files.createDirectory(base.resolve("outside"));Files.writeString(dir.resolve("stage.md"),"Local");
            String rename="not attempted",move="not attempted",junction="not attempted",underJunction="not attempted";
            try(var h=NativeFiles.open(dir,access,sharing,3,true)){
                try(var stage=NativeFiles.lease(dir.resolve("stage.md"),true)){try{NativeFiles.renameExclusive(stage,h,"new.md");rename="ok";}catch(Exception e){rename=e.getMessage();}}
                // Make the directory empty, as it is after original capture.
                Files.deleteIfExists(dir.resolve("stage.md"));Files.deleteIfExists(dir.resolve("new.md"));
                move=Integer.toString(external("move",dir,base.resolve("moved").toString()));if(move.equals("2"))junction=Integer.toString(external("junction",dir,outside.toString()));
                if(junction.equals("0")){Path candidate=base.resolve("candidate.md");Files.writeString(candidate,"Local");try(var stage=NativeFiles.lease(candidate,true)){try{NativeFiles.renameExclusive(stage,h,"published.md");underJunction="native success";}catch(Exception e){underJunction=e.getMessage();}}require(!Files.exists(outside.resolve("published.md")));}
            }catch(Exception e){rename=e.getMessage();}
            output.add("access="+Integer.toHexString(access)+" sharing="+sharing+" ownRename="+rename+" independentMove="+move+" junction="+junction+" handle-relative-after-reparse="+underJunction+" outside-file-created="+Files.exists(outside.resolve("published.md")));
        }
        Files.writeString(Path.of("native/linked-markdown/evidence/g3b/directory-leases.txt"),String.join("\n",output)+"\n");output.forEach(System.out::println);
    }
}
