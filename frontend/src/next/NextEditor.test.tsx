// @vitest-environment jsdom
import { act, fireEvent, render, waitFor } from '@testing-library/react';
import { beforeAll,expect, it, vi } from 'vitest';
import type { Editor } from '@tiptap/core';
import { EscapeManagerProvider } from '../lib/escape/EscapeManagerProvider';
import { SharedNoteDocuments } from '../lib/sharedNoteDocuments';
import NextEditor from './NextEditor';
import {resourceLinkPluginKey} from '../components/editor/ResourceLinkDefinition';
import {captureImportTarget} from '../lib/importTarget';
vi.stubGlobal('ResizeObserver',class{observe(){}disconnect(){}});
// jsdom has no text layout; these tests assert editor state,not popup geometry.
beforeAll(()=>Object.defineProperties(Range.prototype,{getClientRects:{configurable:true,value:()=>[]},getBoundingClientRect:{configurable:true,value:()=>new DOMRect(0,0,1,16)}}));
it('journals document edits but does not treat locking and selection as edits',async()=>{
  const documents=new SharedNoteDocuments(),changed=vi.fn();let editor!:Editor;
  const prepare=documents.prepare.bind(documents);
  vi.spyOn(documents,'prepare').mockImplementation((value,scope)=>{editor=value;prepare(value,scope);});
  const note={id:'a',title:'A',revision:1,content:{type:'doc',content:[{type:'paragraph'}]}};
  const view=(locked:boolean)=><EscapeManagerProvider><div className="next-document"><div className="next-note-bar"/><NextEditor note={note} documents={documents} changed={changed} locked={locked} pane={0}/></div></EscapeManagerProvider>;
  const mounted=render(view(false));await waitFor(()=>expect(editor?.isInitialized).toBe(true));
  expect(changed).not.toHaveBeenCalled();
  expect(mounted.getByRole('button',{name:'Note formatting'}).closest('.next-note-bar')).toBeTruthy();fireEvent.click(mounted.getByRole('button',{name:'Note formatting'}));await waitFor(()=>expect(mounted.getByLabelText('Insert resource link')).toBeTruthy());fireEvent.click(mounted.getByRole('button',{name:'Block and link actions'}));await mounted.findByRole('menuitem',{name:'Paragraph'});fireEvent.keyDown(document,{key:'Escape'});await waitFor(()=>expect(mounted.queryByRole('menuitem',{name:'Paragraph'})).toBeNull());expect(changed).not.toHaveBeenCalled();fireEvent.click(mounted.getByLabelText('Insert resource link'));act(()=>{editor.commands.insertContent('M9');});expect(resourceLinkPluginKey.getState(editor.state)).toMatchObject({active:true,query:'M9'});act(()=>{editor.commands.setContent(note.content);editor.view.dispatch(editor.state.tr.setMeta(resourceLinkPluginKey,{active:false,range:null,query:''}));});changed.mockClear();
  const target=captureImportTarget(editor,editor.state.selection);act(()=>target.insert([{type:'text',text:'mapped anchor'}]));expect(editor.getText()).toContain('mapped anchor');changed.mockClear();
  act(()=>{editor.commands.insertContent('actual edit');});expect(changed).toHaveBeenCalledTimes(1);
  mounted.rerender(view(true));await waitFor(()=>expect(editor.isEditable).toBe(false));
  const protectedContent=editor.getJSON();act(()=>{editor.commands.insertContent('must not change a locked document');});expect(editor.getJSON()).toEqual(protectedContent);expect(changed).toHaveBeenCalledTimes(1);
  mounted.rerender(view(false));await waitFor(()=>expect(editor.isEditable).toBe(true));
  act(()=>{editor.commands.setTextSelection(1);});expect(changed).toHaveBeenCalledTimes(1);
  mounted.unmount();
});
it('shares rich managed blocks and undo between panes without enabling the linked schema',async()=>{
  const documents=new SharedNoteDocuments(),editors:Editor[]=[];const prepare=documents.prepare.bind(documents);vi.spyOn(documents,'prepare').mockImplementation((value,scope)=>{editors.push(value);prepare(value,scope);});
  const note={id:'rich',title:'Rich',revision:1,content:{type:'doc',content:[{type:'paragraph'}]}};
  const mounted=render(<EscapeManagerProvider>{[0,1].map(pane=><NextEditor key={pane} note={note} documents={documents} changed={()=>{}} locked={false} pane={pane}/>)}</EscapeManagerProvider>);
  await waitFor(()=>expect(editors.filter(e=>e.isInitialized)).toHaveLength(2));
  act(()=>{editors[0].commands.insertContent([{type:'paragraph',content:[{type:'resourceLink',attrs:{resourceId:'target',label:'Target',type:'note'}}]},{type:'codeBlock',attrs:{language:'javascript'},content:[{type:'text',text:'const value = 1;'}]}]);});
  expect(editors[1].getJSON()).toEqual(editors[0].getJSON());expect(editors[0].getJSON().content?.some(n=>n.type==='codeBlock')).toBe(true);
  let linkPosition=0;editors[0].state.doc.descendants((node,pos)=>{if(node.type.name==='resourceLink')linkPosition=pos;});act(()=>{editors[0].view.focus();editors[0].commands.setNodeSelection(linkPosition);});expect(mounted.container.querySelector('.next-editor-tools[data-selection=true]')).toBeNull();
  act(()=>{editors[0].commands.insertTable({rows:2,cols:2,withHeaderRow:true});editors[0].commands.addColumnAfter();});expect(editors[1].getJSON()).toEqual(editors[0].getJSON());
  mounted.unmount();
});

