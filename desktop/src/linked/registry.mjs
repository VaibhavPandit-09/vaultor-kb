import {randomUUID,createHash,createHmac} from 'node:crypto';
import {mkdir,readFile,open,rename,stat} from 'node:fs/promises';
import {join,basename,resolve} from 'node:path';
import {NativeChannel} from './native-channel.mjs';
import {RootConsent} from './consent.mjs';

const digest=value=>createHash('sha256').update(value).digest('hex');
const validId=value=>typeof value==='string'&&/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(value);
/** Host-private persistent registrations and conservative physical identities.
 * Paths never come from a renderer. Native capabilities never persist. */
export class LinkedRegistry {
  constructor(options){this.options=options;this.roots=new Map();this.entries=new Map();this.pending=0;this.epoch=randomUUID();}
  current(){return this.options.current();}
  check(request){const scope=this.current();if(this.closed||!scope||scope.kind!=='owned-local'||scope.mainFrame!==true||scope.token!==request?.token||scope.workspace!==request?.workspace||scope.generation!==request?.generation||scope.epoch!==this.scope?.epoch)throw Error('LINKED_OWNER_CHANGED');return scope;}
  async load(scope){
    if(this.native)await this.native.close();this.scope={...scope};this.epoch=randomUUID();this.roots.clear();this.entries.clear();this.closed=false;
    this.directory=join(this.options.directory,digest(scope.workspace+'\n'+scope.generation));await mkdir(this.directory,{recursive:true});
    this.native=new NativeChannel({...this.options,workspace:scope.workspace,generation:scope.generation,privateRoot:join(this.directory,'journal'),production:true});await this.native.ready;
    try{const file=join(this.directory,'sources.json');if((await stat(file)).size>16*1024*1024)throw Error('Registry size limit');const data=JSON.parse(await readFile(file,'utf8'));if(data.version!==1||!Array.isArray(data.roots)||data.roots.length>8||!Array.isArray(data.entries)||data.entries.length>50000)throw Error('Invalid registry');for(const root of data.roots){if(!validId(root.id)||typeof root.name!=='string'||root.name.length>255||typeof root.path!=='string'||!root.path.isWellFormed()||typeof root.identity!=='string')throw Error('Invalid source');this.roots.set(root.id,{...root,capability:undefined,status:root.enabled===false?'disconnected':'unavailable'});}for(const entry of data.entries){if(!validId(entry.id)||!this.roots.has(entry.root)||typeof entry.relative!=='string'||typeof entry.identity!=='string')throw Error('Invalid linked identity');this.entries.set(entry.id,{...entry,available:false});}}
    catch(error){if(error.code!=='ENOENT'){await this.native.close();this.closed=true;throw Error('Linked source registrations could not be read. They have been preserved.');}}
    return this.snapshot();
  }
  async persist(){
    const data={version:1,roots:[...this.roots.values()].map(({capability,status,...root})=>root),entries:[...this.entries.values()].map(({available,...entry})=>entry)};
    const temp=join(this.directory,'sources-'+randomUUID()+'.tmp'),file=await open(temp,'wx',0o600);try{await file.writeFile(JSON.stringify(data));await file.sync();}finally{await file.close();}await rename(temp,join(this.directory,'sources.json'));
  }
  snapshot(){return [...this.roots.values()].map(root=>({id:root.id,name:root.name,status:root.status,enabled:root.enabled!==false}));}
  async grant(root){
    if(root.enabled===false)throw Error('LINKED_SOURCE_DISCONNECTED');
    if(root.capability)return root.capability;
    const scope=this.scope,nonce=randomUUID(),expires=Date.now()+60000,selected=resolve(root.path);
    const proof=createHmac('sha256',this.native.consent).update(['G2-ROOT-1',scope.workspace,scope.generation,selected,nonce,expires].join('\n')).digest('hex');
    const [capability]=await this.native.call('root',selected,nonce,expires,proof);const [identity]=await this.native.call('root-info',capability);
    this.check(scope);if(identity!==root.identity){await this.native.call('revoke',capability);root.status='reauthorize';throw Error('LINKED_SOURCE_REPLACED');}root.capability=capability;root.status='available';return capability;
  }
  async add(request){
    const before=this.check(request);if(this.pending)throw Error('LINKED_PICKER_OPEN');if(this.roots.size>=8)throw Error('LINKED_SOURCE_LIMIT');
    const consent=new RootConsent({current:()=>this.closed?null:this.current(),key:this.native.consent,picker:settings=>this.options.picker({...settings,title:'Link an existing Markdown folder'}),sendToOwnedHost:async selected=>{
      const [capability]=await this.native.call('root',selected.selected,selected.nonce,selected.expires,selected.proof);const [identity]=await this.native.call('root-info',capability);this.check(request);
      const existing=[...this.roots.values()].find(root=>root.path.toLowerCase()===selected.selected.toLowerCase()&&root.identity===identity);
      if(existing){existing.enabled=true;existing.capability=capability;existing.status='available';await this.persist();return existing.id;}
      const root={id:randomUUID(),name:basename(selected.selected),path:selected.selected,identity,enabled:true,capability,status:'available'};this.roots.set(root.id,root);
      try{await this.persist();}catch(error){this.roots.delete(root.id);await this.native.call('revoke',capability).catch(()=>{});throw error;}return root.id;
    }});
    this.pending++;try{const result=await consent.select({token:before.token,workspace:before.workspace,generation:before.generation});this.check(request);return result;}finally{this.pending--;}
  }
  async list(request,{source,directory,offset=0,limit=200}){
    this.check(request);if(!Number.isInteger(offset)||offset<0||offset>50000||!Number.isInteger(limit)||limit<1||limit>500)throw Error('INVALID_LINKED_PAGE');const root=this.roots.get(source);if(!root)throw Error('LINKED_SOURCE_NOT_FOUND');let relative='';
    if(directory){const entry=this.entries.get(directory);if(!entry||entry.root!==source||!entry.directory||entry.unsupported)throw Error('LINKED_DIRECTORY_UNAVAILABLE');relative=entry.relative;}
    try{
      const capability=await this.grant(root),rows=await this.native.call('directory',capability,relative,offset,limit);this.check(request);const results=[];
      for(let at=0;at<rows.length;at+=7){const name=rows[at],path=relative?relative+'/'+name:name,identity=rows[at+5];let entry=[...this.entries.values()].find(item=>item.root===source&&item.relative===path&&item.identity===identity);
        // Never infer a move from an equal inode alone: both names can be live
        // hardlinks. A later authoritative old-path check owns reconciliation.
        if(!entry)entry={id:randomUUID(),root:source};Object.assign(entry,{relative:path,name,identity,directory:rows[at+1]==='true',markdown:rows[at+2]==='true',size:Number(rows[at+3]),modified:rows[at+4],unsupported:rows[at+6]==='true',available:true,parent:directory??null});this.entries.set(entry.id,entry);results.push({...entry});
      }
      if(this.entries.size>50000)throw Error('LINKED_INDEX_LIMIT');await this.persist();return {items:results,more:results.length===limit,status:root.status};
    }catch(error){root.status=root.enabled===false?'disconnected':error.message.includes('REPLACED')?'reauthorize':'unavailable';throw error;}
  }
  async disconnect(request,id){this.check(request);const root=this.roots.get(id);if(!root)throw Error('LINKED_SOURCE_NOT_FOUND');if(root.capability)await this.native.call('revoke',root.capability);root.capability=undefined;root.enabled=false;root.status='disconnected';for(const entry of this.entries.values())if(entry.root===id)entry.available=false;await this.persist();}
  async close(){this.closed=true;this.epoch=randomUUID();await this.native?.close();this.roots.clear();this.entries.clear();}
}
