// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import {File as NodeFile} from 'node:buffer';
import {webcrypto} from 'node:crypto';
import {beforeEach,afterEach,expect,it,vi} from 'vitest';
import {folderJournal,restoreFolderRows,type FolderJournal} from './folderImports';
import type {ImportSession} from './fileImports';
const state=vi.hoisted(()=>({identity:{id:'',generation:'generation'}}));
vi.mock('./api',()=>({default:{get:vi.fn(async(path:string)=>({data:path==='/collections/capabilities'?{hierarchy:1}:state.identity}))}}));
function session(text='first',modified=10):ImportSession{return {folder:{name:'docs',directories:['docs/empty']},rows:[{id:crypto.randomUUID(),path:'docs/a.md',file:new NodeFile([text],'a.md',{lastModified:modified}) as unknown as File,kind:'markdown',asNote:true,doc:{type:'doc',content:[]},sourceText:text,status:'ready',warnings:[]}]};}
beforeEach(()=>{vi.stubGlobal('crypto',webcrypto);state.identity={id:crypto.randomUUID(),generation:'generation'};});
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
