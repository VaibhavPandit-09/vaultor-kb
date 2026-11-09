// @vitest-environment jsdom
import { act, render, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import type { Editor } from '@tiptap/core';
import { EscapeManagerProvider } from '../lib/escape/EscapeManagerProvider';
import { SharedNoteDocuments } from '../lib/sharedNoteDocuments';
import NextEditor from './NextEditor';
it('journals document edits but does not treat locking and selection as edits',async()=>{
  const documents=new SharedNoteDocuments(),changed=vi.fn();let editor!:Editor;
  const prepare=documents.prepare.bind(documents);
  vi.spyOn(documents,'prepare').mockImplementation(value=>{editor=value;prepare(value);});
  const note={id:'a',title:'A',revision:1,content:{type:'doc',content:[{type:'paragraph'}]}};
  const view=(locked:boolean)=><EscapeManagerProvider><NextEditor note={note} documents={documents} changed={changed} locked={locked} pane={0}/></EscapeManagerProvider>;
  const mounted=render(view(false));await waitFor(()=>expect(editor?.isInitialized).toBe(true));
  expect(changed).not.toHaveBeenCalled();
  act(()=>{editor.commands.insertContent('actual edit');});expect(changed).toHaveBeenCalledTimes(1);
  mounted.rerender(view(true));await waitFor(()=>expect(editor.isEditable).toBe(false));
  const protectedContent=editor.getJSON();act(()=>{editor.commands.insertContent('must not change a locked document');});expect(editor.getJSON()).toEqual(protectedContent);expect(changed).toHaveBeenCalledTimes(1);
  mounted.rerender(view(false));await waitFor(()=>expect(editor.isEditable).toBe(true));
  act(()=>{editor.commands.setTextSelection(1);});expect(changed).toHaveBeenCalledTimes(1);
  mounted.unmount();
});
