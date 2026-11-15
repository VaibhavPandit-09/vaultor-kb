import {expect,it,vi} from 'vitest';
import {PaneNavigation} from '../lib/paneNavigation';
import type {Resource} from '../types';
import {decodeSession} from './desktopState';
import {decodeJourneys} from './journeyReceipt';
const setup=()=>{const save=vi.fn(async(_id:string)=>{void _id;});const nav=new PaneNavigation(()=>({max:3,behavior:'replace',save,load:async id=>({id,title:id,type:'note'} as Resource),preview:()=>{},committed:()=>{}}));return {nav,save};};
it('splits one shared resource into three independent sessions and inserts beside active',async()=>{
 const {nav}=setup();await nav.open('A');const first=nav.snapshot().panes[0];await nav.split();nav.activate(first.paneId);await nav.split();
 const panes=nav.snapshot().panes;expect(panes.map(p=>p.id)).toEqual(['A','A','A']);expect(new Set(panes.map(p=>p.paneId)).size).toBe(3);expect(new Set(panes.map(p=>p.slotId)).size).toBe(3);expect(panes[1].paneId).toBe(nav.snapshot().activePaneId);
 await expect(nav.split()).rejects.toThrow('All visible panes');await nav.open('B',{sourcePaneId:panes[1].paneId,intent:'link'});expect(nav.snapshot().panes.map(p=>p.id)).toEqual(['A','B','A']);await nav.history(-1);expect(nav.snapshot().panes.map(p=>p.id)).toEqual(['A','A','A']);
});
it('capacity reduction protects displaced views, retains active plus a peer and parks sessions',async()=>{
 const {nav,save}=setup();await nav.open('A');await nav.split('B');await nav.split('C');const third=nav.snapshot().activePaneId;
 save.mockRejectedValueOnce(new Error('Protect failed'));await expect(nav.setCapacity(2)).rejects.toThrow('Protect failed');expect(nav.snapshot().panes).toHaveLength(3);
 await nav.setCapacity(2);expect(nav.snapshot().panes.map(p=>p.id)).toEqual(['A','C']);expect(nav.snapshot().activePaneId).toBe(third);expect(nav.snapshot().sessions).toHaveLength(3);await nav.setCapacity(1);expect(nav.snapshot().panes[0].id).toBe('C');expect(nav.snapshot().sessions).toHaveLength(3);
});
it('decodes three-pane metadata and rejects four views or colliding slot assignments',()=>{
 const value={version:1,documents:[{id:'A'},{id:'A'},{id:'B'}],activePane:2,ratio:50,weights:[.3,.4,.3],browse:{screen:'resources',collection:null,criteria:{}},sidebar:true,companion:'sessions'};expect(decodeSession(value)?.activePane).toBe(2);expect(decodeSession({...value,documents:[...value.documents,{id:'C'}]})).toBeUndefined();
 const panes=value.documents.map((d,i)=>({paneId:'s'+i,slotId:'slot'+i,id:d.id,cursor:0,history:[{visitId:'v'+i,resourceId:d.id,title:d.id}]}));expect(decodeJourneys({sessions:panes,panes,positions:{},activePaneId:'s2'})?.panes).toHaveLength(3);expect(decodeJourneys({sessions:panes,panes:[panes[0],{...panes[1],slotId:'slot0'}],positions:{}})).toBeUndefined();
});
