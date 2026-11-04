// @vitest-environment jsdom
import {Editor} from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import {afterEach,expect,it,vi} from 'vitest';
import {ResourceLinkExtension} from '../components/editor/ResourceLinkExtension';
import {EditorDropCaret,canInsertDrop,captureEditorDrop,editorDropTarget,insertDroppedLinks,registerEditorDrop} from './editorDrop';
import type {Resource} from '../types';
const resource={id:'original-id',title:'Source',type:'linked',tags:[],createdAt:'',updatedAt:''} as Resource;
let editor:Editor;
afterEach(()=>{editor?.destroy();vi.restoreAllMocks();});
async function setup(){editor=new Editor({element:document.createElement('div'),extensions:[StarterKit,ResourceLinkExtension.extend({addNodeView(){return null;}})],content:'<p>abcd</p>'});const adapter={editor,managed:true,resource};vi.spyOn(editor.view,'posAtCoords').mockReturnValue({pos:3,inside:0});await new Promise(resolve=>setTimeout(resolve,0));return adapter;}
it('inserts existing identities at a mapped pointer anchor, with a separate normal undo/redo step',async()=>{
 const adapter=await setup(),target=captureEditorDrop(adapter,10,20);
 editor.commands.insertContentAt(1,'X');
 insertDroppedLinks(target,[resource,{...resource,id:'file-id',type:'file'}]);
 const content=editor.getJSON().content![0].content!;
 expect(content[0]).toMatchObject({text:'Xab'});expect(content.filter(node=>node.type==='resourceLink')).toMatchObject([{attrs:{resourceId:'original-id'}},{attrs:{resourceId:'file-id'}}]);expect(content.at(-1)).toMatchObject({text:' cd'});
 expect(editor.commands.undo()).toBe(true);expect(editor.getText()).toBe('Xabcd');expect(editor.commands.redo()).toBe(true);expect(editor.getJSON().content![0].content!.filter(node=>node.type==='resourceLink')).toHaveLength(2);
});
it('refuses read-only, external Markdown, invalid pointer positions and trashed resources',async()=>{
 const adapter=await setup();expect(canInsertDrop({...adapter,managed:false})).toBe(false);editor.setEditable(false);expect(()=>captureEditorDrop(adapter,0,0)).toThrow('editable');editor.setEditable(true);vi.mocked(editor.view.posAtCoords).mockReturnValue(null);expect(()=>captureEditorDrop(adapter,0,0)).toThrow('inside');vi.mocked(editor.view.posAtCoords).mockReturnValue({pos:3,inside:0});const target=captureEditorDrop(adapter,0,0);expect(()=>insertDroppedLinks(target,[{...resource,trashedAt:'today'}])).toThrow();target.dispose();expect(editor.getText()).toBe('abcd');
});
it('registry cleanup cannot remove a replacement registration and pending insertion refuses a closed/locked editor',async()=>{
 const adapter=await setup(),remove=registerEditorDrop(adapter);const next={...adapter};const cleanup=registerEditorDrop(next);remove();expect(editorDropTarget(editor.view.dom)).toBe(next);cleanup();expect(editorDropTarget(editor.view.dom)).toBeUndefined();const target=captureEditorDrop(adapter,0,0);editor.setEditable(false);expect(()=>target.insert([{type:'text',text:'bad'}])).toThrow();target.dispose();
});


it('renders the pointer caret without moving selection or editing, and clears on cancellation/read-only',async()=>{
 const adapter=await setup(),caret=new EditorDropCaret();document.body.append(editor.view.dom);let frame:FrameRequestCallback|undefined;
 vi.stubGlobal('requestAnimationFrame',(callback:FrameRequestCallback)=>{frame=callback;return 1;});vi.stubGlobal('cancelAnimationFrame',vi.fn());vi.spyOn(editor.view,'coordsAtPos').mockReturnValue({left:45,right:45,top:60,bottom:84});const before=editor.getJSON(),selection=editor.state.selection;
 try{caret.show(adapter,40,65);frame?.(0);const marker=document.querySelector<HTMLElement>('.resource-drop-caret');expect(marker?.style.left).toBe('45px');expect(marker?.style.top).toBe('60px');expect(marker?.style.height).toBe('24px');expect(editor.getJSON()).toEqual(before);expect(editor.state.selection).toBe(selection);caret.clear();expect(document.querySelector('.resource-drop-caret')).toBeNull();caret.show(adapter,40,65);editor.setEditable(false);frame?.(0);expect(document.querySelector('.resource-drop-caret')).toBeNull();}finally{caret.clear();editor.view.dom.remove();vi.unstubAllGlobals();}
});
