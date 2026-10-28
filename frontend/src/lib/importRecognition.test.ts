// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import {File as NodeFile} from 'node:buffer';
import {webcrypto} from 'node:crypto';
import {beforeEach,afterEach,expect,it,vi} from 'vitest';
import api from './api';
import {folderJournal,restoreFolderRows,type FolderJournal} from './folderImports';
import type {ImportSession} from './fileImports';
const state=vi.hoisted(()=>({identity:{id:'',generation:'generation'},presence:{} as Record<string,string>,fail:false,supported:true,keepCollections:false}));
vi.mock('./connection',async original=>({...await original<typeof import('./connection')>(),getAcceptedCapabilities:()=>({importPresence:state.supported?1:undefined})}));
vi.mock('./api',()=>({default:{post:vi.fn(async(_path:string,input:{ids:string[];collections:string[]})=>{if(state.fail)throw Error('offline');return {data:{items:Object.fromEntries(input.ids.map(id=>[id,state.presence[id]??'active'])),collections:state.keepCollections?input.collections:[]}};}),get:vi.fn(async(path:string)=>({data:path==='/collections/capabilities'?{hierarchy:1}:state.identity}))}}));
function session(text='first',modified=10):ImportSession{return {folder:{name:'docs',directories:['docs/empty']},rows:[{id:crypto.randomUUID(),path:'docs/a.md',file:new NodeFile([text],'a.md',{lastModified:modified}) as unknown as File,kind:'markdown',asNote:true,doc:{type:'doc',content:[]},sourceText:text,status:'ready',warnings:[]}]};}
beforeEach(()=>{vi.stubGlobal('crypto',webcrypto);state.identity={id:crypto.randomUUID(),generation:'generation'};state.presence={};state.fail=false;state.supported=true;state.keepCollections=false;});
afterEach(()=>vi.unstubAllGlobals());
async function remember(selection:ImportSession,complete:boolean){const context=await folderJournal(selection);const saved:FolderJournal={key:context.key,identity:context.identity,signature:context.signature,rows:selection.rows.map(({file,...row})=>{delete row.doc;delete row.sourceText;return {...row,name:file.name,size:file.size,modified:file.lastModified};}),directories:{},includeRoot:true,merge:false,complete};await context.store.put(saved.key,saved);return saved;}
it('exact bytes and paths recognize repeat imports; equal size/time/name alone never skips changed bytes',async()=>{
 const original=session(),saved=await remember(original,true);const exact=await folderJournal(session());expect(exact.completed?.key).toBe(saved.key);expect(exact.previous).toBeUndefined();
 const changed=await folderJournal(session('other'));expect(changed.completed).toBeUndefined();expect(changed.related).toBe(true);
 expect((await folderJournal(session('first',999))).completed?.key).toBe(saved.key);
});
it('unfinished recognition restores the stable map rather than new selection IDs',async()=>{
 const original=session(),saved=await remember(original,false),fresh=session(),context=await folderJournal(fresh);expect(context.previous?.key).toBe(saved.key);expect(restoreFolderRows(context.previous!,fresh.rows)[0].id).toBe(original.rows[0].id);
});
it('legacy unfinished journals retain IDs and require host revalidation of completed rows',async()=>{
 const selection=session(),saved=await remember(selection,false);
 saved.signature=JSON.stringify([['docs','docs/empty'],selection.rows.map(row=>[row.path,row.file.name,row.file.size,row.file.lastModified])]);saved.rows[0].status='done';await (await folderJournal(selection)).store.put(saved.key,saved);
 const context=await folderJournal(session());expect(context.previous?.legacyVerification).toBe(true);const restored=restoreFolderRows(context.previous!,session().rows);expect(restored[0].id).toBe(selection.rows[0].id);expect(restored[0].status).toBe('ready');
 saved.legacySignature=saved.signature;saved.signature='a failed revalidation of changed source bytes';await context.store.put(saved.key,saved);expect((await folderJournal(session())).previous?.legacyVerification).toBe(true);
});

