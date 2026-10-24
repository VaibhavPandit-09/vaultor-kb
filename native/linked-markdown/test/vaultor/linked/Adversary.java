package vaultor.linked;
import java.nio.file.*;
import java.io.*;
/** Independent process used only against generated fixtures. */
public class Adversary {
 public static void main(String[]args)throws Exception{
  args[1]=new String(java.util.Base64.getDecoder().decode(args[1]),java.nio.charset.StandardCharsets.UTF_8);if(args.length>2)args[2]=new String(java.util.Base64.getDecoder().decode(args[2]),java.nio.charset.StandardCharsets.UTF_8);Path path=Path.of(args[1]);try{
   switch(args[0]){
    case "write"->Files.writeString(path,args[2]);
    case "create"->Files.writeString(path,args[2],StandardOpenOption.CREATE_NEW);
    case "replace"->{Path tmp=path.resolveSibling("external-"+java.util.UUID.randomUUID());Files.writeString(tmp,args[2]);Files.move(tmp,path,StandardCopyOption.ATOMIC_MOVE,StandardCopyOption.REPLACE_EXISTING);}
    case "posix-replace"->{Path tmp=path.resolveSibling("external-"+java.util.UUID.randomUUID());Files.writeString(tmp,args[2]);try(var parent=WindowsFiles.pin(path.getParent());var h=WindowsFiles.lease(tmp,true)){PublicationCandidates.renameOverwrite(h,parent.handle(),path.getFileName().toString(),true);}}
    case "delete"->Files.delete(path);
    case "move"->Files.move(path,Path.of(args[2]));
    case "hardlink"->Files.createLink(path,Path.of(args[2]));
    case "readonly"->Files.setAttribute(path,"dos:readonly",true);
    case "protect-dacl"->{try(var h=WindowsFiles.open(path,WindowsFiles.READ|0x40000,7,3,false)){ReplacementMetadata.protectPrivateStage(h);}}
    case "ads"->NamedStreamProbe.access(path+":fixture",args[2]);
    case "directory-write"->{try(var handle=WindowsFiles.open(path,WindowsFiles.WRITE,7,WindowsFiles.OPEN,true)){} }
    case "junction"->{byte[] sub=("\\??\\"+args[2]).replace("\\\\","\\").getBytes(java.nio.charset.StandardCharsets.UTF_16LE),print=args[2].getBytes(java.nio.charset.StandardCharsets.UTF_16LE);try(var h=WindowsFiles.open(path,WindowsFiles.WRITE,7,WindowsFiles.OPEN,true);var arena=java.lang.foreign.Arena.ofConfined()){var data=arena.allocate(20+sub.length+print.length,8);data.set(java.lang.foreign.ValueLayout.JAVA_INT,0,0xa0000003);data.set(java.lang.foreign.ValueLayout.JAVA_SHORT,4,(short)(12+sub.length+print.length));data.set(java.lang.foreign.ValueLayout.JAVA_SHORT,8,(short)0);data.set(java.lang.foreign.ValueLayout.JAVA_SHORT,10,(short)sub.length);data.set(java.lang.foreign.ValueLayout.JAVA_SHORT,12,(short)(sub.length+2));data.set(java.lang.foreign.ValueLayout.JAVA_SHORT,14,(short)print.length);java.lang.foreign.MemorySegment.copy(sub,0,data,java.lang.foreign.ValueLayout.JAVA_BYTE,16,sub.length);java.lang.foreign.MemorySegment.copy(print,0,data,java.lang.foreign.ValueLayout.JAVA_BYTE,18+sub.length,print.length);var count=arena.allocate(java.lang.foreign.ValueLayout.JAVA_INT);WindowsFiles.yes("SetReparse",WindowsFiles.invoke("DeviceIoControl",java.lang.foreign.FunctionDescriptor.of(java.lang.foreign.ValueLayout.JAVA_INT,java.lang.foreign.ValueLayout.ADDRESS,java.lang.foreign.ValueLayout.JAVA_INT,java.lang.foreign.ValueLayout.ADDRESS,java.lang.foreign.ValueLayout.JAVA_INT,java.lang.foreign.ValueLayout.ADDRESS,java.lang.foreign.ValueLayout.JAVA_INT,java.lang.foreign.ValueLayout.ADDRESS,java.lang.foreign.ValueLayout.ADDRESS),h.value,0x000900a4,data,(int)data.byteSize(),java.lang.foreign.MemorySegment.NULL,0,count,java.lang.foreign.MemorySegment.NULL));}}
    case "hold"->{try(var handle=WindowsFiles.lease(path,true)){System.out.println("READY");System.out.flush();System.in.read();}}
    default->throw new IllegalArgumentException();
   }
  }catch(IOException e){System.out.println("BLOCKED");System.exit(2);}
 }
}
