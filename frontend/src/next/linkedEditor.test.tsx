// @vitest-environment jsdom
import {act,render,waitFor,cleanup} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
import type {Editor} from '@tiptap/core';
import {EscapeManagerProvider} from '../lib/escape/EscapeManagerProvider';
import {SharedNoteDocuments} from '../lib/sharedNoteDocuments';
import NextEditor from './NextEditor';
afterEach(cleanup);
it('preserves Markdown link titles and shares a linked document across two views without competing edits',async()=>{
 const documents=new SharedNoteDocuments(),editors:Editor[]=[],first=vi.fn(),second=vi.fn();const prepare=documents.prepare.bind(documents);vi.spyOn(documents,'prepare').mockImplementation((editor,scope)=>{editors.push(editor);prepare(editor,scope);});
 const note={id:'linked:source',title:'source.md',revision:0,content:{type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'reference',marks:[{type:'link',attrs:{href:'other.md',title:'Original title'}}]}]}]}};
 render(<EscapeManagerProvider><NextEditor pane={0} note={note} documents={documents} changed={first} locked={false} followLink={()=>{}}/><NextEditor pane={1} note={note} documents={documents} changed={second} locked={false} followLink={()=>{}}/></EscapeManagerProvider>);await waitFor(()=>expect(editors.length).toBe(2));expect(document.querySelectorAll('[aria-label="Note formatting"]').length).toBe(2);expect(document.querySelector('[aria-label="Insert resource link"],[aria-label=Underline]')).toBeNull();expect(editors[0].getJSON().content?.[0].content?.[0].marks?.[0].attrs?.title).toBe('Original title');act(()=>{editors[0].commands.insertContent('draft ');});expect(first).toHaveBeenCalledTimes(1);expect(second).not.toHaveBeenCalled();expect(editors[1].getText()).toBe(editors[0].getText());
});

it('keeps linked-first and managed schemas separate without breaking either view',async()=>{const documents=new SharedNoteDocuments(),editors:Editor[]=[],prepare=documents.prepare.bind(documents);vi.spyOn(documents,'prepare').mockImplementation((editor,scope)=>{editors.push(editor);prepare(editor,scope);});const content={type:'doc',content:[{type:'paragraph'}]};const mounted=render(<EscapeManagerProvider><NextEditor pane={0} note={{id:'linked',title:'Linked',revision:0,content}} documents={documents} changed={()=>{}} locked={false} followLink={()=>{}}/><NextEditor pane={1} note={{id:'managed',title:'Managed',revision:0,content}} documents={documents} changed={()=>{}} locked={false}/></EscapeManagerProvider>);await waitFor(()=>expect(editors.every(e=>e.isInitialized)).toBe(true));expect(editors).toHaveLength(2);expect(editors[0].schema).not.toBe(editors[1].schema);expect(editors[0].schema.nodes.image).toBeUndefined();expect(editors[1].schema.nodes.image).toBeTruthy();act(()=>{editors[1].commands.insertContent('managed content');});expect(editors[0].getText()).toBe('');expect(editors[1].getText()).toBe('managed content');mounted.unmount();});
