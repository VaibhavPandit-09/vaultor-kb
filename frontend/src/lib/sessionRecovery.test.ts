import 'fake-indexeddb/auto';
import { expect, it, vi } from 'vitest';
import { IndexedSessionStore, SessionPersistence, defaultLibrary, type SessionSnapshot, type Identity, type LocalStore, type RecoveryRecord } from './sessionStore';
import { NoteRecovery } from './noteRecovery';
import { SaveCoordinator } from './saveCoordinator';
import { restoreSession } from './restoreSession';
import type { Resource } from '../types';
const identity: Identity={id:'workspace',generation:'generation'};
const resource=(id='n', revision='r1'):Resource=>({id,type:'note',title:id,content:{type:'doc',content:[]},revision,tags:[],createdAt:'',updatedAt:''});
const snapshot=():SessionSnapshot=>({version:1,identity,panes:[{paneId:'p',id:'n',history:[{visitId:'v',resourceId:'n',title:'Note'}],cursor:0}],activePaneId:'p',positions:{v:{scrollTop:40,scrollLeft:0,selection:{from:1,to:1}}},library:{visible:false,section:'library',collection:null,tags:['topic'],context:{...defaultLibrary,query:'needle',searchMode:'content'}}});
function memory():LocalStore {const map=new Map<string,unknown>();return {get:async<T>(key:string)=>structuredClone(map.get(key)) as T|undefined,put:async(k,v)=>{map.set(k,structuredClone(v));},delete:async k=>{map.delete(k);},values:async<T>(prefix:string)=>[...map].filter(([k])=>k.startsWith(prefix)).map(([,v])=>structuredClone(v)) as T[]};}
it('round trips tab records through IndexedDB and isolates generation/workspace identities',async()=>{
 const store=new IndexedSessionStore(), error=vi.fn(), first=new SessionPersistence(store,'first',error),second=new SessionPersistence(store,'second',error);
 await first.save(snapshot());expect(await first.load(identity)).toEqual(snapshot());expect(await second.load(identity)).toEqual(snapshot());
 const other={...snapshot(),library:{...snapshot().library,visible:true}};await second.save(other);
 expect((await first.load(identity))?.library.visible).toBe(false);expect((await second.load(identity))?.library.visible).toBe(true);
 expect(await first.load({...identity,generation:'replaced'})).toBeUndefined();expect(await first.load({...identity,id:'different'})).toBeUndefined();expect(error).not.toHaveBeenCalled();
});
it('only removes an acknowledged edit and rebases newer pending drafts',async()=>{
 const store=memory(), errors=vi.fn(), recovery=new NoteRecovery(store,()=>{},errors,()=>{});recovery.configure(identity,'tab');recovery.observe(resource());
 let release!:(v:Resource)=>void;
 const writes:string[]=[];const saves=new SaveCoordinator<{title:string;content:unknown}>((id,value,version)=>recovery.write(id,value,version,revision=>{writes.push(revision);return writes.length===1?new Promise(resolve=>{release=resolve;}):Promise.resolve(resource('n','r3'));}),()=>{},(id,value,version)=>recovery.queued(id,value,version));
 saves.enqueue('n',{title:'first',content:{}},10000);const saving=saves.flush('n');saves.enqueue('n',{title:'last',content:{}},10000);
 const during=await recovery.all(identity);expect(during[0].value.title).toBe('last');expect(during[0].baseRevision).toBe('r1');
 release(resource('n','r2'));await saving;expect(writes).toEqual(['r1','r2']);expect(await recovery.all(identity)).toEqual([]);expect(saves.dirty()).toBe(false);expect(errors).not.toHaveBeenCalled();
});
it('a conflict retains the draft and its original base; observing fresh content cannot silently rebase it',async()=>{
 const store=memory(), conflict=vi.fn(), recovery=new NoteRecovery(store,()=>{},()=>{},conflict);recovery.configure(identity,'tab');recovery.observe(resource());const value={title:'draft',content:{}};
 recovery.queued('n',value,1);await expect(recovery.write('n',value,1,async()=>{throw {response:{status:412}};})).rejects.toBeTruthy();
 recovery.observe(resource('n','r2'),true);expect(recovery.current('n')?.baseRevision).toBe('r1');expect(conflict).toHaveBeenCalledOnce();expect((await recovery.all(identity))[0].value).toEqual(value);
});
it('storage failure is visible but does not prevent saving',async()=>{
 const store=memory();store.put=async()=>{throw new Error('quota');};const errors=vi.fn(), recovery=new NoteRecovery(store,()=>{},errors,()=>{});recovery.configure(identity,'tab');recovery.observe(resource());const value={title:'draft',content:{}};recovery.queued('n',value,1);
 await recovery.write('n',value,1,async()=>resource('n','r2'));expect(errors).toHaveBeenCalled();expect(recovery.pending).toBe(0);expect(recovery.dirty()).toBe(false);
});
it('uncommitted title recovery survives a body save and stale conflict choices are rejected',async()=>{
 const recovery=new NoteRecovery(memory(),()=>{},()=>{},()=>{});recovery.configure(identity,'tab');recovery.observe(resource());const body={title:'old',content:{}};
 recovery.queued('n',body,1);const old=recovery.current('n')!;recovery.queued('n',{title:'typed title',content:{}},-1);
 await recovery.write('n',body,1,async()=>resource('n','r2'));expect((await recovery.all(identity))[0]).toMatchObject({baseRevision:'r2',value:{title:'typed title'}});await expect(recovery.discard(old)).rejects.toThrow('changed');
});
it('isolates startup conflict copies so editing the saved note cannot overwrite them',async()=>{
 const recovery=new NoteRecovery(memory(),()=>{},()=>{},()=>{});recovery.configure(identity,'tab');recovery.observe(resource());recovery.queued('n',{title:'original draft',content:{}},1);const old=(await recovery.all(identity))[0];
 const archived=await recovery.isolate(old);recovery.configure(identity,'tab');recovery.observe(resource('n','r2'));recovery.queued('n',{title:'new edit',content:{}},1);
 const records=await recovery.all(identity);expect(records).toHaveLength(2);expect(records.find(r=>r.key===archived.key)?.value.title).toBe('original draft');
});
it('restores current notes first, leaves old destinations lazy, and preserves Library context',async()=>{
 const state=snapshot();state.panes[0].history.unshift({visitId:'old',resourceId:'older',title:'Older'});state.panes[0].cursor=1;
 const load=vi.fn(async(id:string)=>resource(id));const result=await restoreSession(state,3,load);expect(load.mock.calls).toEqual([['n']]);expect(result.panes[0].selection).toEqual({from:1,to:1});expect(state.library.context.query).toBe('needle');
});
it('falls back only for missing destinations; offline errors keep the snapshot retryable',async()=>{
 const state=snapshot();state.panes[0].history.push({visitId:'next',resourceId:'other',title:'Other'});
 const result=await restoreSession(state,3,async id=>id==='n'?null:resource(id));expect(result.panes[0].id).toBe('other');expect(result.panes[0].history[0].unavailable).toBe(true);expect(result.messages).toHaveLength(1);
 await expect(restoreSession(state,3,async()=>{throw new Error('offline');})).rejects.toThrow('offline');expect(state.panes[0].history[0].unavailable).toBeUndefined();
});
it('pane limits do not delete recovery records',async()=>{
 const store=memory(), state=snapshot();state.panes.push({...state.panes[0],paneId:'extra'});const record={key:'draft:workspace:old:tab:n',identity:{...identity,generation:'old'},tabId:'tab',noteId:'n'} as RecoveryRecord;await store.put(record.key,record);
 const result=await restoreSession(state,1,async id=>resource(id));expect(result.panes).toHaveLength(1);expect(result.messages[0]).toContain('pane limit');expect(await store.get(record.key)).toEqual(record);
});
it('duplicate tabs claim independent IDs, while a refresh can reclaim its released tab ID',async()=>{
 let stored:string|null='original';const held=new Set(['original']);
 vi.stubGlobal('sessionStorage',{getItem:()=>stored,setItem:(_key:string,value:string)=>{stored=value;}});
 vi.stubGlobal('navigator',{locks:{request:async(name:string,_options:unknown,callback:(lock:object|null)=>unknown)=>{const id=name.replace('vaultor-session-','');if(held.has(id))return callback(null);held.add(id);return callback({});}}});
 try {
  vi.resetModules();const {claimTab}=await import('./sessionStore');const second=await claimTab();expect(second.id).not.toBe('original');expect(second.seed).toBe('original');expect(await claimTab()).toEqual(second);
  held.delete(second.id);vi.resetModules();const refreshed=await (await import('./sessionStore')).claimTab();expect(refreshed.id).toBe(second.id);expect(refreshed.seed).toBeUndefined();
 }finally{vi.unstubAllGlobals();}
});
it('corrupt layout does not block loading independent recovery records',async()=>{
 const store=memory(),error=vi.fn();await store.put('session:workspace:tab',{version:1,identity,panes:'broken'});const session=new SessionPersistence(store,'tab',error);expect(await session.load(identity)).toBeUndefined();expect(error).toHaveBeenCalled();
});
it('a late response from the replaced workspace cannot rebase its replacement',async()=>{
 const recovery=new NoteRecovery(memory(),()=>{},()=>{},()=>{});recovery.configure(identity,'tab');recovery.observe(resource());const old={title:'old',content:{}};recovery.queued('n',old,1);let done!:(r:Resource)=>void;
 const request=recovery.write('n',old,1,()=>new Promise(resolve=>{done=resolve;}));recovery.configure({...identity,generation:'new'},'tab');recovery.observe(resource('n','new-revision'));recovery.queued('n',{title:'new',content:{}},1);done(resource('n','old-response'));await request;expect(recovery.current('n')?.baseRevision).toBe('new-revision');
});
it('restoring pane state does not replay navigation, previews or save commands',async()=>{
 const {PaneNavigation}=await import('./paneNavigation');const load=vi.fn(),save=vi.fn(),preview=vi.fn(),committed=vi.fn();const navigation=new PaneNavigation(()=>({load,save,preview,committed,max:3,behavior:'split'}));const state=snapshot();
 navigation.restore(state.panes,state.activePaneId,state.positions);expect(navigation.exportSession()).toEqual({panes:state.panes,activePaneId:state.activePaneId,positions:state.positions});expect(load).not.toHaveBeenCalled();expect(save).not.toHaveBeenCalled();expect(preview).not.toHaveBeenCalled();expect(committed).not.toHaveBeenCalled();
});
it('malformed positions do not prevent access to independent recovery journals',async()=>{
 const store=memory(),error=vi.fn(),sessions=new SessionPersistence(store,'tab',error);
 await store.put('session:workspace:tab',{...snapshot(),positions:{v:null}});
 expect(await sessions.load(identity)).toBeUndefined();expect(error).toHaveBeenCalledOnce();
});