it('does not describe permanently removed targets as already imported',async()=>{
 const selected=session(),saved=await remember(selected,true);state.presence[selected.rows[0].id]='missing';const result=await folderJournal(session());expect(result.related).toBe(false);expect(result.completed).toBeUndefined();expect(result.live.missing).toBe(1);expect((await result.store.get(saved.key))).toBeDefined();
});
it('distinguishes Trash and missing collections without resurrecting or skipping targets',async()=>{
 const selected=session(),saved=await remember(selected,true);saved.directories={docs:{id:crypto.randomUUID(),name:'docs',done:true}};const context=await folderJournal(selected);await context.store.put(saved.key,saved);const active=await folderJournal(session());expect(active.live).toMatchObject({active:1,missingCollections:1});expect(active.completed).toBeDefined();state.presence[selected.rows[0].id]='trash';const trash=await folderJournal(session());expect(trash.related).toBe(true);expect(trash.live.trash).toBe(1);expect(trash.completed).toBeUndefined();
});
it('keeps unknown inventory distinct from absent items and refuses historical Skip',async()=>{
 await remember(session(),true);state.fail=true;const offline=await folderJournal(session());expect(offline.live.unknown).toBe(true);expect(offline.related).toBe(true);expect(offline.completed).toBeUndefined();state.fail=false;state.supported=false;expect((await folderJournal(session())).live.unknown).toBe(true);
});
it('does not reuse history from a replaced workspace generation',async()=>{
 await remember(session(),true);state.identity.generation='replacement';const result=await folderJournal(session());expect(result.history).toBe(false);expect(result.previous).toBeUndefined();expect(result.completed).toBeUndefined();
});

it('checks mixed inventory in bounded batches and never offers Skip for removed items',async()=>{
 const selection=session(),row=selection.rows[0];selection.rows=Array.from({length:205},(_,n)=>({...row,id:crypto.randomUUID(),path:'docs/'+n+'.md',file:new NodeFile(['first'],n+'.md') as unknown as File}));await remember(selection,true);for(let n=0;n<selection.rows.length;n++)state.presence[selection.rows[n].id]=['active','trash','missing'][n%3];vi.mocked(api.post).mockClear();const result=await folderJournal(selection);expect(result.live).toMatchObject({active:69,trash:68,missing:68,unknown:false});expect(result.completed).toBeUndefined();expect(vi.mocked(api.post).mock.calls).toHaveLength(2);expect(vi.mocked(api.post).mock.calls.every(call=>(call[1] as {ids:string[]}).ids.length<=200)).toBe(true);
});

it('retains an unfinished receipt but blocks resume when a completed target was removed',async()=>{
 const selected=session(),saved=await remember(selected,false);saved.rows[0].status='done';const context=await folderJournal(selected);await context.store.put(saved.key,saved);state.presence[selected.rows[0].id]='missing';const result=await folderJournal(session());expect(result.previous?.key).toBe(saved.key);expect(result.resumeBlocked).toBe(true);expect(await result.store.get(saved.key)).toBeDefined();
});

it('recognizes an existing empty folder without creating duplicate collections by default',async()=>{
 const selected=session();selected.rows=[];selected.folder!.directories=['docs','docs/empty'];const saved=await remember(selected,true);saved.directories={docs:{id:crypto.randomUUID(),name:'docs',done:true},'docs/empty':{id:crypto.randomUUID(),name:'empty',done:true}};const context=await folderJournal(selected);await context.store.put(saved.key,saved);state.keepCollections=true;const result=await folderJournal(selected);expect(result.related).toBe(true);expect(result.completed).toBeDefined();expect(result.live.collections).toBe(2);
});

it('refuses a generation change during the live lookup instead of treating it as missing content',async()=>{
 await remember(session(),true);vi.mocked(api.post).mockRejectedValueOnce({response:{status:409,data:{code:'WORKSPACE_GENERATION_CHANGED'}}});await expect(folderJournal(session())).rejects.toThrow('Workspace changed');
});

it('checks a required destination when resuming a plain-file import',async()=>{
 const selected=session(),saved=await remember(selected,false);saved.destination={id:crypto.randomUUID(),name:'Removed target'};const context=await folderJournal(selected);await context.store.put(saved.key,saved);const result=await folderJournal(selected);expect(result.resumeBlocked).toBe(true);expect(result.live.missingCollections).toBe(1);
});
