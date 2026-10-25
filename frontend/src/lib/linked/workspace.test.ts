import {afterEach,expect,it,vi} from 'vitest';
import type {Editor,JSONContent} from '@tiptap/core';
import {LinkedWorkspace} from './workspace';
import {MarkdownEngine} from '../markdown/engine';
import type {WorkerReply,WorkerRequest} from '../markdown/protocol';
import type {LinkedRequest,Opened} from './types';
class WorkerStub{
  onmessage:((event:MessageEvent<WorkerReply>)=>void)|null=null;onerror:((event:unknown)=>void)|null=null;engine!:MarkdownEngine;closed=false;
  postMessage(r:WorkerRequest){queueMicrotask(()=>{if(this.closed)return;let data:WorkerReply;if(r.type==='open'){this.engine=new MarkdownEngine(r.bytes);data={type:'ready',source:this.engine.source,doc:this.engine.projection.doc};}else if(r.type==='edit')data={type:'result',version:r.version,result:this.engine.apply(r.doc),historyBytes:0};else throw Error('Unused source operation');this.onmessage?.({data} as MessageEvent<WorkerReply>);});}
  terminate(){this.closed=true;}
}
afterEach(()=>vi.unstubAllGlobals());
function fixture(){vi.stubGlobal('Worker',WorkerStub);const workspace=new LinkedWorkspace(()=>({id:'workspace',generation:'generation'})),calls:string[]=[],drafts=new Map<string,{document:JSONContent;source?:string;version:number}>();
  workspace.request=(async(operation,p={})=>{calls.push(operation);const id=String(p.document);
    if(operation==='open'){const saved=drafts.get(id);const source='Paragraph '+id+'.\n';return {id,source:'root',binding:id+'-binding',identity:id+'-inode',revision:'sha',name:id+'.md',relative:id+'.md',bytes:new TextEncoder().encode(source),size:source.length,readonlyReason:'',seed:saved?new TextEncoder().encode(saved.source??source):undefined,visual:saved?{schema:'G3_VISUAL_1',document:saved.document}:undefined,nativeVersion:saved?.version} satisfies Opened;}
    if(operation==='protect'){drafts.set(id,{document:structuredClone(p.draft as JSONContent),source:p.source as string|undefined,version:p.version as number});return {protected:true,validated:p.source!==undefined,version:p.version};}
    if(operation==='close')return;
    throw Error('Unexpected '+operation);
  }) as LinkedRequest;
  return {workspace,calls};
}
it('unavailable linked source remains an accessible session state rather than blocking all workspace restoration',async()=>{const {workspace}=fixture();workspace.request=(async()=>{throw Error('SOURCE_UNAVAILABLE');}) as LinkedRequest;await expect(workspace.open('missing')).resolves.toBeUndefined();expect(workspace.unavailable.get('missing')).toContain('unavailable');expect(workspace.documents.size).toBe(0);await workspace.close();});
it('bounded inactive cache protects rejected visual edits and restores them when the session is revisited',async()=>{const {workspace,calls}=fixture();try{await workspace.open('first');const first=workspace.documents.get('first')!,draft=structuredClone(first.session.initialDoc!);draft.content![0].content![0].marks=[{type:'underline'}];draft.content![0].content![0].text='Retained rejected draft';first.session.submit(draft);await new Promise(resolve=>setTimeout(resolve,0));for(let i=0;i<9;i++)await workspace.open('other-'+i);expect(workspace.documents.size).toBeLessThanOrEqual(7);expect(workspace.documents.has('first')).toBe(false);expect(calls).not.toContain('save');await workspace.open('first');await new Promise(resolve=>setTimeout(resolve,0));expect(workspace.documents.get('first')!.session.checkpoint().draft).toEqual(draft);expect(workspace.documents.get('first')!.session.status.state).toBe('needs-source');}finally{await workspace.close();}});
it('cache admission never evicts a mounted active editor',async()=>{const {workspace}=fixture();try{for(let i=0;i<7;i++){await workspace.open('active-'+i);workspace.documents.get('active-'+i)!.editors.add({} as Editor);}await workspace.open('new');expect(workspace.documents.size).toBe(7);expect(workspace.unavailable.get('new')).toContain('Close a document pane');expect(workspace.documents.has('active-0')).toBe(true);}finally{await workspace.close();}});
