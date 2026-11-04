// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import BlockEditor from './BlockEditor';
import {EscapeManagerProvider} from '../../lib/escape/EscapeManagerProvider';
import { SharedNoteDocuments } from '../../lib/sharedNoteDocuments';
afterEach(cleanup);
function mount(content: object) {
 const update = vi.fn();
 const result = render(<BlockEditor paneId="pane" sharedDocuments={new SharedNoteDocuments()} noteId="schema-check" noteTitle="Schema" saveStatus="saved" onRetrySave={()=>{}} content={content} autosaveDelay={0} isActive={false} interactionLocked={false} shouldRestoreFocus={false} onOpenResource={()=>{}} onUpdate={update} onSelectionChange={()=>{}} onActivate={()=>{}} onFocusRestored={()=>{}} onRequestMdUpload={()=>{}} onRequestCsvUpload={()=>{}} onRequestLinkUpload={()=>{}} />);
 return {...result,update};
}
it('opens an existing empty document without treating it as unsupported or autosaving it', async()=>{
 const view=mount({type:'doc',content:[]});
 await waitFor(()=>expect(view.container.querySelector('.tiptap')).not.toBeNull());
 expect(screen.queryByRole('alert')).toBeNull();expect(view.update).not.toHaveBeenCalled();
});
it('retains unknown document content in a safe state without stripping and autosaving',async()=>{
 const content={type:'doc',content:[{type:'futureBlock',attrs:{source:'keep'}}]};const view=mount(content);
 await waitFor(()=>expect(screen.getByRole('alert')).toBeTruthy());
 expect(view.container.querySelector('.tiptap')).toBeNull();expect(view.update).not.toHaveBeenCalled();expect(content.content[0].attrs.source).toBe('keep');
});

it('keeps an unfocused dropped link and its undo history across an unrelated render of the same saved snapshot',async()=>{
 const {act}=await import('@testing-library/react');const {insertDroppedLinks}=await import('../../lib/editorDrop');const {captureImportTarget}=await import('../../lib/importTarget');
 const content={type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'Original'}]}]},shared=new SharedNoteDocuments(),update=vi.fn();
 const view=(title:string)=><EscapeManagerProvider><BlockEditor paneId="pane" sharedDocuments={shared} noteId="drop-check" noteTitle={title} saveStatus="saved" onRetrySave={()=>{}} content={structuredClone(content)} autosaveDelay={0} isActive={false} interactionLocked={false} shouldRestoreFocus={false} onOpenResource={()=>{}} onUpdate={update} onSelectionChange={()=>{}} onActivate={()=>{}} onFocusRestored={()=>{}} onRequestMdUpload={()=>{}} onRequestCsvUpload={()=>{}} onRequestLinkUpload={()=>{}}/></EscapeManagerProvider>;
 const result=render(view('Before'));await waitFor(()=>expect(result.container.querySelector('.tiptap')).not.toBeNull());const editor=(result.container.querySelector('.tiptap') as HTMLElement&{editor:import('@tiptap/core').Editor}).editor;await waitFor(()=>expect(editor.isInitialized).toBe(true));
 await act(async()=>{insertDroppedLinks(captureImportTarget(editor,{from:2,to:2}),[{id:'original-resource',title:'Existing',type:'note',tags:[],createdAt:'',updatedAt:''}]);});await act(async()=>{editor.view.dom.blur();});expect(editor.isFocused).toBe(false);result.rerender(view('After'));
 expect(editor.getJSON().content![0].content!.some(node=>node.type==='resourceLink')).toBe(true);expect(update).toHaveBeenCalled();await act(async()=>{editor.commands.undo();});expect(editor.getText()).toBe('Original');await act(async()=>{editor.commands.redo();});expect(editor.getJSON().content![0].content!.some(node=>node.type==='resourceLink')).toBe(true);
});
