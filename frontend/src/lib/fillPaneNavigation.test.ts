// @vitest-environment jsdom
import {expect,it,vi} from 'vitest';
import {PaneNavigation} from './paneNavigation';
import {sideBySideCapacity} from './paneCapacity';
import type {Resource} from '../types';
const note=(id:string)=>({id,title:id,type:'note',content:{type:'doc',content:[]},tags:[],createdAt:'',updatedAt:''} as Resource);
function fixture(max=3){const dep={load:vi.fn(async(id:string)=>note(id)),save:vi.fn(async()=>{}),preview:vi.fn(),committed:vi.fn(),max,behavior:'fill' as 'fill'|'replace',capacity:()=>3};return {dep,nav:new PaneNavigation(()=>dep)};}
it.each([1,2,3])('fills %i slots then replaces without discarding sessions or prompting',async max=>{
 const {nav}=fixture(max);for(const id of ['A','B','C','D'])await nav.open(id);
 expect(nav.snapshot().panes).toHaveLength(max);expect(nav.snapshot().sessions).toHaveLength(4);expect(nav.snapshot().panes.at(-1)?.id).toBe('D');expect(nav.snapshot().issue).toBeNull();
});
it('reuses inactive sessions, focuses visible sessions and preserves linked journeys',async()=>{
 const {nav}=fixture(2);await nav.open('A');await nav.open('B');await nav.open('C');const oldA=nav.snapshot().sessions.find(p=>p.id==='A')!;
 await nav.open('A');expect(nav.snapshot().panes.some(p=>p.paneId===oldA.paneId)).toBe(true);expect(nav.snapshot().sessions).toHaveLength(3);
 await nav.open('B');expect(nav.snapshot().sessions).toHaveLength(3);
 const source=nav.snapshot().activePaneId!;await nav.open('D',{sourcePaneId:source,intent:'link'});expect(nav.snapshot().panes).toHaveLength(2);expect(nav.snapshot().panes.find(p=>p.paneId===source)?.history.map(v=>v.resourceId)).toEqual(['B','D']);
});
it('honors Reuse, explicit split and the live responsive capacity',async()=>{
 const {nav,dep}=fixture();dep.behavior='replace';await nav.open('A');await nav.open('B');expect(nav.snapshot().panes).toHaveLength(1);
 await nav.open('C',{destination:'new'});expect(nav.snapshot().panes).toHaveLength(2);
 dep.behavior='fill';dep.capacity=()=>1;await nav.open('D');expect(nav.snapshot().panes).toHaveLength(2);expect(nav.snapshot().sessions).toHaveLength(4);
 expect([sideBySideCapacity(850),sideBySideCapacity(851),sideBySideCapacity(1200),sideBySideCapacity(1201)]).toEqual([1,2,2,3]);
});
it('rechecks capacity after load, guards departure saves and retains valid focus during concurrency',async()=>{
 const {nav,dep}=fixture();await nav.open('A');let release!:(r:Resource)=>void;dep.load.mockImplementationOnce(()=>new Promise(resolve=>{release=resolve;}));const pending=nav.open('B');dep.capacity=()=>1;release(note('B'));await pending;expect(nav.snapshot().panes).toHaveLength(1);expect(dep.save).toHaveBeenCalledWith('A');
 dep.save.mockRejectedValueOnce(new Error('Unsaved'));await nav.open('C');expect(nav.snapshot().panes[0].id).toBe('B');expect(nav.snapshot().issue?.message).toBe('Unsaved');
});

it('explicit pane targeting overrides fill while visible reuse preserves the visit and reading anchor',async()=>{
 const {nav}=fixture(3);await nav.open('A');const a=nav.snapshot().panes[0];nav.recordPosition(a.paneId,a.history[0].visitId,{scrollTop:417});
 await nav.open('B');const b=nav.snapshot().panes[1];await nav.open('A');expect(nav.snapshot().panes).toHaveLength(2);expect(nav.snapshot().activePaneId).toBe(a.paneId);expect(nav.position(a.history[0].visitId).scrollTop).toBe(417);
 await nav.open('C',{sourcePaneId:b.paneId,destination:'here',intent:'link'});expect(nav.snapshot().panes.map(p=>p.id)).toEqual(['A','C']);expect(nav.snapshot().panes[1].history.map(v=>v.resourceId)).toEqual(['B','C']);
});
it('restores sessions and fills remaining configured capacity after restart',async()=>{
 const {nav}=fixture(3);await nav.open('A');await nav.open('B');const receipt=nav.exportSession();const restored=fixture(3).nav;
 restored.restore(receipt.panes,receipt.activePaneId,receipt.positions,receipt.sessions);await restored.open('C');expect(restored.snapshot().panes.map(p=>p.id)).toEqual(['A','B','C']);await restored.open('D');expect(restored.snapshot().panes.map(p=>p.id)).toEqual(['A','B','D']);expect(restored.snapshot().sessions).toHaveLength(4);
});
