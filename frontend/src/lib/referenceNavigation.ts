import type {Editor} from '@tiptap/core';
import {NodeSelection,TextSelection} from '@tiptap/pm/state';
import {getConnection} from './platform';

const views=new Map<string,{noteId:string;editor:Editor}>();
/** Paths are saved document child indices, validated against the current revision and target. */
export function focusReference(editor:Editor,path:string,targetId:string) {
 const indices=path.split('/').filter(Boolean);let node=editor.state.doc,position=-1;
 for(const index of indices){if(!/^\d+$/.test(index)||Number(index)>=node.childCount)return false;const childIndex=Number(index);position+=1;for(let i=0;i<childIndex;i++)position+=node.child(i).nodeSize;node=node.child(childIndex);}
 if(!['resourceLink','image'].includes(node.type.name)||node.attrs.resourceId!==targetId||position<0)return false;
 const selection=node.type.spec.selectable!==false?NodeSelection.create(editor.state.doc,position):TextSelection.near(editor.state.doc.resolve(position));
 editor.view.dispatch(editor.state.tr.setSelection(selection).scrollIntoView());editor.commands.focus(undefined,{scrollIntoView:false});return true;
}
export function registerReferenceView(paneId:string,noteId:string,editor:Editor){views.set(paneId,{noteId,editor});return()=>{if(views.get(paneId)?.editor===editor)views.delete(paneId);};}
export async function revealReference(paneId:string,noteId:string,path:string,targetId:string) {
 const epoch=getConnection().epoch;
 for(let attempt=0;attempt<8;attempt++){const view=views.get(paneId);if(getConnection().epoch!==epoch)return false;if(view?.noteId===noteId&&!view.editor.isDestroyed)return focusReference(view.editor,path,targetId);await new Promise(resolve=>setTimeout(resolve,25));}
 return false;
}
