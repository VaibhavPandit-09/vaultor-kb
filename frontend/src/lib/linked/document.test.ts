import {expect,it} from 'vitest';
import {MarkdownEngine} from '../markdown/engine';
import {MarkdownSession} from '../markdown/session';
import type {MarkdownPort,WorkerRequest} from '../markdown/protocol';
import {LinkedDocument} from './document';
import type {LinkedRequest,Opened} from './types';
class Port implements MarkdownPort{
  onmessage:MarkdownPort['onmessage']=null;onerror:MarkdownPort['onerror']=null;
  engine=new MarkdownEngine(new TextEncoder().encode('Initial\n'));
  postMessage=(r:WorkerRequest)=>{queueMicrotask(()=>{
    if(r.type==='open')this.onmessage?.({data:{type:'ready',source:this.engine.source,doc:this.engine.projection.doc}});
    if(r.type==='edit')this.onmessage?.({data:{type:'result',version:r.version,result:this.engine.apply(r.doc),historyBytes:0}});
  });};terminate=()=>{};
}
const opened:Opened={id:'document',source:'source',binding:'binding',name:'Guide.md',relative:'Guide.md',identity:'identity',revision:'revision',bytes:new TextEncoder().encode('Initial\n'),size:8,readonlyReason:''};
async function fixture(handler:(operation:string,p:Record<string,unknown>)=>Promise<unknown>){const session=new MarkdownSession(new Port(),opened.bytes);await session.ready;const document=new LinkedDocument(opened,session,handler as LinkedRequest);return {document,session};}
async function edit(session:MarkdownSession,text:string){const doc=structuredClone(session.initialDoc!);doc.content![0].content![0].text=text;session.submit(doc);await new Promise(resolve=>setTimeout(resolve,0));}
it('protects source and visual draft without automatically saving to disk',async()=>{const calls:string[]=[];const f=await fixture(async(op,p)=>{calls.push(op);return {version:p.version,protected:true,validated:true};});try{await edit(f.session,'Changed');await f.document.flush();expect(calls).toEqual(['protect']);expect(f.document.getSnapshot()).toMatchObject({dirty:true,protectedVersion:1});}finally{f.document.dispose();}});
it('older successful Save leaves newer editor transactions dirty',async()=>{let finish!:(v:unknown)=>void;const saving=new Promise(resolve=>{finish=resolve;});let savingStarted!:()=>void;const started=new Promise<void>(resolve=>{savingStarted=resolve;});const f=await fixture(async(op,p)=>{if(op==='protect')return {version:p.version,protected:true,validated:true};savingStarted();return saving;});try{await edit(f.session,'First');const save=f.document.save();await started;await edit(f.session,'Second');finish({state:'COMMITTED',version:1});await save;expect(f.document.getSnapshot()).toMatchObject({dirty:true,saving:false});expect(f.session.source).toBe('Second\n');}finally{f.document.dispose();}});
it('unsupported visual edit remains protected and never invokes native Save',async()=>{const calls:string[]=[];const f=await fixture(async(op,p)=>{calls.push(op);return {version:p.version,protected:true,validated:false};});try{const draft=structuredClone(f.session.initialDoc!);draft.content![0].content![0].marks=[{type:'underline'}];f.session.submit(draft);await new Promise(resolve=>setTimeout(resolve,0));await f.document.flush();await expect(f.document.save()).rejects.toThrow('Undo');expect(calls).toEqual(['protect']);expect(f.session.checkpoint().draft).toEqual(draft);}finally{f.document.dispose();}});
it('an uncertain receipt blocks repeated Save but retains subsequent drafts',async()=>{let saves=0;const f=await fixture(async(op,p)=>{if(op==='save'){saves++;return {state:'RECOVERY_REQUIRED',version:p.version,operation:'operation'};}return {version:p.version,protected:true,validated:true};});try{await edit(f.session,'Changed');await f.document.save();await edit(f.session,'Newer');await f.document.flush();await expect(f.document.save()).rejects.toThrow('previous Save');expect(saves).toBe(1);expect(f.document.getSnapshot()).toMatchObject({dirty:true,recovery:true,protectedVersion:2});}finally{f.document.dispose();}});
it('revalidates an earlier unvalidated journal when the worker settles at the same editor version',async()=>{let protectedCalls=0;const f=await fixture(async(_,p)=>({version:p.version,protected:true,validated:++protectedCalls>1}));try{await edit(f.session,'Changed');await f.document.protect();await f.document.protect();expect(protectedCalls).toBe(2);}finally{f.document.dispose();}});
