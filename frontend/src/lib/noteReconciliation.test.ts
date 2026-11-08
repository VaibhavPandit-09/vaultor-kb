import {expect,it} from 'vitest';
import {NoteRecovery} from './noteRecovery';
import {SaveCoordinator} from './saveCoordinator';
import {noteReconciliation} from './noteReconciliation';
import type {LocalStore,NoteDraft} from './sessionStore';
import type {Resource} from '../types';
const saved=(revision:string):Resource=>({id:'n',title:'Note',type:'note',revision,content:{type:'doc',content:[]},tags:[],createdAt:'',updatedAt:''});
function recovery(){const map=new Map<string,unknown>(),store:LocalStore={get:async<T>(key:string)=>map.get(key) as T|undefined,put:async(key,value)=>{map.set(key,value);},delete:async key=>{map.delete(key);},values:async<T>()=>[...map.values()] as T[]};const recovery=new NoteRecovery(store,()=>{},()=>{},()=>{});recovery.configure({id:'w',generation:'g'},'tab');recovery.observe(saved('r1'));return recovery;}
it('an own-save notification and a read crossing Save acknowledgement preserve the live document without a false conflict',async()=>{
 const owner=recovery(),value:NoteDraft={title:'Note',content:{type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'Unsaved text'}]}]}};let finish!:(resource:Resource)=>void;
 const saves=new SaveCoordinator<NoteDraft>((id,value,version)=>owner.write(id,value,version,async revision=>{expect(revision).toBe('r1');return new Promise(resolve=>{finish=resolve;});}),()=>{},(id,value,version)=>owner.queued(id,value,version));
 saves.enqueue('n',value,60000);const started=owner.acknowledgedRevision('n'),writing=saves.flush('n');
 expect(noteReconciliation(started,owner.acknowledgedRevision('n'),'r2',owner.current('n')?.baseRevision,true,saves.status('n')==='saving')).toEqual({preserve:true,conflict:false});
 finish(saved('r2'));await writing;expect(owner.current('n')).toBeUndefined();expect(saves.dirty()).toBe(false);
 expect(noteReconciliation(started,owner.acknowledgedRevision('n'),'r1',undefined,false,false)).toEqual({preserve:true,conflict:false});
 expect(noteReconciliation('r2','r2','r3',undefined,false,false)).toEqual({preserve:false,conflict:false});
});
it('a real failed conditional Save and a staged title draft still retain conflict/recovery admission',async()=>{
 const owner=recovery(),value:NoteDraft={title:'Local title',content:{type:'doc',content:[]}};owner.queued('n',value,1);
 await expect(owner.write('n',value,1,async revision=>{expect(revision).toBe('r1');throw Error('Revision conflict');})).rejects.toThrow('Revision conflict');
 expect(noteReconciliation('r1',owner.acknowledgedRevision('n'),'external',owner.current('n')?.baseRevision,true,false)).toEqual({preserve:true,conflict:true});expect(owner.current('n')?.value.title).toBe('Local title');
});
