// @vitest-environment jsdom
import {render,cleanup,waitFor,fireEvent} from '@testing-library/react';
import {afterEach,expect,it} from 'vitest';
import {MarkdownEngine} from '../markdown/engine';
import {MarkdownSession} from '../markdown/session';
import type {MarkdownPort,WorkerRequest,WorkerReply} from '../markdown/protocol';
import {EscapeManagerProvider} from '../escape/EscapeManagerProvider';
import LinkedEditor from '../../components/editor/LinkedEditor';
import {LinkedDocument} from './document';
import type {LinkedRequest,Opened} from './types';
afterEach(cleanup);
class Port implements MarkdownPort{
  onmessage:MarkdownPort['onmessage']=null;onerror:MarkdownPort['onerror']=null;engine!:MarkdownEngine;closed=false;
  postMessage=(r:WorkerRequest)=>{queueMicrotask(()=>{if(this.closed)return;let reply:WorkerReply;
    if(r.type==='open'){this.engine=new MarkdownEngine(r.bytes);reply={type:'ready',source:this.engine.source,doc:this.engine.projection.doc};}
    else if(r.type==='edit')reply={type:'result',version:r.version,result:this.engine.apply(r.doc),historyBytes:this.engine.historyBytes};
    else if(r.type==='region')reply={type:'region',version:r.version,...this.engine.sourceRegion(r.block,r.expected)};
    else {const doc=this.engine.editRegion(r.token,r.text);reply={type:'result',version:r.version,doc,result:{accepted:true,source:this.engine.source,patches:[],patchMs:0,validationMs:0},historyBytes:0};}
    this.onmessage?.({data:reply});
  });};terminate=()=>{this.closed=true;};
}
async function fixture(){
  const source='---\r\ntitle: keep\r\n---\r\n\r\nParagraph **bold**.\r\n\r\n<!-- preserve -->\r\n',bytes=new TextEncoder().encode(source),session=new MarkdownSession(new Port(),bytes);await session.ready;
  const opened:Opened={id:'document',source:'source',binding:'binding',name:'Guide.md',relative:'Guide.md',identity:'inode',revision:'sha',size:bytes.length,bytes,readonlyReason:''},calls:{operation:string;payload:Record<string,unknown>}[]=[];
  const request:LinkedRequest=async<T,>(operation:string,payload:Record<string,unknown>={})=>{calls.push({operation,payload});return (operation==='save'?{state:'COMMITTED',version:payload.version}:{protected:true,validated:!payload.sourceDraft,version:payload.version}) as T;};
  const document=new LinkedDocument(opened,session,request),mount=()=>render(<EscapeManagerProvider><LinkedEditor document={document} paneId="pane" active={false} locked={false} restoreFocus={false} selectionKey="visit" onSelection={()=>{}} onActivate={()=>{}} onFocusRestored={()=>{}}/></EscapeManagerProvider>);
  return {document,session,calls,source,mount};
}
it('production linked surface opens exact CRLF source and Ctrl+S explicitly protects then saves local edits',async()=>{const f=await fixture(),view=f.mount();try{await waitFor(()=>expect(f.document.editors.size).toBe(1));expect(f.session.source).toBe(f.source);expect(f.calls).toEqual([]);const editor=[...f.document.editors][0];let position=0;editor.state.doc.descendants((node,pos)=>{if(node.isText&&node.text?.startsWith('Paragraph'))position=pos;});editor.view.dispatch(editor.state.tr.insertText('Edited ',position));await waitFor(()=>expect(f.session.status.state).toBe('ready'));expect(f.session.source).toBe(f.source.replace('Paragraph','Edited Paragraph'));fireEvent.keyDown(editor.view.dom,{key:'s',ctrlKey:true});await waitFor(()=>expect(f.calls.map(c=>c.operation)).toEqual(['protect','save']));expect(f.document.getSnapshot().dirty).toBe(false);expect(f.calls[0].payload.source).toBe(f.session.source);}finally{view.unmount();f.document.dispose();}});
it('production linked surface retains shared Undo across pane unmount/remount',async()=>{const f=await fixture();let view=f.mount();try{await waitFor(()=>expect(f.document.editors.size).toBe(1));const first=[...f.document.editors][0];let position=0;first.state.doc.descendants((node,pos)=>{if(node.isText&&node.text?.startsWith('Paragraph'))position=pos;});first.view.dispatch(first.state.tr.insertText('New ',position));await waitFor(()=>expect(f.session.source).toContain('New Paragraph'));view.unmount();view=f.mount();await waitFor(()=>expect(f.document.editors.size).toBe(1));const second=[...f.document.editors][0];expect(second.getText()).toContain('New Paragraph');expect(second.commands.undo()).toBe(true);await waitFor(()=>expect(f.session.source).toBe(f.source));}finally{view.unmount();f.document.dispose();}});
