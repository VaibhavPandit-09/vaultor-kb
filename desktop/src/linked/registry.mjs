import {randomUUID,createHash,createHmac} from 'node:crypto';
import {mkdir,readFile,open,rename,stat} from 'node:fs/promises';
import {join,basename,dirname,resolve,sep} from 'node:path';
import {NativeChannel} from './native-channel.mjs';
import {RootConsent} from './consent.mjs';

const digest=value=>createHash('sha256').update(value).digest('hex');
const validId=value=>typeof value==='string'&&/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(value);
/** Host-private persistent registrations and conservative physical identities.
 * Paths never come from a renderer. Native capabilities never persist. */
export class LinkedRegistry {
  constructor(options){this.options=options;this.roots=new Map();this.entries=new Map();this.entryIndex=new Map();this.sourceAliases=new Map();this.pending=0;this.epoch=randomUUID();}
  current(){return this.options.current();}
  check(request){const scope=this.current();if(this.closed||!scope||scope.kind!=='owned-local'||scope.mainFrame!==true||scope.token!==request?.token||scope.workspace!==request?.workspace||scope.generation!==request?.generation||scope.epoch!==this.scope?.epoch)throw Error('LINKED_OWNER_CHANGED');return scope;}
  async load(scope){
    if(this.native)await this.native.close();this.scope={...scope};this.epoch=randomUUID();this.roots.clear();this.entries.clear();this.entryIndex.clear();this.sourceAliases.clear();this.closed=false;
    this.directory=join(this.options.directory,digest(scope.workspace+'\n'+scope.generation));await mkdir(this.directory,{recursive:true});
    this.native=undefined;
    try{const file=join(this.directory,'sources.json');if((await stat(file)).size>16*1024*1024)throw Error('Registry size limit');const data=JSON.parse(await readFile(file,'utf8'));if(data.version!==1||!Array.isArray(data.roots)||data.roots.length>8||!Array.isArray(data.entries)||data.entries.length>50000)throw Error('Invalid registry');for(const pair of data.aliases??[]){if(!Array.isArray(pair)||pair.length!==2||!pair.every(validId)||this.sourceAliases.size>=8)throw Error('Invalid source aliases');this.sourceAliases.set(...pair);}for(const root of data.roots){if(!validId(root.id)||typeof root.name!=='string'||root.name.length>255||typeof root.path!=='string'||!root.path.isWellFormed()||typeof root.identity!=='string')throw Error('Invalid source');this.roots.set(root.id,{...root,capability:undefined,status:root.enabled===false?'disconnected':'unavailable'});}for(const entry of data.entries){if(!validId(entry.id)||!validId(entry.root)||typeof entry.relative!=='string'||typeof entry.identity!=='string')throw Error('Invalid linked identity');this.entries.set(entry.id,{...entry,available:false});}}
    catch(error){if(error.code!=='ENOENT'){await this.native?.close();this.closed=true;throw Error('Linked source registrations could not be read. They have been preserved.');}}
    for(const entry of this.entries.values())this.entryIndex.set(this.entryKey(entry.root,entry.relative,entry.identity),entry.id);
    return this.snapshot();
  }
  entryKey(root,relative,identity){return [root,process.platform==='darwin'?relative:relative.toLowerCase(),identity].join('\0');}
  async ensureNative(){this.check(this.scope);if(!this.native)this.native=new NativeChannel({...this.options,workspace:this.scope.workspace,generation:this.scope.generation,privateRoot:join(this.directory,'journal'),production:true});await this.native.ready;return this.native;}
  persist(){const next=(this.persisting??Promise.resolve()).catch(()=>{}).then(()=>this.writeRegistry());this.persisting=next;return next;}
  async writeRegistry(){
    const data={version:1,aliases:[...this.sourceAliases],roots:[...this.roots.values()].map(({capability,status,...root})=>root),entries:[...this.entries.values()].map(({available,...entry})=>entry)};
    const serialized=JSON.stringify(data);if(Buffer.byteLength(serialized)>16*1024*1024)throw Error('LINKED_INDEX_LIMIT');
    const temp=join(this.directory,'sources-'+randomUUID()+'.tmp'),file=await open(temp,'wx',0o600);try{await file.writeFile(serialized);await file.sync();}finally{await file.close();}await rename(temp,join(this.directory,'sources.json'));
  }
  snapshot(){return [...this.roots.values()].map(root=>({id:root.id,name:root.name,status:root.status,enabled:root.enabled!==false}));}
  async grant(root){
    if(!root)throw Error('LINKED_SOURCE_REMOVED');
    if(root.enabled===false)throw Error('LINKED_SOURCE_DISCONNECTED');
    await this.ensureNative();
    if(root.capability)return root.capability;
    const scope=this.scope;
    if(root.volume){const [located]=await this.native.call('locate-root',root.path,root.volume);root.path=located;}
    const nonce=randomUUID(),expires=Date.now()+55000,selected=resolve(root.path);
    const proof=createHmac('sha256',this.native.consent).update(['G2-ROOT-1',scope.workspace,scope.generation,selected,nonce,expires].join('\n')).digest('hex');
    const [capability]=await this.native.call('root',selected,nonce,expires,proof);const [identity,volume]=await this.native.call('root-info',capability);
    this.check(scope);if(identity!==root.identity||(root.volume&&root.volume!==volume)){await this.native.call('revoke',capability);root.status='reauthorize';throw Error('LINKED_SOURCE_REPLACED');}root.volume=volume;root.capability=capability;root.status='available';await this.persist();return capability;
  }
  async add(request,{title='Link an existing Markdown folder'}={}){
    const before=this.check(request);if(this.pending)throw Error('LINKED_PICKER_OPEN');
    this.pending++;try{
    await this.ensureNative();
    const consent=new RootConsent({current:()=>this.closed?null:this.current(),key:this.native.consent,picker:settings=>this.options.picker({...settings,title}),sendToOwnedHost:async selected=>{
      await this.options.owner?.(request);this.check(request);
      let capability;
      try{[capability]=await this.native.call('root',selected.selected,selected.nonce,selected.expires,selected.proof);}
      catch(error){
        if(!error.message.includes('CARRIER_SETUP_REQUIRED'))throw error;
        const carrier=await this.options.carrierPicker?.();this.check(request);if(!carrier)throw Error('CARRIER_SETUP_REQUIRED');
        const nonce=randomUUID(),expires=Date.now()+55000;
        const proof=createHmac('sha256',this.native.consent).update(['LINKED-CARRIER-1',before.workspace,before.generation,selected.selected,carrier,nonce,expires].join('\n')).digest('hex');
        await this.native.call('carrier',selected.selected,carrier,nonce,expires,proof);
        const rootNonce=randomUUID(),rootExpires=Date.now()+55000;
        const rootProof=createHmac('sha256',this.native.consent).update(['G2-ROOT-1',before.workspace,before.generation,selected.selected,rootNonce,rootExpires].join('\n')).digest('hex');
        [capability]=await this.native.call('root',selected.selected,rootNonce,rootExpires,rootProof);
      }const [identity,volume]=await this.native.call('root-info',capability);await this.options.owner?.(request);this.check(request);
      const existing=[...this.roots.values()].find(root=>root.identity===identity&&((root.volume&&root.volume===volume)||(process.platform==='darwin'?root.path===selected.selected:root.path.toLowerCase()===selected.selected.toLowerCase())));
      if(existing){if(existing.capability&&existing.capability!==capability)await this.native.call('revoke',existing.capability);existing.path=selected.selected;existing.volume=volume;existing.enabled=true;existing.capability=capability;existing.status='available';await this.persist();return existing.id;}
      const picked=process.platform==='darwin'?selected.selected:selected.selected.toLowerCase();if([...this.roots.values()].some(root=>{const registered=process.platform==='darwin'?root.path:root.path.toLowerCase();return picked.startsWith(registered+sep)||registered.startsWith(picked+sep);})){await this.native.call('revoke',capability);throw Error('LINKED_SOURCE_OVERLAP');}
      if(this.roots.size>=8){await this.native.call('revoke',capability);throw Error('LINKED_SOURCE_LIMIT');}
      const root={id:randomUUID(),name:(basename(dirname(selected.selected))+' · '+basename(selected.selected)).slice(-255),path:selected.selected,identity,volume,enabled:true,capability,status:'available'};this.roots.set(root.id,root);
      try{await this.persist();}catch(error){this.roots.delete(root.id);await this.native.call('revoke',capability).catch(()=>{});throw error;}return root.id;
    }});
    const result=await consent.select({token:before.token,workspace:before.workspace,generation:before.generation});this.check(request);return result;}finally{this.pending--;}
  }
  async adoptReference(request,id,reference,rootId,{replace=false}={}){
    this.check(request);this.requireStablePublication(rootId);const old=this.entries.get(id);if(old&&!replace)return old;
    const root=this.roots.get(rootId),capability=await this.grant(root),fields=await this.native.call('open-linked',capability,reference.relativePath);
    try{
      this.check(request);this.requireStablePublication(rootId);if(this.entries.size>=50000&&!old)throw Error('LINKED_INDEX_LIMIT');
      const relative=fields[8]??reference.relativePath,entry={id,root:rootId,relative,name:relative.split('/').at(-1),identity:fields[2],directory:false,markdown:true,unsupported:false,size:Number(fields[6]),parent:null,available:true,reference:{...reference}};
      if(old)this.entryIndex.delete(this.entryKey(old.root,old.relative,old.identity));this.entries.set(id,entry);this.entryIndex.set(this.entryKey(rootId,relative,entry.identity),id);await this.persist();return entry;
    }finally{await this.native.call('close',fields[0]).catch(()=>{});}
  }
  requireStablePublication(source){if(this.isPublishing?.(source))throw Error('LINKED_SOURCE_BUSY');}
  async list(request,{source,directory,offset=0,limit=200}){
    this.check(request);this.requireStablePublication(source);if(!Number.isInteger(offset)||offset<0||offset>50000||!Number.isInteger(limit)||limit<1||limit>500)throw Error('INVALID_LINKED_PAGE');const root=this.roots.get(source);if(!root)throw Error('LINKED_SOURCE_NOT_FOUND');let relative='';
    if(directory){const entry=this.entries.get(directory);if(!entry||entry.root!==source||!entry.directory||entry.unsupported)throw Error('LINKED_DIRECTORY_UNAVAILABLE');relative=entry.relative;}
    try{
      const capability=await this.grant(root),rows=await this.native.call('directory',capability,relative,offset,limit);this.check(request);this.requireStablePublication(source);const results=[];let changed=false;
      for(let at=0;at<rows.length;at+=7){const name=rows[at],path=relative?relative+'/'+name:name,identity=rows[at+5],key=this.entryKey(source,path,identity);let entry=this.entries.get(this.entryIndex.get(key));const before=entry?JSON.stringify(entry):'';
        // Never infer a move from an equal inode alone: both names can be live
        // hardlinks. A later authoritative old-path check owns reconciliation.
        if(!entry){if(this.entries.size>=50000)throw Error('LINKED_INDEX_LIMIT');entry={id:randomUUID(),root:source};}Object.assign(entry,{relative:path,name,identity,directory:rows[at+1]==='true',markdown:rows[at+2]==='true',size:Number(rows[at+3]),modified:rows[at+4],unsupported:rows[at+6]==='true',available:true,parent:directory??null});this.entries.set(entry.id,entry);this.entryIndex.set(key,entry.id);changed||=before!==JSON.stringify(entry);results.push({...entry});
      }
      if(changed)await this.persist();root.status='available';return {items:results,more:results.length===limit,status:root.status};
    }catch(error){if(error.message==='LINKED_SOURCE_BUSY')throw error;root.status=root.enabled===false?'disconnected':error.message.includes('REPLACED')?'reauthorize':'unavailable';throw error;}
  }
  async disconnect(request,id){this.check(request);const root=this.roots.get(id);if(!root)throw Error('LINKED_SOURCE_NOT_FOUND');if(root.capability)await this.native.call('revoke',root.capability);root.capability=undefined;root.enabled=false;root.status='disconnected';for(const entry of this.entries.values())if(entry.root===id)entry.available=false;await this.persist();}
  async remove(request,id){await this.disconnect(request,id);this.roots.delete(id);await this.persist();}
  async close(){this.closed=true;this.epoch=randomUUID();await this.persisting?.catch(()=>{});await this.native?.close();this.roots.clear();this.entries.clear();this.entryIndex.clear();}
}
