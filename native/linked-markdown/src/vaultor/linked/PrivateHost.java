package vaultor.linked;

import java.io.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.util.*;

/** Bounded private stdin/stdout protocol. No listener or Spring route. The
 * default historical entrypoint refuses source writes; LinkedHost deliberately
 * selects the production policy without accepting a renderer policy flag. */
public final class PrivateHost {
    private static final int FRAME_LIMIT=6*1024*1024;
    private static String line(InputStream input)throws IOException{
        var bytes=new ByteArrayOutputStream();int value;
        while((value=input.read())!=-1&&value!='\n'){if(bytes.size()>=FRAME_LIMIT)throw new IOException("FRAME_LIMIT");bytes.write(value);}
        return value==-1&&bytes.size()==0?null:bytes.toString(StandardCharsets.UTF_8);
    }
    private static String[] decode(String line)throws IOException{
        try{return Arrays.stream(line.split("\t",-1)).map(s->new String(Base64.getDecoder().decode(s),StandardCharsets.UTF_8)).toArray(String[]::new);}catch(IllegalArgumentException e){throw new IOException("FRAME_ENCODING");}
    }
    private static void reply(long id,List<String> values){
        var output=new ArrayList<String>();output.add(Long.toString(id));output.addAll(values);
        System.out.println(String.join("\t",output.stream().map(s->Base64.getEncoder().encodeToString(LinkedStore.utf8(s))).toList()));System.out.flush();
    }
    private static List<String> snapshot(LinkedStore.Snapshot snapshot){
        if(snapshot==null)return List.of("","","","","0");
        return List.of(snapshot.revision().identity(),snapshot.revision().sha256(),snapshot.revision().metadata(),Base64.getEncoder().encodeToString(snapshot.bytes()),Long.toString(snapshot.size()));
    }
    private static void count(String[] frame,int expected)throws IOException{if(frame.length!=expected)throw new IOException("FRAME_FIELDS");}
    public static void main(String[] args)throws Exception{
        run(false);
    }
    static void run(boolean production)throws Exception {
        String first=line(System.in);if(first==null)return;String[] init=decode(first);if(init.length<8||init.length>16||!init[0].equals("INIT-G3"))throw new IOException("PRIVATE_INIT");
        var scope=new LinkedStore.Scope(init[1],init[2],LinkedStore.Client.LOCAL_DESKTOP_OWNER);
        byte[] validation=Base64.getDecoder().decode(init[5]),consent=Base64.getDecoder().decode(init[6]);
        var protectedPaths=new ArrayList<Path>(List.of(Path.of(init[4]),Path.of(init[7])));for(int i=8;i<init.length;i++)protectedPaths.add(Path.of(init[i]));
        try(var store=new LinkedStore(scope,Path.of(init[3]),validation,consent,protectedPaths,null);var monitor=new ChangeMonitor(store,scope,1000)){
            Arrays.fill(validation,(byte)0);Arrays.fill(consent,(byte)0);reply(0,List.of("READY",System.getProperty("java.runtime.version")));
            long previous=0;String raw;
            while((raw=line(System.in))!=null){String[] f=decode(raw);long id=Long.parseLong(f[0]);if(id<=previous)throw new IOException("FRAME_REPLAY");previous=id;
                try{
                    List<String> result=new ArrayList<>();result.add("OK");
                    switch(f[1]){
                        case "root"->{count(f,6);result.add(store.authorizeSelectedRoot(scope,Path.of(f[2]),f[3],Long.parseLong(f[4]),f[5]));}
                        case "root-info"->{count(f,3);result.add(store.rootIdentity(scope,f[2]));}
                        case "open"->{count(f,4);var opened=store.openRelative(scope,f[2],f[3]);try{monitor.register(opened.document());}catch(IOException e){store.closeDocument(scope,opened.document());throw e;}result.add(opened.document());result.add(opened.epoch());result.addAll(snapshot(opened.base()));}
                        case "open-linked"->{if(!production)throw new IOException("PRIVATE_COMMAND");count(f,4);var opened=store.openLinked(scope,f[2],f[3]);try{monitor.register(opened.document());}catch(IOException e){store.closeDocument(scope,opened.document());throw e;}result.add(opened.document());result.add(opened.epoch());result.addAll(snapshot(opened.base()));result.add(store.readonlyReason(scope,opened.document()));}
                        case "directory"->{if(!production)throw new IOException("PRIVATE_COMMAND");count(f,6);for(var entry:store.listDirectory(scope,f[2],f[3],Integer.parseInt(f[4]),Integer.parseInt(f[5]))){result.add(entry.name());result.add(Boolean.toString(entry.directory()));result.add(Boolean.toString(entry.markdown()));result.add(Long.toString(entry.size()));result.add(Long.toString(entry.modified()));result.add(entry.identity());result.add(Boolean.toString(entry.unsupported()));}}
                        case "draft"->{count(f,8);String candidate=store.journalDraft(scope,f[2],f[3],Long.parseLong(f[4]),f[5],f[6].equals("-")?null:Base64.getDecoder().decode(f[6]),f[7].equals("-")?null:f[7]);result.add(candidate==null?"":candidate);}
                        // The historical harness stays read-only. Production
                        // uses only the new-inode ordinary-file contract.
                        case "save"->{count(f,6);if(!production)throw new IOException("G3_PUBLICATION_UNQUALIFIED");var receipt=store.saveLinked(scope,f[2],f[3],f[4],f[5]);result.addAll(List.of(receipt.state(),Long.toString(receipt.version()),receipt.revision()==null?"":receipt.revision().identity(),receipt.revision()==null?"":receipt.revision().sha256(),receipt.revision()==null?"":receipt.revision().metadata(),receipt.operation()));}
                        case "check"->{count(f,3);var changed=store.reconcile(scope,f[2]);result.add(changed.state());result.add(Boolean.toString(changed.dirty()));result.addAll(snapshot(changed.disk()));}
                        case "close"->{count(f,3);monitor.unregister(f[2]);store.closeDocument(scope,f[2]);}
                        case "chunk"->{count(f,6);result.add(Base64.getEncoder().encodeToString(store.readChunk(scope,f[2],f[3],Long.parseLong(f[4]),Integer.parseInt(f[5]))));}
                        case "revoke"->{count(f,3);for(String document:store.rootDocuments(scope,f[2]))monitor.unregister(document);store.revoke(scope,f[2]);}
                        case "disconnect"->{count(f,3);for(String document:store.rootDocuments(scope,f[2]))monitor.unregister(document);store.disconnect(scope,f[2]);}
                        case "reconnect"->{count(f,3);store.reconnect(scope,f[2]);}
                        case "recovery"->{count(f,2);for(var recovery:store.recoverySummaries(scope)){result.add(recovery.operation());result.add(recovery.state());result.add(recovery.name());result.add(Long.toString(recovery.version()));}}
                        case "inspect"->{count(f,3);var record=store.inspectRecovery(scope,f[2]);result.add(Base64.getEncoder().encodeToString(record.base()));result.add(record.local()==null?"":Base64.getEncoder().encodeToString(record.local()));result.add(record.visual());result.add(record.state());}
                        case "review"->{count(f,4);var r=store.reviewRecovery(scope,f[2],f[3]);result.add(r.ticket());result.add(r.state());result.add(Base64.getEncoder().encodeToString(r.base()));result.add(r.local()==null?"":Base64.getEncoder().encodeToString(r.local()));result.add(r.visual());result.addAll(snapshot(r.disk()));}
                        case "repair"->{count(f,4);throw new IOException("G3_PUBLICATION_UNQUALIFIED");}
                        case "restore"->{count(f,3);if(!production)throw new IOException("G3_PUBLICATION_UNQUALIFIED");result.add(store.restoreMissingBase(scope,f[2]).state());}
                        case "metadata"->{count(f,3);if(!production)throw new IOException("G3_PUBLICATION_UNQUALIFIED");result.add(store.completeLinkedMetadata(scope,f[2]).state());}
                        case "ack-save"->{count(f,3);if(!production)throw new IOException("PRIVATE_COMMAND");store.acknowledgeLinkedSave(scope,f[2]);}
                        case "retain-draft"->{count(f,3);if(!production)throw new IOException("PRIVATE_COMMAND");store.retainViewDraft(scope,f[2]);}
                        case "export"->{count(f,6);result.add(store.exportRecovery(scope,f[2],f[3],f[4],f[5]));}
                        case "export-selected"->{if(!production)throw new IOException("PRIVATE_COMMAND");count(f,8);result.add(store.exportSelectedRecovery(scope,f[2],f[3],Path.of(f[4]),f[5],Long.parseLong(f[6]),f[7]));}
                        case "export-disk"->{count(f,5);result.add(store.exportReviewedDisk(scope,f[2],f[3],f[4]));}
                        case "resolve"->{count(f,3);store.resolveRecovery(scope,f[2]);}
                        case "recover-open"->{count(f,4);var recovered=store.openRecovery(scope,f[2],f[3]);try{if(!recovered.recoveryOnly())monitor.register(recovered.opened().document());}catch(IOException e){store.closeDocument(scope,recovered.opened().document());throw e;}result.add(recovered.opened().document());result.add(recovered.opened().epoch());result.addAll(snapshot(recovered.opened().base()));result.add(Base64.getEncoder().encodeToString(recovered.source()));result.add(recovered.visual());result.add(Boolean.toString(recovered.recoveryOnly()));result.add(recovered.relative());}
                        case "recover-linked"->{if(!production)throw new IOException("PRIVATE_COMMAND");count(f,4);var recovered=store.openLinkedRecovery(scope,f[2],f[3]);try{if(!recovered.recoveryOnly())monitor.register(recovered.opened().document());}catch(IOException e){store.closeDocument(scope,recovered.opened().document());throw e;}result.add(recovered.opened().document());result.add(recovered.opened().epoch());result.addAll(snapshot(recovered.opened().base()));result.add(Base64.getEncoder().encodeToString(recovered.source()));result.add(recovered.visual());result.add(Boolean.toString(recovered.recoveryOnly()));result.add(recovered.relative());result.add(Long.toString(store.inspectRecovery(scope,f[2]).version()));}
                        case "bind-view"->{count(f,4);store.bindView(scope,f[2],f[3]);}
                        case "lookup-view"->{count(f,3);result.addAll(List.of(store.lookupView(scope,f[2])));}
                        case "metrics"->{count(f,2);for(long value:store.metrics(scope))result.add(Long.toString(value));result.add(Long.toString(monitor.invalidations));result.add(Long.toString(monitor.rechecks));}
                        case "quit"->{count(f,2);reply(id,result);return;}
                        default->throw new IOException("PRIVATE_COMMAND");
                    }
                    reply(id,result);
                }catch(Exception e){String code=e instanceof IOException?e.getMessage().split(":",2)[0]:"INVALID_PRIVATE_REQUEST";if(!code.matches("[A-Z_a-z0-9]{1,100}"))code="NATIVE_REFUSED";reply(id,List.of("ERROR",code));}
            }
        }
    }
}
