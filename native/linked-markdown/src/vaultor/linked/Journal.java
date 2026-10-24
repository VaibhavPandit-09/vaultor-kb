package vaultor.linked;
import java.io.*;
import java.nio.file.*;
import java.util.*;

/** Immutable bounded records. Corruption is evidence; never a reason to delete
 * a draft or replay a source write. Recovery performs no source mutations. */
public final class Journal {
 public record Record(String operation,String workspace,String generation,String rootIdentity,String relative,String epoch,long version,String state,LinkedStore.Revision baseRevision,byte[] base,byte[] local,String visual){
  Record state(String next){return new Record(operation,workspace,generation,rootIdentity,relative,epoch,version,next,baseRevision,base,local,visual);}
 }
 public record Recovery(String operation,String state,Record record,boolean damagedTail,boolean captured,boolean staged){}
 static void blob(DataOutputStream out,byte[] bytes)throws IOException{out.writeInt(bytes==null?-1:bytes.length);if(bytes!=null)out.write(bytes);}
 static byte[] blob(DataInputStream in,int max)throws IOException{int length=in.readInt();if(length==-1)return null;if(length<0||length>max)throw new IOException("JOURNAL_SIZE");byte[] b=in.readNBytes(length);if(b.length!=length)throw new IOException("JOURNAL_TRUNCATED");return b;}
 static void text(DataOutputStream out,String s)throws IOException{blob(out,LinkedStore.utf8(s));}
 static String text(DataInputStream in,int max)throws IOException{byte[] b=blob(in,max);if(b==null)throw new IOException("JOURNAL_FIELD");return new String(b,java.nio.charset.StandardCharsets.UTF_8);}
 public static byte[] encode(Record r)throws IOException{
  var bytes=new ByteArrayOutputStream();try(var out=new DataOutputStream(bytes)){
   out.writeInt(0x47324a31);for(String s:List.of(r.operation(),r.workspace(),r.generation(),r.rootIdentity(),r.relative(),r.epoch(),r.state(),r.baseRevision().identity(),r.baseRevision().sha256(),r.baseRevision().metadata()))text(out,s);
   out.writeLong(r.version());blob(out,r.base());blob(out,r.local());text(out,r.visual());
  }byte[] body=bytes.toByteArray();if(body.length>LinkedStore.JOURNAL_LIMIT)throw new IOException("JOURNAL_SIZE");bytes.write(HexFormat.of().parseHex(LinkedStore.hash(body)));return bytes.toByteArray();
 }
 public static Record decode(byte[] bytes)throws IOException{
  if(bytes.length<36||bytes.length>LinkedStore.JOURNAL_LIMIT)throw new IOException("JOURNAL_DAMAGED");byte[] body=Arrays.copyOf(bytes,bytes.length-32),digest=Arrays.copyOfRange(bytes,bytes.length-32,bytes.length);
  if(!java.security.MessageDigest.isEqual(HexFormat.of().parseHex(LinkedStore.hash(body)),digest))throw new IOException("JOURNAL_CHECKSUM");
  try(var in=new DataInputStream(new ByteArrayInputStream(body))){
   if(in.readInt()!=0x47324a31)throw new IOException("JOURNAL_SCHEMA");String[] s=new String[10];for(int i=0;i<s.length;i++)s[i]=text(in,4096);
   long version=in.readLong();byte[] base=blob(in,LinkedStore.READ_LIMIT),local=blob(in,LinkedStore.SOURCE_LIMIT);String visual=text(in,LinkedStore.DRAFT_LIMIT);
   if(base==null||in.available()!=0||!LinkedStore.hash(base).equals(s[8]))throw new IOException("JOURNAL_PAYLOAD");
   LinkedStore.relative(s[4]);return new Record(s[0],s[1],s[2],s[3],s[4],s[5],version,s[6],new LinkedStore.Revision(s[7],s[8],s[9]),base,local,visual);
  }
 }
 public static Recovery recover(Path op,LinkedStore.Scope owner)throws IOException{
  Record latest=null;boolean damaged=false;
  try(var list=Files.list(op)){
   for(Path file:list.filter(p->p.getFileName().toString().matches("[0-9]{2}\\.rec")).sorted().limit(10).toList()){
    try(var handle=WindowsFiles.lease(file,false)){
     Record record=decode(WindowsFiles.read(handle,LinkedStore.JOURNAL_LIMIT));
     if(!record.operation().equals(op.getFileName().toString())||!record.workspace().equals(owner.workspace())||!record.generation().equals(owner.generation()))throw new IOException("JOURNAL_SCOPE");latest=record;
    }catch(IOException e){damaged=true;}
   }
  }
  boolean captured=Files.exists(op.resolve("captured.md"),LinkOption.NOFOLLOW_LINKS),staged=Files.exists(op.resolve("stage.md"),LinkOption.NOFOLLOW_LINKS);
  if(latest==null)return new Recovery(op.getFileName().toString(),"CORRUPT_REVIEW",null,true,captured,staged);
  return new Recovery(latest.operation(),captured?"CAPTURED_REVIEW":staged?"STAGED_REVIEW":"DRAFT_OR_PUBLISHED_REVIEW",latest,damaged,captured,staged);
 }
}
