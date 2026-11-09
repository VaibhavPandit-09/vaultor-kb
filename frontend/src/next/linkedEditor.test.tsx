// @vitest-environment jsdom
import {act,render,waitFor,cleanup} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
import type {Editor} from '@tiptap/core';
import {EscapeManagerProvider} from '../lib/escape/EscapeManagerProvider';
import {SharedNoteDocuments} from '../lib/sharedNoteDocuments';
import NextEditor from './NextEditor';
afterEach(cleanup);
it('preserves Markdown link titles and shares a linked document across two views without competing edits',async()=>{
 const documents=new SharedNoteDocuments(),editors:Editor[]=[],first=vi.fn(),second=vi.fn();const prepare=documents.prepare.bind(documents);vi.spyOn(documents,'prepare').mockImplementation(editor=>{editors.push(editor);prepare(editor);});
 const note={id:'linked:source',title:'source.md',revision:0,content:{type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'reference',marks:[{type:'link',attrs:{href:'other.md',title:'Original title'}}]}]}]}};
 render(<EscapeManagerProvider><NextEditor pane={0} note={note} documents={documents} changed={first} locked={false}/><NextEditor pane={1} note={note} documents={documents} changed={second} locked={false}/></EscapeManagerProvider>);await waitFor(()=>expect(editors.length).toBe(2));expect(editors[0].getJSON().content?.[0].content?.[0].marks?.[0].attrs?.title).toBe('Original title');act(()=>{editors[0].commands.insertContent('draft ');});expect(first).toHaveBeenCalledTimes(1);expect(second).not.toHaveBeenCalled();expect(editors[1].getText()).toBe(editors[0].getText());
});
