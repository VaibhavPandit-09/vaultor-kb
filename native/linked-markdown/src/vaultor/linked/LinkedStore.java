package vaultor.linked;

import java.io.*;
import java.nio.channels.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.nio.file.attribute.*;
import java.security.*;
import java.util.*;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;

/** In-process Java-host authority; deliberately not a Spring bean or public API. */
public final class LinkedStore implements AutoCloseable {
    public enum Client { LOCAL_DESKTOP_OWNER, BROWSER, ANDROID, REMOTE_DESKTOP }
    public record Scope(String workspace,String generation,Client client){}
    public record Revision(String identity,String sha256,String metadata){}
    public record Snapshot(Revision revision,byte[] bytes,long size) { public Snapshot {bytes=bytes.clone();} @Override public byte[] bytes(){return bytes.clone();} }
    public record Opened(String document,String epoch,Snapshot base){}
    public record Receipt(String operation,long version,String state,Revision revision){}
    public record Change(String state,Snapshot disk,boolean dirty,String draft){}
    @FunctionalInterface public interface Faults {void at(String phase,Path operation)throws Exception;}
    static final int SOURCE_LIMIT=262144,READ_LIMIT=8*1024*1024,DRAFT_LIMIT=1024*1024;
    static final int JOURNAL_LIMIT=20*1024*1024; static final long STORE_LIMIT=256L*1024*1024;
    static final class Root {final Path path;final String identity;boolean connected=true,revoked;String epoch=UUID.randomUUID().toString();Root(Path p,String id){path=p;identity=id;}}
    static final class Doc {final Root root;final String relative,epoch;Snapshot base;long version=-1,saved=-1;String draft="",candidate,viewId;byte[] local,lastValidated;boolean recoveryOnly;Doc(Root r,String n,Snapshot b){root=r;relative=n;base=b;epoch=r.epoch;lastValidated=b.bytes();}}
    private final Scope owner; private final Path privateRoot; private final byte[] validationKey,consentKey;
    private final List<Path> protectedPaths;
    private final Set<String> usedConsents=new HashSet<>();
    private final Map<String,Root> roots=new HashMap<>();private final Map<String,Doc> docs=new HashMap<>();
    private final FileChannel lockChannel;private final FileLock lock;private final Faults faults;
    private boolean closed;
    private boolean originalObjectWrites;
    private record Review(String operation,Root root,String epoch,Journal.Record record,Snapshot disk,long expires){}
    private final Map<String,Review> reviews=new HashMap<>();
    public record RecoveryReview(String ticket,String state,byte[] base,byte[] local,String visual,Snapshot disk){}
    /** Explicit isolated Gate3 admission; legacy Gate2 remains reproducible. */
    /** Rejected G3 experiment, callable only by disposable native fault probes.
     * Exclusive sharing and RWH oplocks did not prevent hardlink creation. */
    public synchronized void useOriginalObjectWrites(Scope scope)throws IOException{scope(scope);if(!Boolean.getBoolean("vaultor.linked.g3.unsafe-publication-probe"))throw new IOException("G3_PUBLICATION_UNQUALIFIED");if(!docs.isEmpty())throw new IOException("PUBLICATION_ALREADY_IN_USE");originalObjectWrites=true;}
    public LinkedStore(Scope owner,Path privateRoot,byte[] validationKey,byte[] consentKey,List<Path> hostProtectedPaths,Faults faults)throws IOException{
        if(!System.getProperty("os.name").startsWith("Windows")||!Set.of("amd64","x86_64").contains(System.getProperty("os.arch")))throw new IOException("PLATFORM_UNQUALIFIED");
        if(owner.client()!=Client.LOCAL_DESKTOP_OWNER||validationKey.length<32||consentKey.length<32||Arrays.equals(validationKey,consentKey))throw new IOException("LOCAL_OWNER_AND_SEPARATE_KEYS_REQUIRED");
        this.owner=owner;this.privateRoot=privateRoot.toAbsolutePath().normalize();this.validationKey=validationKey.clone();this.consentKey=consentKey.clone();this.faults=faults==null?(phase,path)->{}:faults;
        var protectedList=new ArrayList<>(Objects.requireNonNull(hostProtectedPaths));protectedList.add(this.privateRoot);this.protectedPaths=protectedList.stream().map(p->p.toAbsolutePath().normalize()).toList();
        // Catalog exclusions must use the same canonical namespace as grants.
        // Refuse aliases instead of allowing a junctioned host-storage path to
        // hide its physical target from overlap checks. Missing descendants are
        // allowed only beneath an existing canonical, no-reparse ancestor.
        for(Path protectedPath:this.protectedPaths){Path ancestor=protectedPath;while(ancestor!=null&&!Files.exists(ancestor,LinkOption.NOFOLLOW_LINKS))ancestor=ancestor.getParent();if(ancestor==null)throw new IOException("PROTECTED_VOLUME_UNAVAILABLE");try(var pins=WindowsFiles.pin(ancestor)){if(!pins.canonicalPath().equals(ancestor))throw new IOException("PROTECTED_STORE_ALIAS_UNQUALIFIED");}}
        byte[] marker=utf8("G2-PRIVATE-STORE-1\n"+owner.workspace()+"\n"+owner.generation());
        WindowsFiles.localNtfs(this.privateRoot);try(var parent=WindowsFiles.pin(this.privateRoot.getParent())){if(!parent.canonicalPath().equals(this.privateRoot.getParent()))throw new IOException("PRIVATE_STORE_ALIAS_UNQUALIFIED");}if(Files.exists(this.privateRoot,LinkOption.NOFOLLOW_LINKS)){
            try(var pins=WindowsFiles.pin(this.privateRoot);var h=WindowsFiles.lease(this.privateRoot.resolve("store.marker"),false)){if(!Arrays.equals(marker,WindowsFiles.read(h,4096)))throw new IOException("JOURNAL_SCOPE");}
        }
        try(var parent=WindowsFiles.pin(this.privateRoot.getParent())){privateDirectory(this.privateRoot);}
        try(var pins=WindowsFiles.pin(this.privateRoot)){ if(!Files.exists(this.privateRoot.resolve("store.marker"),LinkOption.NOFOLLOW_LINKS))WindowsFiles.createFlushed(this.privateRoot.resolve("store.marker"),marker);
            lockChannel=FileChannel.open(this.privateRoot.resolve("owner.lock"),StandardOpenOption.CREATE,StandardOpenOption.WRITE);privateAcl(this.privateRoot.resolve("owner.lock"));
            try{lock=lockChannel.tryLock();}catch(OverlappingFileLockException e){lockChannel.close();throw new IOException("JOURNAL_OWNER_LOCK",e);}if(lock==null){lockChannel.close();throw new IOException("JOURNAL_OWNER_LOCK");}
        }
    }
    static String hash(byte[] bytes){try{return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes));}catch(NoSuchAlgorithmException e){throw new AssertionError(e);}}
    static byte[] utf8(String text){return text.getBytes(StandardCharsets.UTF_8);}
    static void privateAcl(Path p)throws IOException{var acl=Files.getFileAttributeView(p,AclFileAttributeView.class,LinkOption.NOFOLLOW_LINKS);if(acl==null)throw new IOException("WINDOWS_ACL_REQUIRED");var user=Files.getOwner(p,LinkOption.NOFOLLOW_LINKS);acl.setAcl(List.of(AclEntry.newBuilder().setType(AclEntryType.ALLOW).setPrincipal(user).setPermissions(EnumSet.allOf(AclEntryPermission.class)).build()));if(acl.getAcl().stream().anyMatch(e->!e.principal().equals(user)))throw new IOException("PRIVATE_ACL_FAILED");}
    static void privateDirectory(Path p)throws IOException{if(!Files.exists(p,LinkOption.NOFOLLOW_LINKS))Files.createDirectory(p);try(var pins=WindowsFiles.pin(p)){privateAcl(p);}}
    private void scope(Scope scope)throws IOException{if(closed)throw new IOException("HOST_CLOSED");if(!owner.equals(scope)||scope.client()!=Client.LOCAL_DESKTOP_OWNER)throw new IOException("SCOPE_DENIED");}
    private Root root(Scope s,String id)throws IOException{scope(s);var r=roots.get(id);if(r==null)throw new IOException("ROOT_CAPABILITY");if(!r.connected)throw new IOException("SOURCE_UNAVAILABLE");return r;}
    WindowsFiles.Pins rootPins(Root r)throws IOException{try{var p=WindowsFiles.pin(r.path);if(!p.last().identity().equals(r.identity)){p.close();throw new IOException("ROOT_REPLACED");}return p;}catch(IOException e){if(e.getMessage().equals("ROOT_REPLACED"))throw e;throw new IOException("SOURCE_UNAVAILABLE:"+e.getMessage(),e);}}
    private Doc doc(Scope scope,String cap,String epoch)throws IOException{scope(scope);var d=docs.get(cap);if(d==null)throw new IOException("DOCUMENT_CAPABILITY");if(d.root.revoked)throw new IOException("ROOT_REVOKED");if(!d.root.connected)throw new IOException("SOURCE_UNAVAILABLE");if(!d.epoch.equals(epoch)||!d.root.epoch.equals(epoch))throw new IOException("SOURCE_EPOCH_STALE");return d;}
    static String relative(String n)throws IOException{if(n==null||n.length()>1000||n.contains("\\")||n.contains(":"))throw new IOException("RELATIVE_PATH");String[] segments=n.split("/",-1);if(segments.length>32)throw new IOException("PATH_DEPTH");for(String part:segments)if(part.isEmpty()||part.equals(".")||part.equals("..")||part.endsWith(".")||part.endsWith(" ")||part.matches("(?i)(CON|PRN|AUX|NUL|COM[0-9]|LPT[0-9])(?:\\..*)?")||part.matches(".*[<>\"|?*\\x00-\\x1f].*")||part.equalsIgnoreCase(".git"))throw new IOException("RELATIVE_PATH");if(!n.toLowerCase(Locale.ROOT).endsWith(".md"))throw new IOException("MARKDOWN_ONLY");return n;}
    public static String consentPayload(Scope scope,Path selected,String nonce,long expires){return "G2-ROOT-1\n"+scope.workspace()+"\n"+scope.generation()+"\n"+selected.toAbsolutePath().normalize()+"\n"+nonce+"\n"+expires;}
    /** Signed one-use picker result, never a renderer-selected path/role flag. */
    public synchronized String authorizeSelectedRoot(Scope scope,Path selected,String nonce,long expires,String signature)throws IOException{
        scope(scope);if(usedConsents.size()>=128)throw new IOException("ROOT_LIMIT");
        long now=System.currentTimeMillis();if(expires<now||expires>now+60000||usedConsents.contains(nonce))throw new IOException("ROOT_CONSENT_EXPIRED_OR_REPLAYED");
        String expected=mac(consentKey,consentPayload(scope,selected,nonce,expires));if(signature==null||!MessageDigest.isEqual(utf8(expected),utf8(signature)))throw new IOException("ROOT_CONSENT_PROOF");
        usedConsents.add(nonce);var path=selected.toAbsolutePath().normalize();if(protectedPaths.stream().anyMatch(p->path.startsWith(p)||p.startsWith(path)))throw new IOException("PROTECTED_HOST_LOCATION");try(var p=WindowsFiles.pin(path)){if(!p.canonicalPath().equals(path))throw new IOException("ROOT_ALIAS_UNQUALIFIED");String identity=p.last().identity();for(var entry:roots.entrySet()){var existing=entry.getValue();if(existing.path.equals(path)&&existing.identity.equals(identity)&&!existing.revoked){if(!existing.connected){existing.connected=true;existing.epoch=UUID.randomUUID().toString();}return entry.getKey();}}if(roots.size()>=8)throw new IOException("ROOT_LIMIT");String id=UUID.randomUUID().toString();roots.put(id,new Root(p.canonicalPath(),identity));return id;}
    }
    public synchronized void disconnect(Scope s,String root)throws IOException{scope(s);var r=roots.get(root);if(r==null)throw new IOException("ROOT_CAPABILITY");r.connected=false;r.epoch=UUID.randomUUID().toString();}
    public synchronized void revoke(Scope s,String root)throws IOException{scope(s);var r=roots.remove(root);if(r==null)throw new IOException("ROOT_CAPABILITY");r.revoked=true;r.connected=false;r.epoch=UUID.randomUUID().toString();}
    public synchronized void reconnect(Scope s,String root)throws IOException{scope(s);var r=roots.get(root);if(r==null)throw new IOException("ROOT_CAPABILITY");try(var pins=rootPins(r)){r.connected=true;r.epoch=UUID.randomUUID().toString();}}
    Snapshot snapshot(WindowsFiles.Handle parent,String name,boolean writable)throws IOException{try(var h=WindowsFiles.leaseRelative(parent,name,writable)){var i=WindowsFiles.info(h);byte[] bytes=i.size()<=SOURCE_LIMIT?WindowsFiles.read(h,SOURCE_LIMIT):new byte[0];return new Snapshot(new Revision(i.identity(),i.size()<=SOURCE_LIMIT?hash(bytes):"READ_ONLY_LARGE",metadata(h,i)),bytes,i.size());}}
    static String metadata(WindowsFiles.Handle h,WindowsFiles.Info info)throws IOException{var security=WindowsFiles.security(h);return hash(utf8(info.attributes()+"\n"+HexFormat.of().formatHex(security.owner())+"\n"+HexFormat.of().formatHex(security.dacl())+"\n"+security.protectedDacl()));}
    public synchronized Opened openRelative(Scope s,String root,String name)throws IOException{
        var r=root(s,root);relative(name);if(docs.size()>=64)throw new IOException("DOCUMENT_LIMIT");try(var pins=rootPins(r);var parents=WindowsFiles.pin(r.path.resolve(name).getParent())){var snap=snapshot(parents.handle(),r.path.resolve(name).getFileName().toString(),false);String cap=UUID.randomUUID().toString();docs.put(cap,new Doc(r,name,snap));return new Opened(cap,r.epoch,snap);}
    }
    public synchronized byte[] readChunk(Scope s,String cap,String epoch,long offset,int length)throws IOException{
        var d=doc(s,cap,epoch);if(offset<0||length<1||length>65536)throw new IOException("CHUNK_RANGE");try(var p=rootPins(d.root);var parents=WindowsFiles.pin(d.root.path.resolve(d.relative).getParent());var h=WindowsFiles.leaseRelative(parents.handle(),d.root.path.resolve(d.relative).getFileName().toString(),false)){if(!WindowsFiles.info(h).identity().equals(d.base.revision().identity()))throw new IOException("DOCUMENT_REPLACED");return WindowsFiles.readRange(h,offset,length);}
    }
    public static String proofPayload(String document,String epoch,long version,Revision base,byte[] source,String visual){return "G2-VALIDATED-1\n"+document+"\n"+epoch+"\n"+version+"\n"+base.identity()+"\n"+base.sha256()+"\n"+base.metadata()+"\n"+hash(source)+"\n"+hash(utf8(visual));}
    private static String mac(byte[] key,String payload)throws IOException{try{Mac mac=Mac.getInstance("HmacSHA256");mac.init(new SecretKeySpec(key,"HmacSHA256"));return HexFormat.of().formatHex(mac.doFinal(utf8(payload)));}catch(GeneralSecurityException e){throw new IOException(e);}}
    private String proof(String payload)throws IOException{return mac(validationKey,payload);}
    /** Caller is the trusted validation bridge, not renderer HTTP/IPC. Invalid
     * proofs never mint candidates. Draft persistence has no Save side effect. */
    public synchronized String journalDraft(Scope s,String cap,String epoch,long version,String visual,byte[] validated,String attestation)throws IOException{
        scope(s);var d=docs.get(cap);if(d==null||!d.epoch.equals(epoch))throw new IOException("DOCUMENT_CAPABILITY_OR_EPOCH");
        if(version<=d.version)throw new IOException("DRAFT_VERSION_OR_SIZE");
        // Observing a newer draft revokes the old Save ticket even if journaling
        // or validation then fails. Never let an old ready ticket write over it.
        d.candidate=null;d.local=null;d.version=version;
        if(utf8(visual).length>DRAFT_LIMIT)throw new IOException("DRAFT_SIZE_OR_READ_ONLY_LARGE");
        d.draft=visual;validated=validated==null?null:validated.clone();
        if(validated!=null){if(validated.length>SOURCE_LIMIT||d.base.size()>SOURCE_LIMIT)throw new IOException("VISUAL_SOURCE_LIMIT");var expected=proof(proofPayload(cap,epoch,version,d.base.revision(),validated,visual));if(attestation==null||!MessageDigest.isEqual(utf8(expected),utf8(attestation)))throw new IOException("VALIDATION_PROOF");}
        if(d.base.size()>SOURCE_LIMIT)throw new IOException("READ_ONLY_LARGE");
        if(validated!=null)try{StandardCharsets.UTF_8.newDecoder().onMalformedInput(java.nio.charset.CodingErrorAction.REPORT).decode(java.nio.ByteBuffer.wrap(validated));}catch(java.nio.charset.CharacterCodingException e){throw new IOException("VALIDATED_UTF8_REQUIRED",e);}
        try(var privatePins=WindowsFiles.pin(privateRoot)){
            var id=UUID.randomUUID().toString();Path op=newOperation(id);try(var operationPin=WindowsFiles.pin(op)){var record=new Journal.Record(id,owner.workspace(),owner.generation(),d.root.identity,d.relative,epoch,version,validated==null?"DRAFT_UNVALIDATED":"DRAFT_VALIDATED",d.base.revision(),d.base.bytes(),validated==null?d.lastValidated:validated,visual);persist(op,record,0);if(d.viewId!=null){String body=String.join("\n",owner.workspace(),owner.generation(),d.root.identity,d.relative,d.base.revision().identity(),d.viewId);byte[] ref=utf8(body+"\n"+hash(utf8(body)));quota(ref.length);WindowsFiles.createFlushed(op.resolve("view.ref"),ref);}
            if(validated!=null)d.lastValidated=validated.clone();d.local=validated;d.candidate=validated==null||d.recoveryOnly||d.root.revoked||!d.root.connected||!d.epoch.equals(d.root.epoch)?null:UUID.randomUUID().toString();return d.candidate;}
        }
    }
    private Path newOperation(String id)throws IOException{quota();try(var list=Files.list(privateRoot)){if(list.filter(p->p.getFileName().toString().matches("[0-9a-f-]{36}")).count()>=100)throw new IOException("JOURNAL_OPERATION_LIMIT");}Path op=privateRoot.resolve(id);Files.createDirectory(op);privateAcl(op);return op;}
    private void quota()throws IOException{quota(0);}
    private void quota(long additional)throws IOException{
        long bytes=additional;int count=0;
        try(var entries=Files.list(privateRoot)){
            var all=entries.limit(103).toList();if(all.size()>102)throw new IOException("JOURNAL_QUOTA");
            for(Path entry:all){String name=entry.getFileName().toString();
                if(name.equals("store.marker")||name.equals("owner.lock"))continue;
                if(!name.matches("[0-9a-f-]{36}"))throw new IOException("JOURNAL_ENTRY_TYPE");
                try(var pins=WindowsFiles.pin(entry);var files=Files.list(entry)){
                    var children=files.limit(13).toList();if(children.size()>12)throw new IOException("JOURNAL_QUOTA");
                    for(Path file:children){if(!file.getFileName().toString().matches("(?:[0-9]{2}\\.rec|stage\\.md|captured\\.md|external\\.md|view\\.ref)"))throw new IOException("JOURNAL_ENTRY_TYPE");bytes+=WindowsFiles.attributes(file).size();if(++count>1000||bytes>STORE_LIMIT)throw new IOException("JOURNAL_QUOTA");}
                }
            }
        }
        if(bytes>STORE_LIMIT)throw new IOException("JOURNAL_QUOTA");
    }
    private void persist(Path op,Journal.Record r,int index)throws IOException{byte[] bytes=Journal.encode(r);quota(bytes.length);WindowsFiles.createFlushed(op.resolve(String.format(Locale.ROOT,"%02d.rec",index)),bytes);}
    private void hook(String phase,Path op)throws IOException{try{faults.at(phase,op);}catch(Exception e){if(e instanceof IOException x)throw x;throw new IOException("FAULT:"+phase,e);}}
    public synchronized Receipt save(Scope s,String cap,String epoch,String candidate,String operation)throws IOException{
        if(originalObjectWrites)return saveOriginal(s,cap,epoch,candidate,operation);
        var d=doc(s,cap,epoch);try{if(!UUID.fromString(operation).toString().equals(operation))throw new IllegalArgumentException();}catch(Exception e){throw new IOException("OPERATION_ID");}
        if(candidate==null||!candidate.equals(d.candidate)||d.local==null)throw new IOException("UNVALIDATED_DRAFT");
        long savingVersion=d.version;byte[] local=d.local.clone();Snapshot base=d.base;String visual=d.draft;d.candidate=null;Path op=privateRoot.resolve(operation);if(Files.exists(op,LinkOption.NOFOLLOW_LINKS))throw new IOException("OPERATION_ALREADY_RECORDED");
        try(var rootPin=rootPins(d.root);var parentPin=WindowsFiles.pin(d.root.path.resolve(d.relative).getParent());var privatePin=WindowsFiles.pin(privateRoot)){
            if(!rootPin.last().identity().split(":")[0].equals(privatePin.last().identity().split(":")[0]))throw new IOException("JOURNAL_VOLUME_MISMATCH");
            op=newOperation(operation);try(var operationPin=WindowsFiles.pin(op)){var r=new Journal.Record(operation,owner.workspace(),owner.generation(),d.root.identity,d.relative,epoch,savingVersion,"PREPARED",base.revision(),base.bytes(),local,visual);persist(op,r,0);hook("prepared",op);
            var target=d.root.path.resolve(d.relative);Path stage=op.resolve("stage.md"),capture=op.resolve("captured.md");
            hook("before-lease",op);
            try(var original=WindowsFiles.leaseRelative(parentPin.handle(),target.getFileName().toString(),true)){
                var info=WindowsFiles.info(original);byte[] current=WindowsFiles.read(original,READ_LIMIT);var disk=new Revision(info.identity(),hash(current),metadata(original,info));
                if(!disk.equals(base.revision())){quota(current.length);WindowsFiles.createFlushed(op.resolve("external.md"),current);persist(op,r.state("CONFLICT:"+disk.identity()+":"+disk.sha256()),1);return new Receipt(operation,savingVersion,"CONFLICT",disk);}
                try(var marker=WindowsFiles.lease(privateRoot.resolve("store.marker"),false)){if(!Arrays.equals(WindowsFiles.security(original).owner(),WindowsFiles.security(marker).owner()))throw new IOException("SOURCE_OWNER_UNQUALIFIED");}
                quota(local.length);Path operationPath=op;WindowsFiles.createFlushed(stage,local,()->hook("stage-chunk",operationPath),()->hook("stage-before-flush",operationPath));persist(op,r.state("STAGED"),1);hook("staged",op);
                try(var staged=WindowsFiles.stageLease(stage)){
                    if(!hash(WindowsFiles.read(staged,SOURCE_LIMIT)).equals(hash(local)))throw new IOException("STAGE_CHANGED");
                    hook("before-capture",op);doc(s,cap,epoch);quota(info.size()+3L*Journal.encode(r).length);rootPin.verify();parentPin.verify();operationPin.verify();WindowsFiles.renameExclusive(original,operationPin.handle(),"captured.md");hook("captured-before-journal",op);persist(op,r.state("CAPTURED"),2);hook("captured",op);
                    doc(s,cap,epoch);rootPin.verify();parentPin.verify();hook("publication-boundary",op);WindowsFiles.renameExclusive(staged,parentPin.handle(),target.getFileName().toString());hook("published-before-metadata",op);WindowsFiles.copyMetadata(original,staged);hook("published-before-journal",op);persist(op,r.state("PUBLISHED"),3);hook("published",op);
                }
            }catch(IOException e){persist(op,r.state("UNCERTAIN:"+e.getMessage()),4);return new Receipt(operation,savingVersion,"RECOVERY_REQUIRED",null);}
            hook("before-final-check",op);
            try{rootPin.verify();parentPin.verify();}catch(IOException changed){persist(op,r.state("UNCERTAIN_SCOPE"),4);return new Receipt(operation,savingVersion,"RECOVERY_REQUIRED",null);}var finalState=snapshot(parentPin.handle(),target.getFileName().toString(),false);if(!finalState.revision().sha256().equals(hash(local))){if(finalState.size()<=SOURCE_LIMIT){quota(finalState.size());WindowsFiles.createFlushed(op.resolve("external.md"),finalState.bytes());}persist(op,r.state("EXTERNAL_AFTER_PUBLICATION:"+finalState.revision().sha256()),4);return new Receipt(operation,savingVersion,"CONFLICT_AFTER_PUBLICATION",finalState.revision());}
            if(!finalState.revision().metadata().equals(base.revision().metadata())){persist(op,r.state("METADATA_RECOVERY_REQUIRED"),4);return new Receipt(operation,savingVersion,"RECOVERY_REQUIRED",finalState.revision());}persist(op,r.state("COMMITTED"),5);hook("committed",op);d.base=finalState;d.saved=savingVersion;if(d.version!=savingVersion)d.candidate=null;return new Receipt(operation,savingVersion,"COMMITTED",finalState.revision());}
        }
    }
    private Receipt saveOriginal(Scope scope,String cap,String epoch,String candidate,String operation)throws IOException{
        var d=doc(scope,cap,epoch);try{if(!UUID.fromString(operation).toString().equals(operation))throw new IllegalArgumentException();}catch(Exception e){throw new IOException("OPERATION_ID");}
        if(candidate==null||!candidate.equals(d.candidate)||d.local==null)throw new IOException("UNVALIDATED_DRAFT");
        long version=d.version;byte[] local=d.local.clone();Snapshot base=d.base;String visual=d.draft;d.candidate=null;
        try(var root=rootPins(d.root);var parent=WindowsFiles.pin(d.root.path.resolve(d.relative).getParent());var privatePins=WindowsFiles.pin(privateRoot)){
            if(!root.last().identity().split(":")[0].equals(privatePins.last().identity().split(":")[0]))throw new IOException("JOURNAL_VOLUME_MISMATCH");
            Path op=newOperation(operation);try(var operationPin=WindowsFiles.pin(op)){
                var record=new Journal.Record(operation,owner.workspace(),owner.generation(),d.root.identity,d.relative,epoch,version,"ORIGINAL_PREPARED",base.revision(),base.bytes(),local,visual);
                persist(op,record,0);hook("original-prepared",op);
                try(var original=WindowsFiles.exclusiveWriter(parent.handle(),Path.of(d.relative).getFileName().toString())){
                    try(var marker=WindowsFiles.lease(privateRoot.resolve("store.marker"),false)){if(!Arrays.equals(WindowsFiles.security(original).owner(),WindowsFiles.security(marker).owner()))throw new IOException("SOURCE_OWNER_UNQUALIFIED");}
                    var info=WindowsFiles.info(original);byte[] disk=WindowsFiles.readStart(original,READ_LIMIT);var revision=new Revision(info.identity(),hash(disk),metadata(original,info));
                    if(!revision.equals(base.revision())){quota(disk.length);WindowsFiles.createFlushed(op.resolve("external.md"),disk);persist(op,record.state("CONFLICT"),1);return new Receipt(operation,version,"CONFLICT",revision);}
                    quota(local.length+3L*Journal.encode(record).length);WindowsFiles.createFlushed(op.resolve("stage.md"),local);persist(op,record.state("ORIGINAL_STAGED"),1);hook("original-staged",op);
                    doc(scope,cap,epoch);root.verify();parent.verify();operationPin.verify();hook("original-before-write",op);doc(scope,cap,epoch);root.verify();parent.verify();
                    WindowsFiles.overwrite(original,local,()->hook("original-write-chunk",op),()->hook("original-before-flush",op));hook("original-flushed",op);
                    root.verify();parent.verify();var finalInfo=WindowsFiles.info(original);byte[] finalBytes=WindowsFiles.readStart(original,SOURCE_LIMIT);var finalRevision=new Revision(finalInfo.identity(),hash(finalBytes),metadata(original,finalInfo));
                    if(!finalRevision.identity().equals(base.revision().identity())||!finalRevision.sha256().equals(hash(local))||!finalRevision.metadata().equals(base.revision().metadata()))throw new IOException("ORIGINAL_FINAL_MISMATCH");
                    persist(op,record.state("ORIGINAL_COMMITTED"),2);hook("original-committed",op);d.base=new Snapshot(finalRevision,finalBytes,finalBytes.length);d.saved=version;if(d.version!=version)d.candidate=null;return new Receipt(operation,version,"COMMITTED",finalRevision);
                }catch(IOException failure){persist(op,record.state("ORIGINAL_RECOVERY_REQUIRED:"+failure.getMessage()),3);return new Receipt(operation,version,"RECOVERY_REQUIRED",null);}
            }
        }
    }
    public synchronized void closeDocument(Scope scope,String cap)throws IOException{scope(scope);if(docs.remove(cap)==null)throw new IOException("DOCUMENT_CAPABILITY");}
    public synchronized List<String> rootDocuments(Scope scope,String root)throws IOException{scope(scope);var owned=roots.get(root);if(owned==null)throw new IOException("ROOT_CAPABILITY");return docs.entrySet().stream().filter(entry->entry.getValue().root==owned).map(Map.Entry::getKey).toList();}
    public record RecoveredOpen(Opened opened,byte[] source,String visual,boolean recoveryOnly,String relative){}
    public synchronized RecoveredOpen openRecovery(Scope scope,String operation,String rootCapability)throws IOException{
        var root=root(scope,rootCapability);var record=recoveryRecord(scope,operation);if(!root.identity.equals(record.rootIdentity()))throw new IOException("RECOVERY_ROOT_IDENTITY");if(docs.size()>=64)throw new IOException("DOCUMENT_LIMIT");Snapshot disk=null;
        try(var pins=rootPins(root);var parent=WindowsFiles.pin(root.path.resolve(record.relative()).getParent())){try{disk=snapshot(parent.handle(),Path.of(record.relative()).getFileName().toString(),false);}catch(WindowsFiles.NativeFailure e){if(e.code!=2&&e.code!=3)throw e;}}
        var base=new Snapshot(record.baseRevision(),record.base(),record.base().length);var document=new Doc(root,record.relative(),base);document.recoveryOnly=disk==null||disk.size()>SOURCE_LIMIT||!disk.revision().identity().equals(base.revision().identity());document.lastValidated=record.local()==null?record.base():record.local();String capability=UUID.randomUUID().toString();docs.put(capability,document);return new RecoveredOpen(new Opened(capability,root.epoch,base),document.lastValidated,record.visual(),document.recoveryOnly,record.relative());
    }
    public synchronized void bindView(Scope scope,String document,String view)throws IOException{scope(scope);var d=docs.get(document);if(d==null)throw new IOException("DOCUMENT_CAPABILITY");try{if(!UUID.fromString(view).toString().equals(view))throw new IllegalArgumentException();}catch(Exception e){throw new IOException("VIEW_ID");}if(d.viewId!=null&&!d.viewId.equals(view))throw new IOException("VIEW_ALREADY_BOUND");d.viewId=view;}
    /** Metadata lookup only after explicit native root/file selection. Never a
     * path lookup or authority source; root + relative + original inode must match. */
    public synchronized String[] lookupView(Scope scope,String document)throws IOException{
        scope(scope);var d=docs.get(document);if(d==null)throw new IOException("DOCUMENT_CAPABILITY");
        try(var privatePins=WindowsFiles.pin(privateRoot);var entries=Files.list(privateRoot)){
            for(Path op:entries.filter(p->p.getFileName().toString().matches("[0-9a-f-]{36}")).sorted(Comparator.comparingLong((Path p)->p.toFile().lastModified()).reversed()).limit(100).toList()){
                try(var pin=WindowsFiles.pin(op);var ref=WindowsFiles.leaseRelative(pin.handle(),"view.ref",false)){
                    String[] fields=new String(WindowsFiles.read(ref,4096),StandardCharsets.UTF_8).split("\n",-1);if(fields.length!=7)continue;String body=String.join("\n",Arrays.copyOf(fields,6));
                    if(!hash(utf8(body)).equals(fields[6])||!fields[0].equals(owner.workspace())||!fields[1].equals(owner.generation())||!fields[2].equals(d.root.identity)||!fields[3].equals(d.relative)||!fields[4].equals(d.base.revision().identity()))continue;
                    if(!UUID.fromString(fields[5]).toString().equals(fields[5]))continue;return new String[]{fields[5],op.getFileName().toString()};
                }catch(IOException|IllegalArgumentException ignored){/* Damaged metadata never changes a binding. */}
            }
        }return new String[]{"",""};
    }
    public synchronized long[] metrics(Scope scope)throws IOException{
        scope(scope);long bytes=0,operations=0,files=0;try(var pins=WindowsFiles.pin(privateRoot);var entries=Files.list(privateRoot)){for(Path op:entries.limit(102).toList()){if(!op.getFileName().toString().matches("[0-9a-f-]{36}"))continue;operations++;try(var opPin=WindowsFiles.pin(op);var children=Files.list(op)){for(Path file:children.limit(13).toList()){bytes+=WindowsFiles.attributes(file).size();files++;}}}}
        return new long[]{java.lang.management.ManagementFactory.getMemoryMXBean().getHeapMemoryUsage().getUsed(),Runtime.getRuntime().totalMemory(),WindowsFiles.workingSet(),WindowsFiles.handleCount(),docs.size(),roots.size(),operations,bytes,files};
    }
    private Journal.Record recoveryRecord(Scope scope,String operation)throws IOException{return recoveryRecord(scope,operation,true);}
    private Journal.Record recoveryRecord(Scope scope,String operation,boolean undamaged)throws IOException{
        scope(scope);try{if(!UUID.fromString(operation).toString().equals(operation))throw new IllegalArgumentException();}catch(Exception e){throw new IOException("OPERATION_ID");}
        try(var privatePins=WindowsFiles.pin(privateRoot);var op=WindowsFiles.pin(privateRoot.resolve(operation))){var recovery=Journal.recover(privateRoot.resolve(operation),owner);if(recovery.record()==null||(undamaged&&recovery.damagedTail()))throw new IOException("CORRUPT_RECOVERY_EXPORT_ONLY");return recovery.record();}
    }
    public synchronized RecoveryReview reviewRecovery(Scope scope,String operation,String rootCapability)throws IOException{
        var root=root(scope,rootCapability);var record=recoveryRecord(scope,operation);if(!root.identity.equals(record.rootIdentity()))throw new IOException("RECOVERY_ROOT_IDENTITY");
        reviews.entrySet().removeIf(entry->entry.getValue().expires()<System.currentTimeMillis());if(reviews.size()>=8)throw new IOException("REVIEW_LIMIT");Snapshot disk=null;
        try(var rootPin=rootPins(root);var parent=WindowsFiles.pin(root.path.resolve(record.relative()).getParent())){try{disk=snapshot(parent.handle(),Path.of(record.relative()).getFileName().toString(),false);}catch(WindowsFiles.NativeFailure e){if(e.code!=2&&e.code!=3)throw e;}}
        String ticket=UUID.randomUUID().toString();reviews.put(ticket,new Review(operation,root,root.epoch,record,disk,System.currentTimeMillis()+60000));return new RecoveryReview(ticket,disk==null?"PATH_MISSING":disk.revision().identity().equals(record.baseRevision().identity())?"SAME_ORIGINAL_OBJECT":"INDEPENDENT_OCCUPANT",record.base(),record.local(),record.visual(),disk);
    }
    private Review consumeReview(Scope scope,String ticket)throws IOException{
        scope(scope);var review=reviews.remove(ticket);if(review==null||review.expires()<System.currentTimeMillis()||review.root().revoked||!review.root().connected||!review.root().epoch.equals(review.epoch()))throw new IOException("RECOVERY_REVIEW_STALE");return review;
    }
    /** Explicit reviewed repair of this same original object, never a reused path.
     * Current D is preserved as the new operation's B before any repair byte. */
    public synchronized Receipt repairRecovery(Scope scope,String ticket,String choice)throws IOException{
        var review=consumeReview(scope,ticket);var record=review.record();byte[] chosen=switch(choice){case "base"->record.base();case "local"->record.local();default->throw new IOException("RECOVERY_CHOICE");};
        if(chosen==null||review.disk()==null||!review.disk().revision().identity().equals(record.baseRevision().identity()))throw new IOException("INDEPENDENT_OR_MISSING_SOURCE");
        try(var root=rootPins(review.root());var parent=WindowsFiles.pin(review.root().path.resolve(record.relative()).getParent());var privatePin=WindowsFiles.pin(privateRoot);var target=WindowsFiles.exclusiveWriter(parent.handle(),Path.of(record.relative()).getFileName().toString())){
            try(var marker=WindowsFiles.lease(privateRoot.resolve("store.marker"),false)){if(!Arrays.equals(WindowsFiles.security(target).owner(),WindowsFiles.security(marker).owner()))throw new IOException("SOURCE_OWNER_UNQUALIFIED");}
            var info=WindowsFiles.info(target);byte[] current=WindowsFiles.readStart(target,SOURCE_LIMIT);var revision=new Revision(info.identity(),hash(current),metadata(target,info));if(!revision.equals(review.disk().revision()))throw new IOException("RECOVERY_DISK_CHANGED");
            String operation=UUID.randomUUID().toString();Path op=newOperation(operation);var repair=new Journal.Record(operation,owner.workspace(),owner.generation(),review.root().identity,record.relative(),review.epoch(),record.version(),"REPAIR_PREPARED",revision,current,chosen,record.visual());
            try(var pins=WindowsFiles.pin(op)){persist(op,repair,0);quota(chosen.length+2L*Journal.encode(repair).length);WindowsFiles.createFlushed(op.resolve("stage.md"),chosen);persist(op,repair.state("REPAIR_STAGED"),1);
                try{root.verify();parent.verify();WindowsFiles.overwrite(target,chosen,()->hook("repair-chunk",op),()->hook("repair-before-flush",op));root.verify();parent.verify();var after=WindowsFiles.info(target);var afterRevision=new Revision(after.identity(),hash(WindowsFiles.readStart(target,SOURCE_LIMIT)),metadata(target,after));if(!afterRevision.identity().equals(revision.identity())||!afterRevision.sha256().equals(hash(chosen))||!afterRevision.metadata().equals(revision.metadata()))throw new IOException("REPAIR_FINAL_MISMATCH");persist(op,repair.state("REPAIR_COMMITTED"),2);return new Receipt(operation,record.version(),"RECOVERY_REPAIRED_REOPEN_REQUIRED",afterRevision);}
                catch(IOException e){persist(op,repair.state("REPAIR_REQUIRED"),3);return new Receipt(operation,record.version(),"RECOVERY_REQUIRED",null);}
            }
        }
    }
    /** Legacy Gate2 gap recovery: only move the verified original inode back to
     * an absent name. Occupants, changed captures and ambiguous metadata refuse. */
    public synchronized Receipt restoreMissingBase(Scope scope,String ticket)throws IOException{
        var review=consumeReview(scope,ticket);if(review.disk()!=null)throw new IOException("INDEPENDENT_OCCUPANT");var record=review.record();Path op=privateRoot.resolve(review.operation());
        try(var root=rootPins(review.root());var parent=WindowsFiles.pin(review.root().path.resolve(record.relative()).getParent());var privatePin=WindowsFiles.pin(privateRoot);var operationPin=WindowsFiles.pin(op);var captured=WindowsFiles.leaseRelative(operationPin.handle(),"captured.md",true)){
            var info=WindowsFiles.info(captured);var revision=new Revision(info.identity(),hash(WindowsFiles.readStart(captured,SOURCE_LIMIT)),metadata(captured,info));if(!revision.equals(record.baseRevision()))throw new IOException("CAPTURE_CHANGED_EXPORT_REVIEW");
            if(Files.exists(op.resolve("06.rec"),LinkOption.NOFOLLOW_LINKS))throw new IOException("RECOVERY_ALREADY_RECORDED");persist(op,record.state("EXPLICIT_RESTORE_PREPARED"),6);root.verify();parent.verify();WindowsFiles.renameExclusive(captured,parent.handle(),Path.of(record.relative()).getFileName().toString());root.verify();parent.verify();persist(op,record.state("EXPLICIT_BASE_RESTORED"),7);return new Receipt(review.operation(),record.version(),"BASE_RESTORED_REOPEN_REQUIRED",revision);
        }
    }
    /** Export is a separate explicit new-file action, not source Save admission. */
    public synchronized String exportRecovery(Scope scope,String operation,String choice,String rootCapability,String name)throws IOException{
        byte[] chosen;if(Set.of("captured","stage","external").contains(choice))chosen=readRecoveryArtifact(scope,operation,choice);
        else{var record=recoveryRecord(scope,operation,false);chosen=switch(choice){case "base"->record.base();case "local"->record.local();case "visual"->utf8(record.visual());default->throw new IOException("RECOVERY_CHOICE");};}
        if(chosen==null)throw new IOException("RECOVERY_VERSION_MISSING");return exportBytes(scope,rootCapability,name,chosen);
    }
    public synchronized String exportReviewedDisk(Scope scope,String ticket,String rootCapability,String name)throws IOException{
        var review=consumeReview(scope,ticket);if(review.disk()==null||review.disk().size()!=review.disk().bytes().length)throw new IOException("REVIEW_DISK_UNAVAILABLE_OR_LARGE");return exportBytes(scope,rootCapability,name,review.disk().bytes());
    }
    private String exportBytes(Scope scope,String rootCapability,String name,byte[] chosen)throws IOException{
        var root=root(scope,rootCapability);relative(name);if(name.contains("/"))throw new IOException("EXPORT_LEAF_ONLY");
        try(var pins=rootPins(root);var output=WindowsFiles.createPrivateRelative(pins.handle(),name)){
            WindowsFiles.overwrite(output,chosen,()->{},()->{});if(!hash(WindowsFiles.readStart(output,READ_LIMIT)).equals(hash(chosen)))throw new IOException("EXPORT_VERIFY");pins.verify();return name;
        }
    }
    /** User explicitly resolves this reviewed evidence. No automatic expiry or
     * deletion of unresolved conflicts. Source files and other journals untouched. */
    public synchronized void resolveRecovery(Scope scope,String ticket)throws IOException{
        var review=consumeReview(scope,ticket);Path op=privateRoot.resolve(review.operation()).toAbsolutePath().normalize();if(!op.startsWith(privateRoot)||!op.getParent().equals(privateRoot))throw new IOException("RECOVERY_PATH");
        reviews.entrySet().removeIf(entry->entry.getValue().operation().equals(review.operation()));
        try(var privatePins=WindowsFiles.pin(privateRoot)){
            try(var pins=WindowsFiles.pin(op);var entries=Files.list(op)){
                var files=entries.limit(13).toList();if(files.size()>12)throw new IOException("RECOVERY_ENTRY_LIMIT");
                for(Path file:files){if(!file.getFileName().toString().matches("(?:[0-9]{2}\\.rec|stage\\.md|captured\\.md|external\\.md|view\\.ref)"))throw new IOException("RECOVERY_ENTRY_TYPE");try(var handle=WindowsFiles.leaseRelative(pins.handle(),file.getFileName().toString(),false)){} }
                // No new quota allocation is required to resolve a full store.
                // Interruption leaves remaining evidence for review, never an
                // automatically resumed deletion or source-file mutation.
                for(Path file:files){pins.verify();Files.delete(file);}
            }
            Files.delete(op);
        }
    }
    public synchronized Change reconcile(Scope s,String cap)throws IOException{
        scope(s);var d=docs.get(cap);if(d==null)throw new IOException("DOCUMENT_CAPABILITY");boolean dirty=d.version>d.saved;
        if(d.root.revoked)return new Change("SOURCE_REVOKED",null,dirty,d.draft);
        if(!d.root.connected)return new Change("SOURCE_UNAVAILABLE",null,dirty,d.draft);
        if(!d.root.epoch.equals(d.epoch))return new Change("SOURCE_EPOCH_STALE",null,dirty,d.draft);
        try(var p=rootPins(d.root);var parents=WindowsFiles.pin(d.root.path.resolve(d.relative).getParent())){
            Snapshot disk;try{disk=snapshot(parents.handle(),d.root.path.resolve(d.relative).getFileName().toString(),false);}catch(WindowsFiles.NativeFailure e){if(e.code==2||e.code==3)return new Change("DOCUMENT_MISSING",null,dirty,d.draft);throw e;}
            if(disk.size()>SOURCE_LIMIT)return new Change("DISK_TOO_LARGE_READ_ONLY",disk,dirty,d.draft);
            String state=!disk.revision().identity().equals(d.base.revision().identity())?"DOCUMENT_REPLACED":disk.revision().equals(d.base.revision())?"UNCHANGED":dirty?"CONFLICT":"EXTERNAL_CHANGED";
            return new Change(state,disk,dirty,d.draft);
        }catch(IOException e){
            String state=e.getMessage().startsWith("ROOT_REPLACED")?"ROOT_REPLACED":e.getMessage().startsWith("SOURCE_UNAVAILABLE")?"SOURCE_UNAVAILABLE":e instanceof WindowsFiles.NativeFailure n?(n.code==32?"BUSY_RETRY":"DOCUMENT_OR_DIRECTORY_UNAVAILABLE"):"DOCUMENT_UNQUALIFIED";
            if(state.equals("ROOT_REPLACED")||state.equals("SOURCE_UNAVAILABLE")){d.root.connected=false;d.root.epoch=UUID.randomUUID().toString();}
            return new Change(state,null,dirty,d.draft);
        }
    }
    public synchronized List<Journal.Recovery> recover(Scope scope)throws IOException{
        scope(scope);try(var pins=WindowsFiles.pin(privateRoot)){var result=new ArrayList<Journal.Recovery>();try(var list=Files.list(privateRoot)){for(Path op:list.limit(102).toList()){if(!op.getFileName().toString().matches("[0-9a-f-]{36}"))continue;if(result.size()>=100)throw new IOException("RECOVERY_LIMIT");try(var p=WindowsFiles.pin(op)){result.add(Journal.recover(op,owner));}}}return result;}
    }
    public record RecoverySummary(String operation,String state,String name,long version){}
    public synchronized List<RecoverySummary> recoverySummaries(Scope scope)throws IOException{
        scope(scope);var result=new ArrayList<RecoverySummary>();try(var pins=WindowsFiles.pin(privateRoot);var entries=Files.list(privateRoot)){
            for(Path op:entries.filter(p->p.getFileName().toString().matches("[0-9a-f-]{36}")).sorted(Comparator.comparingLong((Path p)->p.toFile().lastModified()).reversed()).limit(100).toList()){
                try(var operationPin=WindowsFiles.pin(op)){var recovery=Journal.recover(op,owner);var record=recovery.record();result.add(new RecoverySummary(recovery.operation(),recovery.damagedTail()?"DAMAGED_EXPORT_ONLY":recovery.state(),record==null?"Untrusted recovery artifact":Path.of(record.relative()).getFileName().toString(),record==null?-1:record.version()));}
            }
        }return result;
    }
    public synchronized Journal.Record inspectRecovery(Scope scope,String operation)throws IOException{return recoveryRecord(scope,operation,false);}
    /** Evidence export only: corrupt journals/artifacts never mint Save tickets. */
    public synchronized byte[] readRecoveryArtifact(Scope scope,String operation,String kind)throws IOException{
        scope(scope);try{if(!UUID.fromString(operation).toString().equals(operation))throw new IllegalArgumentException();}catch(Exception e){throw new IOException("OPERATION_ID");}
        if(!Set.of("captured","stage","external").contains(kind))throw new IOException("RECOVERY_ARTIFACT_KIND");
        Path op=privateRoot.resolve(operation);try(var parent=WindowsFiles.pin(privateRoot);var pins=WindowsFiles.pin(op);var h=WindowsFiles.lease(op.resolve(kind+".md"),false)){return WindowsFiles.read(h,READ_LIMIT);}
    }
    synchronized Path watchParent(Scope s,String cap)throws IOException{scope(s);var d=docs.get(cap);if(d==null)throw new IOException("DOCUMENT_CAPABILITY");return d.root.path.resolve(d.relative).getParent();}
    synchronized WindowsFiles.Notifications watchDirectory(Scope s,String cap)throws IOException{
        scope(s);var d=docs.get(cap);if(d==null)throw new IOException("DOCUMENT_CAPABILITY");doc(s,cap,d.epoch);
        try(var root=rootPins(d.root);var parent=WindowsFiles.pin(d.root.path.resolve(d.relative).getParent())){return new WindowsFiles.Notifications(parent);}
    }
    public synchronized void close()throws IOException{if(closed)return;closed=true;Arrays.fill(validationKey,(byte)0);Arrays.fill(consentKey,(byte)0);lock.release();lockChannel.close();}
}
