// @vitest-environment jsdom
import { act, render, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import type { Editor } from '@tiptap/core';
import { EscapeManagerProvider } from '../lib/escape/EscapeManagerProvider';
import { SharedNoteDocuments } from '../lib/sharedNoteDocuments';
import NextEditor from './NextEditor';
import {captureImportTarget} from '../lib/importTarget';
it('journals document edits but does not treat locking and selection as edits',async()=>{
  const documents=new SharedNoteDocuments(),changed=vi.fn();let editor!:Editor;
  const prepare=documents.prepare.bind(documents);
  vi.spyOn(documents,'prepare').mockImplementation(value=>{editor=value;prepare(value);});
  const note={id:'a',title:'A',revision:1,content:{type:'doc',content:[{type:'paragraph'}]}};
  const view=(locked:boolean)=><EscapeManagerProvider><NextEditor note={note} documents={documents} changed={changed} locked={locked} pane={0}/></EscapeManagerProvider>;
  const mounted=render(view(false));await waitFor(()=>expect(editor?.isInitialized).toBe(true));
  expect(changed).not.toHaveBeenCalled();
  const target=captureImportTarget(editor,editor.state.selection);act(()=>target.insert([{type:'text',text:'mapped anchor'}]));expect(editor.getText()).toContain('mapped anchor');changed.mockClear();
  act(()=>{editor.commands.insertContent('actual edit');});expect(changed).toHaveBeenCalledTimes(1);
  mounted.rerender(view(true));await waitFor(()=>expect(editor.isEditable).toBe(false));
  const protectedContent=editor.getJSON();act(()=>{editor.commands.insertContent('must not change a locked document');});expect(editor.getJSON()).toEqual(protectedContent);expect(changed).toHaveBeenCalledTimes(1);
  mounted.rerender(view(false));await waitFor(()=>expect(editor.isEditable).toBe(true));
  act(()=>{editor.commands.setTextSelection(1);});expect(changed).toHaveBeenCalledTimes(1);
  mounted.unmount();
});
it('shares rich managed blocks and undo between panes without enabling the linked schema',async()=>{
  const documents=new SharedNoteDocuments(),editors:Editor[]=[];const prepare=documents.prepare.bind(documents);vi.spyOn(documents,'prepare').mockImplementation(value=>{editors.push(value);prepare(value);});
  const note={id:'rich',title:'Rich',revision:1,content:{type:'doc',content:[{type:'paragraph'}]}};
  const mounted=render(<EscapeManagerProvider>{[0,1].map(pane=><NextEditor key={pane} note={note} documents={documents} changed={()=>{}} locked={false} pane={pane}/>)}</EscapeManagerProvider>);
  await waitFor(()=>expect(editors.filter(e=>e.isInitialized)).toHaveLength(2));
  act(()=>{editors[0].commands.insertContent([{type:'paragraph',content:[{type:'resourceLink',attrs:{resourceId:'target',label:'Target',type:'note'}}]},{type:'codeBlock',attrs:{language:'javascript'},content:[{type:'text',text:'const value = 1;'}]}]);});
  expect(editors[1].getJSON()).toEqual(editors[0].getJSON());expect(editors[0].getJSON().content?.some(n=>n.type==='codeBlock')).toBe(true);
  let linkPosition=0;editors[0].state.doc.descendants((node,pos)=>{if(node.type.name==='resourceLink')linkPosition=pos;});act(()=>{editors[0].view.focus();editors[0].commands.setNodeSelection(linkPosition);});expect(mounted.container.querySelector<HTMLElement>('.next-editor-tools')?.dataset.selection).toBe('false');
  act(()=>{editors[0].commands.insertTable({rows:2,cols:2,withHeaderRow:true});editors[0].commands.addColumnAfter();});expect(editors[1].getJSON()).toEqual(editors[0].getJSON());
  mounted.unmount();
});
