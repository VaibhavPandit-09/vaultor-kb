import type {Resource} from '../types';
import type {Editor} from '@tiptap/core';
import api from './api';
import {getPlatform} from './platform';
import {boundedResources,changeMembership,commandConfig,commandScope,requireCommandScope} from './resourceBatchCommands';
import {organizationChanged} from './organization';
import {captureImportTarget} from './importTarget';
import {insertDroppedLinks} from './editorDrop';
let pasting=false;
export async function copyResources(resources:Resource[],mode:'copy'|'cut'|'links'='copy',collection?:string){boundedResources(resources);const clipboard=getPlatform().resourceClipboard;if(!clipboard)throw Error('Resource clipboard is available in Vaultor Desktop.');if(mode==='cut'&&!collection)throw Error('Cut is available in collection contents. It removes only that collection membership after pasting elsewhere.');return clipboard.copy(resources.map(resource=>resource.id),mode,collection);}
export async function pasteResources(collection:string){if(pasting)throw Error('Wait for the current paste.');pasting=true;try{const clipboard=getPlatform().resourceClipboard;if(!clipboard)throw Error('Resource clipboard is unavailable.');const scope=commandScope(),data=await clipboard.read();requireCommandScope(scope);if(!data)throw Error('Copy resources in Vaultor before pasting into a collection.');const ids=data.resources.map(resource=>resource.id);if(data.mode==='cut'){if(!data.collection||data.collection===collection)throw Error('Paste a cut selection into a different collection.');await api.post('/organization/membership-moves',{resourceIds:ids,sourceId:data.collection,targetId:collection},commandConfig({...scope,generation:data.generation}));requireCommandScope(scope);organizationChanged('collection',ids);await clipboard.consume(data.receipt);}else await changeMembership(ids,'collection',collection,'add',{...scope,generation:data.generation});return ids.length;}finally{pasting=false;}}
/** Only native resource-copy HTML is intercepted. Ordinary text/editor clipboard behavior is unchanged. */
export function pasteResourceLinks(editor:Editor,event:ClipboardEvent,managed:boolean,onError:(error:unknown)=>void){
 if(!/data-vaultor-clipboard=["'][a-f0-9-]{36}["']/i.test(event.clipboardData?.getData('text/html')??'')||!getPlatform().resourceClipboard)return false;
 event.preventDefault();if(!managed||!editor.isEditable){onError(new Error('Resource links require an editable Vaultor note.'));return true;}
 const scope=commandScope(),target=captureImportTarget(editor,{from:editor.state.selection.from,to:editor.state.selection.to}),clipboard=getPlatform().resourceClipboard!;
 void clipboard.read().then(data=>{requireCommandScope(scope);if(!data)throw Error('Resource clipboard changed. Copy the resources again.');if(data.mode==='cut')throw Error('Paste cut selections into a collection. Use Copy resource links for notes.');insertDroppedLinks(target,data.resources);}).catch(onError).finally(target.dispose);return true;
}
