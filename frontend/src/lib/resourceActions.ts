import {copyResources} from './resourceClipboard';
import type { Resource } from '../types';
import { getConnection } from './platform';
import { resourceKind } from './resourceKinds';
import { setResourceFavorite } from './resourceBrowse';
import { getPlatform, saveApiFile } from './platform';
import { Copy, Download, ExternalLink, Pencil, Pin, Trash2, Network, Columns2 } from 'lucide-react';
export type ResourceAction = 'export-copy'|'open'|'open-another'|'references'|'reference-open'|'rename'|'export'|'prepare-export'|'trash'|'prepare-trash'|'retain-draft'|'removed'|'restored';
/** Small resource command catalogue; coordinators continue to own safety/confirmation. */
export const resourceCommands = {
 'copy-resources':{title:'Copy resource',icon:Copy,confirmation:'none'},
 'copy-links':{title:'Copy resource link',icon:Copy,confirmation:'none'},
 'reveal-copy':{title:'Reveal exported copy…',icon:ExternalLink,confirmation:'review'},
 'open-copy':{title:'Open exported copy in default app…',icon:ExternalLink,confirmation:'review'},
 'export-copy':{title:'Export copy for Explorer…',icon:Download,confirmation:'review'},
 open: { title:'Open', icon:ExternalLink, confirmation:'none' },
 'open-another': { title:'Open in another pane', icon:Columns2, confirmation:'none' },
 references: { title:'Links and mentions…', icon:Network, confirmation:'none' },
 rename: { title:'Rename…', icon:Pencil, confirmation:'input' },
 export: { title:'Export note…', icon:Download, confirmation:'review' },
 trash: { title:'Move to Trash…', icon:Trash2, confirmation:'lifecycle', destructive:true },
 pin: { title:'Pin', icon:Pin, confirmation:'none' },
 download: { title:'Download original', icon:Download, confirmation:'destination' },
 'copy-title': { title:'Copy title', icon:Copy, confirmation:'none' },
} as const;
export type ResourceCommandId = keyof typeof resourceCommands;
export function resourceCommandEnabled(id:ResourceCommandId,resource:Resource) {
 if(resource.trashedAt)return false;
 if(id==='copy-resources'||id==='copy-links')return Boolean(getPlatform().resourceClipboard);
 // Presentation eligibility mirrors the existing native default-open types; main revalidates the prepared filename and authority.
 if(id==='open-copy'&&!/\.(pdf|png|jpe?g|gif|webp|txt|md|csv|tsv|docx|xlsx|pptx|mp3|mp4)$/i.test(resource.title))return false;
 if(id==='export-copy'||id==='reveal-copy'||id==='open-copy')return resource.type==='file'&&Boolean(getPlatform().prepareExportCopy);
 const capabilities=supportedResourceActions(resource);
 return id==='open-another'?resourceKind(resource.type).mode==='editor':id==='copy-title'||id==='references'?true:capabilities[id];
}
export async function executeResourceCommand(id:ResourceCommandId,resource:Resource,value?:string) {
 if(!resourceCommandEnabled(id,resource))throw new Error('This action is unavailable for this resource.');
 if(id==='copy-resources'||id==='copy-links'){await copyResources([resource],id==='copy-links'?'links':'copy');return;}
 if(id==='reveal-copy'||id==='open-copy'){await requestResourceAction('export-copy',[resource],id==='reveal-copy'?'reveal':'open');return;}
 if(id==='pin'){await setResourceFavorite(resource.id,value===undefined?!resource.favorite:value==='true');return;}
 if(id==='copy-title'){await getPlatform().writeClipboard(resource.title);return;}
 if(id==='download'){if(await saveApiFile('/resources/'+resource.id+'/raw',resource.title)==='cancelled')throw new Error('Download cancelled. Try again.');return;}
 await requestResourceAction(id,[resource],value);
}
export type ActionRequest = {action:ResourceAction;resources:Resource[];value?:string;epoch:number;resolve:()=>void;reject:(error:unknown)=>void};
export const RESOURCE_ACTION_EVENT='vaultor:resource-action';
export function requestResourceAction(action:ResourceAction,resources:Resource[],value?:string):Promise<void> {
 return new Promise((resolve,reject)=>{const event=new CustomEvent<ActionRequest>(RESOURCE_ACTION_EVENT,{cancelable:true,detail:{action,resources,value,epoch:getConnection().epoch,resolve,reject}});window.dispatchEvent(event);if(!event.defaultPrevented)reject(new Error('Resource actions are unavailable in this view.'));});
}
export function supportedResourceActions(resource:Resource) {
 const mode=resourceKind(resource.type).mode;
 return {open:mode!=='unsupported',export:mode==='editor'&&resource.type!=='linked',download:mode==='preview',rename:mode!=='unsupported'&&resource.type!=='linked',organize:true,pin:true,trash:true};
}
