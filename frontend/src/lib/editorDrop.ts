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

/** Pointer-only feedback: no selection/document transactions and no editor ownership. */
export class EditorDropCaret {
 private element:HTMLDivElement|null=null;
 private frame:number|null=null;
 private point:{target:EditorDropTarget;x:number;y:number}|null=null;
 show(target:EditorDropTarget,x:number,y:number){this.point={target,x,y};this.refresh();}
 refresh(){if(!this.point||this.frame!==null)return;this.frame=requestAnimationFrame(()=>{this.frame=null;const point=this.point;if(!point||!canInsertDrop(point.target)||!point.target.editor.view.dom.isConnected){this.clear();return;}const position=point.target.editor.view.posAtCoords({left:point.x,top:point.y})?.pos;if(position===undefined){this.clear();return;}const rect=point.target.editor.view.coordsAtPos(position);if(!this.element){this.element=document.createElement('div');this.element.className='resource-drop-caret';this.element.setAttribute('aria-hidden','true');document.body.append(this.element);}Object.assign(this.element.style,{left:rect.left+'px',top:rect.top+'px',height:Math.max(14,rect.bottom-rect.top)+'px'});});}
 clear(){if(this.frame!==null)cancelAnimationFrame(this.frame);this.frame=null;this.point=null;this.element?.remove();this.element=null;}
}
