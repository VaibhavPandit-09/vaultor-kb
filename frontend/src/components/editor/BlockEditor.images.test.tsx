// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import BlockEditor from './BlockEditor';
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