it('restores a bounded caret without treating restoration or later selection as document edits',async()=>{const documents=new SharedNoteDocuments(),changed=vi.fn(),positionChanged=vi.fn();let editor!:Editor;const prepare=documents.prepare.bind(documents);vi.spyOn(documents,'prepare').mockImplementation((value,scope)=>{editor=value;prepare(value,scope);});const note={id:'caret',title:'Caret',revision:1,content:{type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'Reading position'}]}]}};const mounted=render(<EscapeManagerProvider><NextEditor note={note} documents={documents} changed={changed} locked={false} pane={0} initialSelection={{from:7,to:7}} positionChanged={positionChanged}/></EscapeManagerProvider>);await waitFor(()=>expect(editor?.state.selection.from).toBe(7));expect(changed).not.toHaveBeenCalled();act(()=>editor.commands.setTextSelection(4));expect(positionChanged).toHaveBeenLastCalledWith({from:4,to:4});expect(changed).not.toHaveBeenCalled();mounted.unmount();});

it('uses the original resource chip for ordinary journey navigation and modified beside opening',async()=>{const openResource=vi.fn(),changed=vi.fn();const mounted=render(<EscapeManagerProvider><NextEditor note={{id:'links',title:'Links',revision:1,content:{type:'doc',content:[{type:'paragraph',content:[{type:'resourceLink',attrs:{resourceId:'target',label:'Target',type:'note'}}]}]}}} documents={new SharedNoteDocuments()} changed={changed} locked={false} pane={0} openResource={openResource}/></EscapeManagerProvider>);const chip=await mounted.findByRole('button',{name:'Open Note · Target'});fireEvent.click(chip);expect(openResource).toHaveBeenLastCalledWith('target',false);fireEvent.click(chip,{ctrlKey:true});expect(openResource).toHaveBeenLastCalledWith('target',true);expect(changed).not.toHaveBeenCalled();mounted.unmount();});
it('reopens contextual formatting when the same text is selected again after Escape',async()=>{
 const documents=new SharedNoteDocuments();let editor!:Editor;const prepare=documents.prepare.bind(documents);vi.spyOn(documents,'prepare').mockImplementation((value,scope)=>{editor=value;prepare(value,scope);});
 const note={id:'reselect',title:'Reselect',revision:1,content:{type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'Hello world'}]}]}};
 const mounted=render(<EscapeManagerProvider><div className="next-document"><div className="next-note-bar"/><NextEditor note={note} documents={documents} changed={()=>{}} locked={false} pane={0}/></div></EscapeManagerProvider>);await waitFor(()=>expect(editor?.isInitialized).toBe(true));act(()=>{editor.view.focus();editor.commands.setTextSelection({from:1,to:6});});await waitFor(()=>expect(mounted.container.querySelector('[data-selection=true]')).toBeTruthy());fireEvent.keyDown(document,{key:'Escape'});await waitFor(()=>expect(mounted.container.querySelector('[data-selection=true]')).toBeNull());act(()=>{editor.commands.setTextSelection(3);editor.commands.setTextSelection({from:1,to:6});});await waitFor(()=>expect(mounted.container.querySelector('[data-selection=true]')).toBeTruthy());mounted.unmount();
});
