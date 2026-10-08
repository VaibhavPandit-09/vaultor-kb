// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { ManagedImage } from '../components/editor/ManagedImage';
import { SharedHistory, SharedNoteDocuments } from './sharedNoteDocuments';
import { attachImageUploads, noteImageJobs, uploadNoteImages, retryImageJob, removeImageJob, insertImageJob, validateImageContent, clipboardImages } from './noteImages';
const mocks = vi.hoisted(() => ({ import: vi.fn(), get: vi.fn() }));
vi.mock('./fileImports', () => ({ importResource: mocks.import }));
vi.mock('./api', () => ({ default: { get: mocks.get } }));
const editors: Editor[] = [], cleanups: (() => void)[] = [];
const images = ManagedImage.extend({ addNodeView() { return null; } });
function create(id: string, shared = new SharedNoteDocuments()) { const editor = new Editor({ onBeforeCreate: ({ editor }) => shared.prepare(editor), extensions: [StarterKit.configure({ undoRedo: false }), SharedHistory, images], content: '<p>hello</p>' }); editors.push(editor); cleanups.push(shared.attach(id, editor), attachImageUploads(id, editor)); return editor; }
const file = (name = 'a.png') => new File(['original'], name, { type: 'image/png' });
const tick = async () => { for (let i=0;i<8;i++) await Promise.resolve(); };
afterEach(() => { for (const cleanup of cleanups.splice(0)) cleanup(); for (const editor of editors.splice(0)) editor.destroy(); for (const id of ['one','other','order','shared','closed','removed']) for (const job of noteImageJobs(id)) removeImageJob(job.id); mocks.import.mockReset(); mocks.get.mockReset(); });
it('maps anchors through edits without saving pending bytes and keeps source ownership', async () => {
 let finish!: (value: { id: string }) => void; mocks.import.mockImplementation(() => new Promise(resolve => finish = resolve)); mocks.get.mockResolvedValue({ data: {format:'png',width:10,height:10,bytes:8,animated:false} });
 const source=create('one'),other=create('other');uploadNoteImages('one',source,[file()],6);await tick();source.commands.insertContentAt(1,'prefix');expect(JSON.stringify(source.getJSON())).not.toContain('original');finish({id:'image1'});await tick();expect(source.getJSON().content?.[1].attrs?.resourceId).toBe('image1');expect(other.getJSON().content).toHaveLength(1);expect(noteImageJobs('one')).toHaveLength(0);
});
it('reuses uncertain upload identity and preserves multi-image order across failures',async()=>{
 mocks.import.mockRejectedValueOnce(new Error('lost response')).mockResolvedValueOnce({id:'second'}).mockResolvedValueOnce({id:'first'});mocks.get.mockResolvedValue({data:{format:'png',width:1,height:1,bytes:8,animated:false}});
 const editor=create('order');uploadNoteImages('order',editor,[file('first.png'),file('second.png')],6);await tick();const first=noteImageJobs('order')[0];expect(first.status).toBe('failed');expect(editor.getJSON().content).toHaveLength(1);await retryImageJob(first.id);expect(mocks.import.mock.calls[0][0]).toBe(mocks.import.mock.calls[2][0]);expect(editor.getJSON().content?.filter(node=>node.type==='image').map(node=>node.attrs?.resourceId)).toEqual(['first','second']);
});
it('retains successful uploads when the last source view closes and offers insertion after reopening',async()=>{
 let finish!: (value:{id:string})=>void;mocks.import.mockImplementation(()=>new Promise(resolve=>finish=resolve));mocks.get.mockResolvedValue({data:{format:'png',width:1,height:1,bytes:8,animated:false}});const old=create('closed');uploadNoteImages('closed',old,[file()],6);await tick();cleanups.splice(0).forEach(cleanup=>cleanup());old.destroy();finish({id:'kept'});await tick();const job=noteImageJobs('closed')[0];expect(job.status).toBe('ready');const reopened=create('closed');insertImageJob(job.id,reopened);expect(JSON.stringify(reopened.getJSON())).toContain('kept');
});
it('shares image insertions, attribute transactions and undo without changing another placement',async()=>{
 mocks.import.mockResolvedValue({id:'shared-image'});mocks.get.mockResolvedValue({data:{format:'png',width:1,height:1,bytes:8,animated:false}});const shared=new SharedNoteDocuments(),a=create('shared',shared),b=create('shared',shared);uploadNoteImages('shared',a,[file()],6);await tick();expect(a.getJSON()).toEqual(b.getJSON());const pos=7;const node=b.state.doc.nodeAt(pos);expect(node?.type.name).toBe('image');b.view.dispatch(b.state.tr.setNodeMarkup(pos,undefined,{...node!.attrs,width:45,caption:'caption'}));expect(a.getJSON()).toEqual(b.getJSON());a.commands.undo();expect(a.getJSON()).toEqual(b.getJSON());expect(a.getJSON().content?.find(node=>node.type==='image')?.attrs?.width).toBe(100);
});
it('rejects oversized/unsupported uploads and unsupported persisted image data',async()=>{
 const editor=create('removed');const big=file();Object.defineProperty(big,'size',{value:21*1024*1024});uploadNoteImages('removed',editor,[big],6);await tick();expect(mocks.import).not.toHaveBeenCalled();expect(noteImageJobs('removed')[0].error).toContain('20 MiB');expect(()=>validateImageContent({type:'doc',content:[{type:'image',attrs:{src:'data:image/png'}}]})).toThrow('original JSON');expect(clipboardImages({files:[file(),new File(['t'],'text.txt',{type:'text/plain'})]} as unknown as DataTransfer)).toHaveLength(1);
});

it('retains uploaded resources if the mapped insertion anchor is deleted',async()=>{
 let finish!:(value:{id:string})=>void;mocks.import.mockImplementation(()=>new Promise(resolve=>finish=resolve));mocks.get.mockResolvedValue({data:{format:'png',width:1,height:1,bytes:8,animated:false}});const editor=create('removed');uploadNoteImages('removed',editor,[file()],3);await tick();editor.commands.deleteRange({from:1,to:6});finish({id:'retained'});await tick();expect(noteImageJobs('removed')[0].valid).toBe(false);expect(editor.getJSON().content?.some(node=>node.type==='image')).toBe(false);insertImageJob(noteImageJobs('removed')[0].id,editor);expect(JSON.stringify(editor.getJSON())).toContain('retained');
});
it('replaces only the selected placement and retains its sizing and caption',async()=>{
 const editor=create('one');editor.commands.insertContentAt(6,[{type:'image',attrs:{resourceId:'old',width:40,caption:'keep',alignment:'right'}},{type:'image',attrs:{resourceId:'old',width:100}}]);let first=0;editor.state.doc.descendants((node,pos)=>{if(node.type.name==='image'&&!first)first=pos;});mocks.import.mockResolvedValue({id:'new'});mocks.get.mockResolvedValue({data:{format:'png',width:1,height:1,bytes:8,animated:false}});uploadNoteImages('one',editor,[file()],first,'old');await tick();const placements=editor.getJSON().content?.filter(node=>node.type==='image');expect(placements?.map(node=>node.attrs?.resourceId)).toEqual(['new','old']);expect(placements?.[0].attrs).toMatchObject({width:40,caption:'keep',alignment:'right'});
});
