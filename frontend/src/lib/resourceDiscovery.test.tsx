// @vitest-environment jsdom
import {afterEach,expect,it,vi} from 'vitest';
import {act,cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import api from './api';
import {browseResources} from './resourceBrowse';
import {searchResources} from './resourceSearch';
import {resourceDescription,resourceFilter,resourceKind,resourcePresentation} from './resourceKinds';
import {notifyResourceChange} from './resourceEvents';
import {thumbnail,resetThumbnails} from './resourceThumbnails';
import {useResourceSummary} from './resourceSummaries';
import ResourceReferences from '../components/ResourceReferences';
import {EscapeManagerProvider} from './escape/EscapeManagerProvider';
import {requestResourceAction} from './resourceActions';
import {localReferences,type ReferencePage} from './resourceReferences';
const state=vi.hoisted(()=>({connection:{epoch:1,workspaceId:'test',generation:'one'},get:vi.fn()}));
vi.mock('./api',()=>({default:{get:state.get}}));
vi.mock('./platform',()=>({getConnection:()=>state.connection}));
vi.mock('./resourceActions',()=>({requestResourceAction:vi.fn()}));
afterEach(()=>{cleanup();resetThumbnails();notifyResourceChange({kind:'workspace'});vi.resetAllMocks();vi.unstubAllGlobals();});
const page={items:[],page:0,size:100,totalItems:0,totalPages:0,appliedCategory:'image'};
it('maps categories to file queries while preserving collection, tags, query and server totals',async()=>{
 state.get.mockResolvedValue({data:page});await browseResources({type:'image',q:'needle',collection:'topic',tags:['a','b'],page:2,size:100});
 const params=vi.mocked(api.get).mock.calls[0][1]!.params as URLSearchParams;
 expect(params.get('type')).toBe('file');expect(params.get('category')).toBe('image');expect(params.get('collection')).toBe('topic');expect(params.getAll('tag')).toEqual(['a','b']);expect(params.get('page')).toBe('2');
 await searchResources({type:'image',q:'needle',collection:'topic'});expect(vi.mocked(api.get).mock.calls[1][0]).toBe('/resources/query');
});
it('refuses silently broadened category search on an older host',async()=>{
 state.get.mockResolvedValue({data:{...page,appliedCategory:undefined}});await expect(browseResources({type:'image'})).rejects.toThrow('0.6.0');await expect(searchResources({type:'image'})).rejects.toThrow('0.6.0');
});
it('uses file descriptors consistently without turning categories or unknown kinds into resources',()=>{
 for(const [mime,label,category] of [['image/png','Image · PNG','image'],['application/pdf','PDF','pdf'],['audio/wav','Audio · WAV','audio'],['video/mp4','Video · MP4','video'],['text/plain','Text file · PLAIN','text'],['application/octet-stream','File','other']]){expect(resourceDescription({type:'file',title:'x',mimeType:mime})).toBe(label);expect(resourcePresentation({type:'file',mimeType:mime}).type).toBe(category);expect(resourceFilter(category)).toEqual({type:'file',category});}
 expect(resourceKind('image').mode).toBe('unsupported');expect(resourceKind('file').mode).toBe('preview');expect(resourceKind('future').mode).toBe('unsupported');
});
function urls(){vi.stubGlobal('URL',class extends URL{static createObjectURL=vi.fn(()=> 'blob:fixture');static revokeObjectURL=vi.fn();});}
it('discards thumbnail completion after metadata invalidation or connection changes',async()=>{
 urls();let finish!:(v:{data:Blob})=>void;state.get.mockImplementation(()=>new Promise(r=>{finish=r;}));const pending=thumbnail('image','revision',new AbortController().signal);notifyResourceChange({kind:'metadata',ids:['image']});finish({data:new Blob(['bytes'],{type:'image/png'})});await expect(pending).rejects.toThrow('superseded');expect(URL.createObjectURL).not.toHaveBeenCalled();
 const second=thumbnail('image','revision',new AbortController().signal);state.connection={...state.connection,epoch:2};finish({data:new Blob(['bytes'],{type:'image/png'})});await expect(second).rejects.toThrow('superseded');
});
it('reuses bounded static thumbnails, evicts released entries and rejects unsafe blobs',async()=>{
 urls();state.get.mockResolvedValue({data:new Blob(['bytes'],{type:'image/png'})});const a=await thumbnail('x','r',new AbortController().signal),b=await thumbnail('x','r',new AbortController().signal);expect(state.get).toHaveBeenCalledTimes(1);a.release();b.release();for(let i=0;i<50;i++)(await thumbnail('x'+i,'r',new AbortController().signal)).release();expect(URL.revokeObjectURL).toHaveBeenCalled();state.get.mockResolvedValue({data:new Blob(['unsafe'],{type:'image/svg+xml'})});await expect(thumbnail('bad','r',new AbortController().signal)).rejects.toThrow('bounds');
});
it('refreshes inline metadata without loading note bodies or changing stored labels',async()=>{
 state.get.mockResolvedValue({data:{id:'inline',type:'file',title:'Current title',mimeType:'image/png'}});function Inline(){const item=useResourceSummary('inline');return <span>{item?.title}</span>;}render(<Inline/>);await screen.findByText('Current title');state.get.mockResolvedValue({data:{id:'inline',type:'file',title:'Renamed',mimeType:'image/png'}});act(()=>notifyResourceChange({kind:'metadata',ids:['inline']}));await screen.findByText('Renamed');expect(state.get.mock.calls.every(call=>call[0]==='/resources/inline/summary')).toBe(true);
});
const reference:ReferencePage={page:0,size:30,totalItems:1,totalPages:1,totalOccurrences:2,sourceRevision:'r',items:[{id:'source',title:'Source',type:'note',available:true,trashed:false,revision:'r',noteLinks:0,fileLinks:1,images:1,otherLinks:0,occurrences:[{path:'/0/0',kind:'file-link',label:'Stored label'},{path:'/1',kind:'image',label:'Caption'}]}]};
it('shows saved source/occurrence counts, local drafts and validates occurrence handoff',async()=>{
 state.get.mockResolvedValue({data:reference});vi.mocked(requestResourceAction).mockResolvedValue(undefined);const close=vi.fn();render(<EscapeManagerProvider><ResourceReferences resource={{id:'image',title:'Original'}} localNotes={[{id:'source',title:'Draft source',content:{type:'doc',content:[{type:'image',attrs:{resourceId:'image'}}]}}]} onClose={close}/></EscapeManagerProvider>);
 await screen.findByText(/Saved content · 1 note · 2 occurrences/);expect(screen.getByText(/other devices’ drafts/)).toBeTruthy();fireEvent.click(screen.getByText('Occurrences'));fireEvent.click(screen.getByRole('button',{name:/Link · Stored label/}));await waitFor(()=>expect(close).toHaveBeenCalledOnce());expect(requestResourceAction).toHaveBeenCalledWith('reference-open',expect.arrayContaining([expect.objectContaining({id:'source'})]),JSON.stringify({path:'/0/0',targetId:'image',revision:'r'}));
 expect(localReferences([{id:'d',title:'D',content:{type:'doc',content:[{type:'image',attrs:{resourceId:'image'}},{type:'image',attrs:{resourceId:'image'}}]}}],'image')).toHaveLength(1);
});
it('retains useful reference rows after background failure and prevents unavailable navigation',async()=>{
 state.get.mockResolvedValue({data:{...reference,items:[{...reference.items[0],available:false,trashed:true}]}});render(<EscapeManagerProvider><ResourceReferences resource={{id:'image',title:'Original'}} onClose={()=>{}}/></EscapeManagerProvider>);await screen.findByText('Source');expect(screen.getByRole('button',{name:/Source.*In Trash/}).hasAttribute('disabled')).toBe(true);state.get.mockRejectedValue(new Error('offline'));act(()=>notifyResourceChange({kind:'metadata',ids:['image']}));await screen.findByRole('alert');expect(screen.getByText('Source')).toBeTruthy();
});
it('discards superseded direction responses and restores captured focus on Escape',async()=>{
 const trigger=document.createElement('button');document.body.append(trigger);trigger.focus();let finish!:(value:{data:ReferencePage})=>void;state.get.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;})).mockResolvedValue({data:{...reference,totalItems:0,totalOccurrences:0,items:[]}});const close=vi.fn();render(<EscapeManagerProvider><ResourceReferences resource={{id:'image',title:'Original'}} onClose={close}/></EscapeManagerProvider>);fireEvent.click(screen.getByRole('button',{name:'Links out'}));await screen.findByText('No saved outgoing links or image placements.');await act(async()=>finish({data:reference}));expect(screen.queryByText('Source')).toBeNull();fireEvent.keyDown(document.activeElement!,{key:'Escape'});expect(close).toHaveBeenCalledOnce();await waitFor(()=>expect(document.activeElement).toBe(trigger));trigger.remove();
});
it('prevents repeated execution while navigation is pending',async()=>{
 state.get.mockResolvedValue({data:reference});let finish!:(value?:void)=>void;vi.mocked(requestResourceAction).mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));const close=vi.fn();render(<EscapeManagerProvider><ResourceReferences resource={{id:'image',title:'Original'}} onClose={close}/></EscapeManagerProvider>);await screen.findByText('Source');const button=screen.getByRole('button',{name:/SourceNote/});fireEvent.click(button);fireEvent.click(button);expect(requestResourceAction).toHaveBeenCalledOnce();await act(async()=>finish());expect(close).toHaveBeenCalledOnce();
});
