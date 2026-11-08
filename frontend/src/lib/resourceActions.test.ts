// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { executeResourceCommand, RESOURCE_ACTION_EVENT, resourceCommandEnabled, type ActionRequest } from './resourceActions';
import type { Resource } from '../types';
vi.mock('./resourceBrowse',()=>({setResourceFavorite:vi.fn()}));
import { setResourceFavorite } from './resourceBrowse';
const note={id:'n',title:'Note',type:'note',tags:[],createdAt:'',updatedAt:''} as Resource;
afterEach(()=>vi.clearAllMocks());
it('refuses unsupported/linked operations before dispatch and retains ownership distinctions',async()=>{
 const linked={...note,type:'linked'}, unknown={...note,type:'future'};
 expect(resourceCommandEnabled('rename',linked)).toBe(false);expect(resourceCommandEnabled('export',linked)).toBe(false);
 expect(resourceCommandEnabled('open-another',linked)).toBe(true);expect(resourceCommandEnabled('open',unknown)).toBe(false);
 expect(resourceCommandEnabled('trash',unknown)).toBe(true);
 await expect(executeResourceCommand('rename',linked,'Changed')).rejects.toThrow('unavailable');
 await expect(executeResourceCommand('open',{...note,trashedAt:'2026-11-04'})).rejects.toThrow('unavailable');
});
it('uses the existing coordinator for menu operations and propagates refusal',async()=>{
 const receive=(event:Event)=>{event.preventDefault();const request=(event as CustomEvent<ActionRequest>).detail;expect(request.resources).toEqual([note]);expect(request.action).toBe('trash');request.reject(new Error('Save barrier failed'));};
 window.addEventListener(RESOURCE_ACTION_EVENT,receive);
 try{await expect(executeResourceCommand('trash',note)).rejects.toThrow('Save barrier failed');}finally{window.removeEventListener(RESOURCE_ACTION_EVENT,receive);}
 await expect(executeResourceCommand('open',note)).rejects.toThrow('unavailable in this view');
});
it('pin uses the authoritative favorite mutation and propagates failures',async()=>{
 await executeResourceCommand('pin',note);expect(setResourceFavorite).toHaveBeenCalledWith('n',true);
 vi.mocked(setResourceFavorite).mockRejectedValueOnce(new Error('Source changed'));
 await expect(executeResourceCommand('pin',note)).rejects.toThrow('Source changed');
});

it('native Reveal/Open use reviewed prepared-export coordination and reject externally owned sources',async()=>{const {configureConnection,getPlatform}=await import('./platform'),platform=getPlatform(),requests:ActionRequest[]=[];configureConnection({profileId:'desktop',kind:'local'},{...platform,prepareExportCopy:vi.fn()});const receive=(event:Event)=>{event.preventDefault();const request=(event as CustomEvent<ActionRequest>).detail;requests.push(request);request.resolve();};window.addEventListener(RESOURCE_ACTION_EVENT,receive);try{await executeResourceCommand('reveal-copy',{...note,type:'file'});await executeResourceCommand('open-copy',{...note,title:'File.txt',type:'file'});expect(resourceCommandEnabled('open-copy',{...note,title:'Application.exe',type:'file'})).toBe(false);expect(requests.map(request=>[request.action,request.value])).toEqual([['export-copy','reveal'],['export-copy','open']]);await expect(executeResourceCommand('reveal-copy',{...note,type:'linked'})).rejects.toThrow('unavailable');}finally{window.removeEventListener(RESOURCE_ACTION_EVENT,receive);configureConnection({profileId:'browser',kind:'browser'},platform);}});
