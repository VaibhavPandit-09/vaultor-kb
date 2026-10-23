import api from './api';
import { convertText, importResource, noteTitle, type ImportRow, type ImportSession, type ImportReference } from './fileImports';
import { getConnection } from './platform';
import { IndexedSessionStore, type Identity } from './sessionStore';
import { organizationChanged, type OrganizationItem } from './organization';
import type { Resource } from '../types';

export function sourcePath(value:string):string {
  if(!value||value.length>2048||(value.includes('\\')||[...value].some(c=>c.charCodeAt(0)<32))||value.startsWith('/')||/^[a-z]:/i.test(value))throw new Error('Invalid source path.');
  const parts=value.normalize('NFC').split('/');
  if(parts.length>32||parts.some(p=>!p||p.trim()!==p||p==='.'||p==='..'||p.length>100))throw new Error('Folder paths allow 32 levels and names of 1–100 characters.');
  return parts.join('/');
}
export function folderPaths(session:ImportSession) {
  const directories=new Set((session.folder?.directories??[]).map(sourcePath)),files=new Set<string>(),folded=new Map<string,string>();
  let bytes=0,textBytes=0;
  for(const row of session.rows){const path=sourcePath(row.path??row.file.name);if(files.has(path))throw new Error('Duplicate source path: '+path);files.add(path);bytes+=row.file.size;textBytes+=(row.sourceText?.length??0)*2;
    if(row.file.size>512*1024*1024||bytes>2*1024*1024*1024||textBytes>64*1024*1024)throw new Error('Import exceeds 512 MiB per file, 2 GiB total, or 64 MiB of decoded text.');
    const parts=path.split('/');for(let i=1;i<parts.length;i++)directories.add(parts.slice(0,i).join('/'));
  }
  if(files.size+directories.size>2000)throw new Error('Select at most 2,000 files and folders.');
  for(const path of directories){const key=path.trim().toLowerCase();if(folded.has(key)&&folded.get(key)!==path)throw new Error('Folder names differ only by case: '+path);folded.set(key,path);}
  return [...directories].sort((a,b)=>a.split('/').length-b.split('/').length||a.localeCompare(b));
}
export function referenceResolver(rows:ImportRow[],from:string):(href:string)=>ImportReference|undefined {
  const byPath=new Map(rows.map(r=>[sourcePath(r.path??r.file.name),r]));
  return href=>{
    if(!href||/^(?:[a-z][a-z0-9+.-]*:|\/)/i.test(href))return undefined;
    if(href.startsWith('#')){const own=byPath.get(sourcePath(from));return own?{id:own.id,type:own.asNote?'note':'file',fragment:href.slice(1)}:undefined;}
    const [raw,fragment]=href.split('#');if(raw.includes('?'))return undefined;
    let decoded:string;try{decoded=decodeURIComponent(raw).normalize('NFC');}catch{return undefined;}
    if((decoded.includes('\\')||[...decoded].some(c=>c.charCodeAt(0)<32))||decoded.startsWith('/'))return undefined;
    const parts=sourcePath(from).split('/');parts.pop();
    for(const part of decoded.split('/')){if(part==='.'||!part)continue;if(part==='..'){if(parts.length<=1)return undefined;parts.pop();}else parts.push(part);}
    const path=parts.join('/');let candidates=byPath.has(path)?[byPath.get(path)!]:[];
    if(!candidates.length){const paths=/\.[^/]+$/.test(path)?[path]:[path,path+'.md',path+'.markdown',path+'/README.md',path+'/index.md'];candidates=rows.filter(r=>paths.some(p=>p.toLowerCase()===(r.path??r.file.name).normalize('NFC').toLowerCase()));}
    if(candidates.length!==1)return undefined;const target=candidates[0];
    return {id:target.id,type:target.asNote?'note':'file',image:target.imageValid!==false&&!target.asNote&&/\.(png|jpe?g|gif|webp)$/i.test(target.file.name)&&target.file.size<=20*1024*1024,fragment};
  };
}
type SavedRow=Omit<ImportRow,'file'> & {name:string;size:number;modified:number};
export type FolderJournal={key:string;identity:Identity;signature:string;rows:SavedRow[];directories:Record<string,{id:string;name:string;parentId?:string;done?:boolean}>;destination?:{id:string;name:string};includeRoot:boolean;merge:boolean;complete:boolean};
export async function folderJournal(session:ImportSession) {
  const support=await api.get<{hierarchy:number}>('/collections/capabilities');if(support.data.hierarchy!==1)throw new Error('Update the connected host for folder imports.');
  const {data:identity}=await api.get<Identity>('/workspace/identity');
  const signature=JSON.stringify([session.folder?folderPaths(session):[],session.rows.map(r=>[r.path,r.file.name,r.file.size,r.file.lastModified])]);
  const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(signature)))].map(n=>n.toString(16).padStart(2,'0')).join('');
  const key=`folder-import:${identity.id}:${identity.generation}:${hash}`;
  const store=new IndexedSessionStore();const previous=await store.get<FolderJournal>(key);
  return {key,identity,signature,previous:previous&&!previous.complete?previous:undefined,store};
}
export function restoreFolderRows(journal:FolderJournal,rows:ImportRow[]) {
  return rows.map((row,i)=>({...row,...journal.rows[i],file:row.file}));
}
export async function runFolderImport(session:ImportSession,rows:ImportRow[],journal:FolderJournal,store:IndexedSessionStore,cancel:()=>boolean,update:(phase:string)=>void,onResource:(r:Resource)=>void) {
  const epoch=getConnection().epoch;const request={connectionEpoch:epoch,headers:{'X-Vaultor-Generation':journal.identity.generation}};
  const persist=async()=>{journal.rows=rows.map(({file,...row})=>({...row,name:file.name,size:file.size,modified:file.lastModified}));await store.put(journal.key,journal);};
  const check=async()=>{if(epoch!==getConnection().epoch)throw new Error('Connection changed; resume in the original workspace.');const {data}=await api.get<Identity>('/workspace/identity');if(data.id!==journal.identity.id||data.generation!==journal.identity.generation)throw new Error('Workspace changed; this import cannot continue here.');};
  await persist();await check();
  const paths=session.folder?folderPaths(session):[],root=session.folder?.name??'';
  for(const path of paths){if(cancel())return;await check();if(!journal.includeRoot&&path===root)continue;
    const parentPath=path.includes('/')?path.slice(0,path.lastIndexOf('/')):'';
    const parentId=journal.directories[parentPath]?.id??journal.destination?.id;
    let entry=journal.directories[path];
    if(!entry){let name=path.split('/').at(-1)!;let suffix=1;
      for(;;){const {data}=await api.get<{items:OrganizationItem[]}>('/collections',{params:{q:name,parent:parentId??'',size:100}});const existing=data.items.find(c=>c.name.toLowerCase()===name.toLowerCase());
        if(!existing)break;
        if(journal.merge){entry={id:existing.id,name:existing.name,parentId,done:true};break;}
        name=path.split('/').at(-1)!.slice(0,85)+` (import ${++suffix})`;
      }
      entry??={id:crypto.randomUUID(),name,parentId};journal.directories[path]=entry;await persist();
    }
    if(!entry.done){update('Creating collections');await api.put('/collections/creations/'+entry.id,{name:entry.name,parentId:entry.parentId,resourceIds:[]},request);entry.done=true;await persist();}
  }
  organizationChanged('collection');
  for(const row of rows){if(cancel())return;if(row.status==='done')continue;await check();
    row.destinationId=journal.directories[(row.path??'').split('/').slice(0,-1).join('/')]?.id??journal.destination?.id;
    row.status='pending';row.error=undefined;await persist();update('Importing resources');
    try{if(row.asNote&&(!row.doc||row.parseError))throw new Error(row.parseError??'Cannot convert file.');row.started=true;await persist();const resource=await importResource(row.id,row.file,row.asNote?row.doc:undefined,row.destinationId,undefined,{generation:journal.identity.generation,epoch});row.status='done';row.revision=resource.revision;if(!row.asNote&&/\.(png|jpe?g|gif|webp)$/i.test(row.file.name)){try{await api.get('/resources/'+row.id+'/image-info',request);row.imageValid=true;}catch(error){const status=(error as {response?:{status:number}}).response?.status;if(status===400||status===415||status===422)row.imageValid=false;else throw error;}}onResource(resource);}
    catch(error){row.status='failed';row.error=error instanceof Error?error.message:String(error);}
    await persist();update('Importing resources');
  }
  if(rows.some(r=>r.status!=='done')){update('Some files need retry. Links will resolve after resource creation finishes.');return;}
  for(const row of rows){if(cancel())return;if(row.resolved||!row.asNote||row.kind!=='markdown'||!session.folder)continue;await check();update('Resolving internal links');
    const converted=convertText('markdown',row.sourceText!,referenceResolver(rows,row.path!));row.warnings=converted.warnings;
    try{const {data}=await api.put<Resource>('/resources/imports/'+row.id+'/relationships',{title:noteTitle(row.file.name),original:JSON.stringify(row.doc),resolvedContent:JSON.stringify(converted.doc),collectionId:row.destinationId},request);row.resolved=true;row.error=undefined;onResource(data);}
    catch(error){row.error=error instanceof Error?error.message:String(error);}
    await persist();
  }
  journal.complete=rows.every(r=>!r.error);await persist();update(journal.complete?'Import complete':'Some relationships need retry');
}
