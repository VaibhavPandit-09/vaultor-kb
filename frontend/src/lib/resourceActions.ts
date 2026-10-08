import type { Resource } from '../types';
import { getConnection } from './platform';
import { resourceKind } from './resourceKinds';
export type ResourceAction = 'open'|'references'|'reference-open'|'rename'|'export'|'trash'|'prepare-trash'|'retain-draft'|'removed'|'restored';
export type ActionRequest = {action:ResourceAction;resources:Resource[];value?:string;epoch:number;resolve:()=>void;reject:(error:unknown)=>void};
export const RESOURCE_ACTION_EVENT='vaultor:resource-action';
export function requestResourceAction(action:ResourceAction,resources:Resource[],value?:string):Promise<void> {
 return new Promise((resolve,reject)=>{const event=new CustomEvent<ActionRequest>(RESOURCE_ACTION_EVENT,{cancelable:true,detail:{action,resources,value,epoch:getConnection().epoch,resolve,reject}});window.dispatchEvent(event);if(!event.defaultPrevented)reject(new Error('Resource actions are unavailable in this view.'));});
}
export function supportedResourceActions(resource:Resource) {
 const mode=resourceKind(resource.type).mode;
 return {open:mode!=='unsupported',export:mode==='editor',download:mode==='preview',rename:mode!=='unsupported',organize:true,pin:true,trash:true};
}
