import {invoke} from '@tauri-apps/api/core';
import {listen} from '@tauri-apps/api/event';
import {useSyncExternalStore} from 'react';
export type Task={id:string;kind:string;title:string;workspace:string;state:'queued'|'running'|'completed'|'failed'|'cancelled'|'interrupted';phase:string;done:number;total:number|null;bytes:number;totalBytes:number|null;started:number|null;finished:number|null;result:Record<string,unknown>|null;error:string|null;cancellable:boolean};
export type TransferAction={op:'files'|'folder'|'export'|'archive'|'restore'|'new'|'open';ids?:string[];paths?:string[];path?:string};
export function transfer<T>(request:Record<string,unknown>):Promise<T>{return invoke<T>('transfer',{request});}
let tasks:Task[]=[],consumers=0,epoch=0,stop:(()=>void)|undefined;
const listeners=new Set<()=>void>();
function publish(value:Task[]){tasks=value;for(const fn of listeners)fn();}
function subscribe(fn:()=>void){listeners.add(fn);consumers++;if(consumers===1){const generation=++epoch;void listen<Task[]>('next-activity',event=>{if(generation===epoch)publish(event.payload);}).then(async remove=>{if(generation!==epoch){remove();return;}stop=remove;const before=tasks;const initial=await transfer<Task[]>({op:'tasks'});if(generation===epoch&&tasks===before)publish(initial);}).catch(()=>{});}return()=>{listeners.delete(fn);if(--consumers===0){epoch++;stop?.();stop=undefined;}};}
export function useTasks(){return useSyncExternalStore(subscribe,()=>tasks);}
export function showTransfer(action:TransferAction){window.dispatchEvent(new CustomEvent('vaultor-next-transfer',{detail:action}));}
export const formatBytes=(bytes:number)=>bytes<1048576?`${(bytes/1024).toFixed(1)} KiB`:`${(bytes/1048576).toFixed(1)} MiB`;
