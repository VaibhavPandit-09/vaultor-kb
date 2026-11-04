import type { Editor } from '@tiptap/core';
import { captureImportTarget, type ImportTarget } from './importTarget';
import type { Resource } from '../types';
import { resourceKind } from './resourceKinds';

export type EditorDropTarget={editor:Editor;managed:boolean;resource:Resource;importFile?:(editor:Editor,position:number,files:File[])=>void};
const editors=new WeakMap<HTMLElement,EditorDropTarget>();
export function registerEditorDrop(target:EditorDropTarget){const element=target.editor.view.dom;editors.set(element,target);return()=>{if(editors.get(element)===target)editors.delete(element);};}
export function editorDropTarget(node:EventTarget|null){const element=node instanceof Element?node.closest<HTMLElement>('.ProseMirror'):null;return element?editors.get(element):undefined;}
export function canInsertDrop(target:EditorDropTarget|undefined){return Boolean(target?.managed&&!target.editor.isDestroyed&&target.editor.isEditable);}
export function captureEditorDrop(target:EditorDropTarget,x:number,y:number):ImportTarget{
 if(!canInsertDrop(target))throw new Error('Resource links require an editable Vaultor note.');
 const position=target.editor.view.posAtCoords({left:x,top:y})?.pos;
 if(position===undefined)throw new Error('Drop inside the editable document.');
 return captureImportTarget(target.editor,{from:position,to:position});
}
export function insertDroppedLinks(target:ImportTarget,resources:Resource[]){
 if(!target.editor.isEditable||!resources.length||resources.length>100||resources.some(resource=>resource.trashedAt||resourceKind(resource.type).mode==='unsupported'))throw new Error('These resources cannot be linked into this note.');
 target.assertValid();
 target.insert(resources.flatMap(resource=>[{type:'resourceLink',attrs:{resourceId:resource.id,label:resource.title,type:resource.type}},{type:'text',text:' '}]));
 target.editor.view.focus();
}
