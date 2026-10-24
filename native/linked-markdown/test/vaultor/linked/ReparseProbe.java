package vaultor.linked;
import java.nio.file.*;import java.util.*;
public class ReparseProbe {
 public static void main(String[]args)throws Exception{
  Path dir=Files.createTempDirectory(Path.of("native/linked-markdown/.scratch"),"reparse-").toAbsolutePath(),outside=Files.createDirectory(dir.resolve("outside"));
  for(boolean pinned:List.of(false,true)){Path target=Files.createDirectory(dir.resolve(pinned?"pinned":"control"));
   WindowsFiles.Pins pins=pinned?WindowsFiles.pin(target):null;
   try{int result=SafetyTests.external("junction",target,outside.toString());System.out.println("PINNED="+pinned+" RESULT="+result);try(var info=WindowsFiles.open(target,0,7,WindowsFiles.OPEN,true)){System.out.println("NO_REPARSE");}catch(Exception e){System.out.println(e.getMessage());}}
   finally{if(pins!=null)pins.close();}
  }
 }
}
