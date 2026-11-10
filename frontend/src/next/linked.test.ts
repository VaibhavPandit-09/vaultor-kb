import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {LinkedEditingSession} from './linked';
import type {LinkedDocument} from './linkedTypes';
const invoke=vi.hoisted(()=>vi.fn());vi.mock('./client',()=>({command:invoke}));
const body=(text:string)=>({type:'doc',content:[{type:'paragraph',content:[{type:'text',text}]}]});
const document=():LinkedDocument=>({id:'linked:file',documentId:'file',sourceId:'root',path:'a.md',identity:'inode',revision:'a',title:'a.md',base:'A\n',content:body('A'),editable:true,reason:null,frontmatter:'',draft:null,current:null});
beforeEach(()=>{vi.useFakeTimers();invoke.mockReset();invoke.mockResolvedValue({sequence:1});});afterEach(()=>vi.useRealTimers());
it('captures efficiently into a durable journal but never publishes on timers or navigation protection',async()=>{
 const session=new LinkedEditingSession(()=>{}),doc=document();session.adopt(doc);const capture=vi.fn(()=>body('Latest'));
 for(let i=0;i<12;i++)session.edit(doc.id,capture);expect(capture).not.toHaveBeenCalled();await vi.advanceTimersByTimeAsync(250);expect(capture).toHaveBeenCalledTimes(1);expect(invoke).toHaveBeenCalledWith({kind:'linked',request:expect.objectContaining({op:'protect',sequence:12})});
 session.releaseViews();expect(session.snapshot(doc.id)).toEqual(body('Latest'));capture.mockImplementation(()=>{throw Error('Editor destroyed');});
 await vi.advanceTimersByTimeAsync(5000);await session.protectAll();expect(invoke.mock.calls.filter(([r])=>r.request.op==='save')).toHaveLength(0);expect(session.status(doc.id)).toContain('explicit Save');session.forget(doc.id);expect([...session.ids()]).toHaveLength(0);
});
it('publishes only explicitly, preserves newer edits across an older receipt and journals them against the new baseline',async()=>{
 const session=new LinkedEditingSession(()=>{}),doc=document();session.adopt(doc);session.edit(doc.id,()=>body('B'));await session.protect(doc.id);
 let release:(v:LinkedDocument)=>void=()=>{};invoke.mockImplementation(async r=>r.request.op==='save'?new Promise<LinkedDocument>(resolve=>{release=resolve;}):{sequence:r.request.sequence});
 const saving=session.save(doc.id);await Promise.resolve();await Promise.resolve();session.edit(doc.id,()=>body('C'));session.releaseViews();release({...doc,revision:'b',base:'B\n',content:body('B')});await saving;expect(session.dirty(doc.id)).toBe(true);await vi.advanceTimersByTimeAsync(1);expect(invoke.mock.calls.some(([r])=>r.request.op==='protect'&&r.request.revision==='b'&&r.request.content.content[0].content[0].text==='C')).toBe(true);
});
it('keeps protected content on conflicts and blocks forgetting an unprotected failed journal',async()=>{
 const session=new LinkedEditingSession(()=>{}),doc=document();session.adopt(doc);session.edit(doc.id,()=>body('User draft'));await session.protect(doc.id);invoke.mockRejectedValue('External revision conflict');await expect(session.save(doc.id)).rejects.toContain('conflict');expect(session.dirty(doc.id)).toBe(true);expect(session.snapshot(doc.id)?.content?.[0].content?.[0].text).toBe('User draft');expect(session.status(doc.id)).toBe('external conflict');
 session.edit(doc.id,()=>body('Newer unprotected'));await expect(session.protectAll()).rejects.toBeTruthy();expect(()=>session.forget(doc.id)).toThrow('journal');
});
it('restores one document owner and exposes pending publication without automatically retrying it',async()=>{
 const session=new LinkedEditingSession(()=>{}),doc={...document(),draft:{token:'original',sequence:4},current:{current:{error:'missing'},publication:{status:'captured',stage:'stage',capture:'capture',originalHash:'old',candidateHash:'next'}}};session.adopt(doc);expect([...session.ids()]).toEqual([doc.id]);expect(session.locked(doc.id)).toBe(true);expect(session.status(doc.id)).toBe('review publication');await session.protectAll();expect(invoke).not.toHaveBeenCalled();
});

it('releases inactive clean source bodies and keeps protected unsaved source work',async()=>{const s=new LinkedEditingSession(()=>{}),doc=document();s.adopt(doc);s.adopt({...doc,id:'clean'});s.edit(doc.id,()=>body('Draft'));await s.protect(doc.id);s.releaseInactive([]);expect(s.get('clean')).toBeUndefined();expect(s.get(doc.id)).toBeDefined();expect(s.status(doc.id)).toContain('explicit Save');});
