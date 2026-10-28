import { getAcceptedCapabilities } from './connection';
import api from './api';
import { convertText, importResource, noteTitle, type ImportRow, type ImportSession, type ImportReference } from './fileImports';
import { getConnection } from './platform';
import { IndexedSessionStore, type Identity } from './sessionStore';
import { organizationChanged, type OrganizationItem } from './organization';
import type { Resource } from '../types';
import { importFileChunk } from './desktop';
import { reportError } from './diagnostics';

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
type SavedRow=Omit<ImportRow,'file'|'doc'|'sourceText'> & {name:string;size:number;modified:number};
export type FolderJournal={key:string;identity:Identity;signature:string;rows:SavedRow[];directories:Record<string,{id:string;name:string;parentId?:string;done?:boolean}>;destination?:{id:string;name:string};includeRoot:boolean;merge:boolean;complete:boolean;legacyVerification?:boolean;legacySignature?:string};
export async function folderJournal(session:ImportSession) {
  const epoch=getConnection().epoch;
  if(session.sourceEpoch!==undefined&&session.sourceEpoch!==epoch)throw Error('Connection changed since file selection. Reselect in the original source.');
  const support=await api.get<{hierarchy:number}>('/collections/capabilities',{connectionEpoch:epoch});if(support.data.hierarchy!==1)throw new Error('Update the connected host for folder imports.');
  const {data:identity}=await api.get<Identity>('/workspace/identity',{connectionEpoch:epoch});
  const hashes=[];
  for(const row of session.rows)hashes.push([row.path,row.file.name,row.file.size,await sourceFingerprint(row.file)]);
  if(epoch!==getConnection().epoch)throw Error('Connection changed during source verification.');
  const signature=JSON.stringify([session.folder?folderPaths(session):[],hashes]);
  const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(signature)))].map(n=>n.toString(16).padStart(2,'0')).join('');
  const key=`folder-import:${identity.id}:${identity.generation}:${hash}`;
  const store=new IndexedSessionStore();const manifests=await store.values<FolderJournal>(`folder-import:${identity.id}:${identity.generation}:`);
  const matching=manifests.filter(value=>value.signature===signature);
  const legacySignature=JSON.stringify([session.folder?folderPaths(session):[],session.rows.map(row=>[row.path,row.file.name,row.file.size,row.file.lastModified])]);
  const legacy=manifests.find(value=>!value.complete&&(value.signature===legacySignature||value.legacySignature===legacySignature));
  const previous=matching.find(value=>!value.complete)??(legacy?{...legacy,legacyVerification:true}:undefined),completed=matching.find(value=>value.complete);
  const selectedPaths=new Set(session.rows.map(row=>row.path)),selectedDirectories=new Set(session.folder?folderPaths(session):[]);
  const candidates=manifests.filter(value=>matching.includes(value)||value.rows.some(row=>selectedPaths.has(row.path))||Object.keys(value.directories).some(path=>selectedDirectories.has(path)));
  const history=candidates.length>0;
  const live={active:0,trash:0,missing:0,collections:0,missingCollections:0,unknown:false};
  let lookupProblem='';let resumeBlocked=false;
  const createdIds=new Set(previous?.rows.filter(row=>row.status==='done').map(row=>row.id));const createdCollections=new Set([...Object.values(previous?.directories??{}).filter(entry=>entry.done).map(entry=>entry.id),...(previous?.destination?[previous.destination.id]:[])]);
  if(history){
    const ids=[...new Set(candidates.flatMap(value=>value.rows.filter(row=>matching.includes(value)||selectedPaths.has(row.path)).map(row=>row.id)))];
    const collections=[...new Set(candidates.flatMap(value=>[...Object.values(value.directories).map(entry=>entry.id),...(value.destination?[value.destination.id]:[])]))];
    if(getAcceptedCapabilities()?.importPresence!==1){live.unknown=true;lookupProblem='Update the computer sharing this workspace to check earlier imports.';}else if(ids.length>6000||collections.length>6000){live.unknown=true;lookupProblem='This import history is too large to check in one review. Import another copy only if you want new copies.';}
    else try{
      for(let offset=0;offset<Math.max(ids.length,collections.length);offset+=200){
        const batch=ids.slice(offset,offset+200),folders=collections.slice(offset,offset+200);
        const {data}=await api.post<{items:Record<string,string>;collections:string[]}>('/resources/import-presence',{ids:batch,collections:folders},{connectionEpoch:epoch,headers:{'X-Vaultor-Generation':identity.generation},backgroundDiagnostic:true});
        if(!data||!Array.isArray(data.collections)||batch.some(id=>!['active','trash','missing'].includes(data.items?.[id]))||data.collections.some(id=>!folders.includes(id)))throw Error('Import review could not verify earlier items');
        for(const id of batch){live[data.items[id] as 'active'|'trash'|'missing']++;if(data.items[id]==='missing'&&createdIds.has(id))resumeBlocked=true;}
        if(folders.some(id=>createdCollections.has(id)&&!data.collections.includes(id)))resumeBlocked=true;
        live.collections+=data.collections.length;live.missingCollections+=folders.length-data.collections.length;
      }
    }catch(error){if(epoch!==getConnection().epoch)throw error;const response=(error as {response?:{status:number;data?:{code?:string}}}).response;if(response?.data?.code==='WORKSPACE_GENERATION_CHANGED')throw Error('Workspace changed. Close this review and reselect the source.');live.unknown=true;lookupProblem=response?.status===401||response?.status===403?'Access changed. Reconnect or ask the workspace owner for access.':'Could not reach the earlier items. Check the connection and try again.';}
  }
  if(epoch!==getConnection().epoch)throw Error('Connection changed during import review. Reopen it in the original workspace.');
  const emptyFolderMatch=Boolean(completed)&&completed?.rows.length===0&&live.collections>0&&live.missingCollections===0;
  const related=history&&(live.unknown||live.active+live.trash>0||emptyFolderMatch&&live.collections>0);
  const canSkip=Boolean(completed)&&!live.unknown&&(live.active>0||emptyFolderMatch&&live.collections>0)&&live.trash===0&&live.missing===0;
  return {key:key+':'+crypto.randomUUID(),identity,epoch,signature,previous,completed:canSkip?completed:undefined,exact:Boolean(completed),related,history,live,lookupProblem,resumeBlocked,store};
}
/** Chunk digests bound memory for native tickets and large originals. Equal
 * metadata alone never proves byte equality. No original bytes are journaled. */
export async function sourceFingerprint(file:File){
 const digest=async(bytes:Uint8Array)=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes as Uint8Array<ArrayBuffer>))].map(n=>n.toString(16).padStart(2,'0')).join('');
 const chunks:string[]=[];
 for(let offset=0;offset<file.size;offset+=1024*1024)chunks.push(await digest(await importFileChunk(file,offset,Math.min(1024*1024,file.size-offset))));
 return digest(new TextEncoder().encode(JSON.stringify([file.size,chunks])));
}
export function restoreFolderRows(journal:FolderJournal,rows:ImportRow[]) {
  return rows.map((row,i)=>({...row,...journal.rows[i],doc:row.doc,sourceText:row.sourceText,file:row.file,...(journal.legacyVerification?{status:'ready' as const}:{} )}));
}
export async function runFolderImport(session:ImportSession,rows:ImportRow[],journal:FolderJournal,store:IndexedSessionStore,cancel:()=>boolean,update:(phase:string)=>void,onResource:(r:Resource)=>void) {
  const epoch=getConnection().epoch;const waiting=()=>update('Waiting for workspace access');const request={connectionEpoch:epoch,headers:{'X-Vaultor-Generation':journal.identity.generation},onWorkspaceBusy:waiting};
  const persist=async()=>{journal.rows=rows.map(({file,...row})=>{delete row.doc;delete row.sourceText;return {...row,name:file.name,size:file.size,modified:file.lastModified};});await store.put(journal.key,journal);};
  const check=async()=>{if(epoch!==getConnection().epoch)throw new Error('Connection changed; resume in the original workspace.');const {data}=await api.get<Identity>('/workspace/identity',request);if(data.id!==journal.identity.id||data.generation!==journal.identity.generation)throw new Error('Workspace changed; this import cannot continue here.');};
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
    try{if(row.asNote&&(!row.doc||row.parseError))throw new Error(row.parseError??'Cannot convert file.');row.started=true;await persist();const resource=await importResource(row.id,row.file,row.asNote?row.doc:undefined,row.destinationId,undefined,{generation:journal.identity.generation,epoch,waiting});row.status='done';row.revision=resource.revision;if(!row.asNote&&/\.(png|jpe?g|gif|webp)$/i.test(row.file.name)){try{await api.get('/resources/'+row.id+'/image-info',{...request,backgroundDiagnostic:true});row.imageValid=true;}catch(error){const status=(error as {response?:{status:number}}).response?.status;if(status===400||status===415||status===422)row.imageValid=false;else {reportError('import.image-validation',error);throw error;}}}onResource(resource);}
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
  journal.complete=rows.every(r=>!r.error);if(journal.complete)delete journal.legacySignature;await persist();update(journal.complete?'Import complete':'Some relationships need retry');
}
