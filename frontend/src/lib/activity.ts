import { useSyncExternalStore } from 'react';
import api from './api';
import { reportError } from './diagnostics';
import { blockConnectionSwitch } from './desktop';
import { getConnection } from './platform';
import { IndexedSessionStore, type Identity } from './sessionStore';

export type ActivityTask = { id:string; title:string; workspace:Identity; source:string; epoch:number; kind:string; state:'running'|'paused'|'attention'|'complete'; phase:string; done?:number; total?:number; unit?:string;detail?:string; warnings?:number; receipt?:string; exportSelection?:string[]; output?:{path:string;filename:string}; updated:number };
export type TaskContext = { update(patch:Partial<Pick<ActivityTask,'phase'|'done'|'total'|'unit'|'detail'|'warnings'|'receipt'|'output'>>):void; paused():boolean; check():Promise<void> };
type Runner=(context:TaskContext)=>Promise<boolean>;
let tasks:ActivityTask[]=[];
const listeners=new Set<()=>void>(), runners=new Map<string,Runner>(), pauses=new Set<string>();
const adapters=new Map<string,(task:ActivityTask)=>Runner>();
const stores=new Map<string,IndexedSessionStore>();
let admitting=false;
export function registerActivityAdapter(kind:string,adapter:(task:ActivityTask)=>Runner){adapters.set(kind,adapter);}
let writing=Promise.resolve();
const key=(task:ActivityTask)=>`activity:${task.workspace.id}:${task.workspace.generation}:${task.id}`;
const emit=()=>listeners.forEach(listener=>listener());
function change(id:string,patch:Partial<ActivityTask>) {
 tasks=tasks.map(task=>task.id===id?{...task,...patch,updated:Date.now()}:task);emit();
 const task=tasks.find(task=>task.id===id);
 if(task){const store=stores.get(task.id);if(store){writing=writing.catch(()=>{}).then(()=>store.put(key(task),task));void writing.catch(error=>reportError('activity.storage',error));}}
}
export function useActivity(){return useSyncExternalStore(callback=>{listeners.add(callback);return()=>listeners.delete(callback);},()=>tasks);}
export const activityTasks=()=>tasks;
export function approveActivityPreview(receipt:string,phase='Reviewed and approved'){for(const task of tasks)if(task.kind==='workspace-preview'&&task.receipt===receipt&&task.source===getConnection().profileId&&task.state!=='running'){change(task.id,{state:'complete',phase});runners.delete(task.id);}}
export async function restoreActivity(identity:Identity) {
 const source=getConnection().profileId,epoch=getConnection().epoch;
 const store=new IndexedSessionStore(),saved=await store.values<ActivityTask>(`activity:${identity.id}:${identity.generation}:`);
 if(epoch!==getConnection().epoch)return;
 for(const task of saved)if(task&&typeof task.id==='string'&&typeof task.title==='string'&&typeof task.kind==='string'&&['running','paused','attention','complete'].includes(task.state)&&task.workspace?.id===identity.id&&task.workspace.generation===identity.generation&&task.source===source&&!tasks.some(value=>value.id===task.id)){stores.set(task.id,store);tasks=[...tasks,{...task,epoch,state:task.state==='running'?'paused':task.state,phase:task.state==='running'?'Interrupted — review receipt or reselect original source':task.phase}];}
 emit();
}
/** Admission is source-scoped. Browsing and editing never join this write queue. */
export async function startActivity(input:Omit<ActivityTask,'state'|'updated'|'source'|'epoch'>,runner:Runner) {
 const connection=getConnection();
 if(admitting)throw Error('Another task is being admitted. Retry after it appears in Activity.');
 if(tasks.some(task=>task.state==='running'&&task.source===connection.profileId))throw Error('Finish or pause the current Activity task before starting another workspace operation.');
 const existing=tasks.find(task=>task.id===input.id);
 if(existing&&existing.state==='running')throw Error('This task is already running in Activity.');
 const task:ActivityTask={...input,source:connection.profileId,epoch:connection.epoch,state:'paused',updated:Date.now()};
 admitting=true;const store=new IndexedSessionStore();
 try{await store.put(key(task),task);}finally{admitting=false;} // No dispatch without a durable identity.
 if(connection.epoch!==getConnection().epoch)throw Error('Connection changed before task dispatch. The retained task needs review.');
 stores.set(task.id,store);
 tasks=[task,...tasks.filter(value=>value.id!==task.id)];runners.set(task.id,runner);emit();void resumeActivity(task.id);
}
export function pauseActivity(id:string){pauses.add(id);change(id,{phase:'Pausing after the current request…'});}
export async function resumeActivity(id:string) {
 const task=tasks.find(value=>value.id===id),connection=getConnection();
 const runner=runners.get(id)??(task?adapters.get(task.kind)?.(task):undefined);
 if(!task||task.state==='running')return;
 if(!runner){change(id,{state:'paused',phase:'Reselect original source to resume',detail:'Retained IDs and host receipts must be reviewed before continuing.'});return;}
 if(task.epoch!==connection.epoch||task.source!==connection.profileId){change(id,{state:'attention',phase:'Return to the original connection and review this task'});return;}
 if(tasks.some(value=>value.state==='running'&&value.source===connection.profileId))return;
 pauses.delete(id);change(id,{state:'running'});
 const release=blockConnectionSwitch('Activity task');
 const context:TaskContext={update:patch=>change(id,patch),paused:()=>pauses.has(id),check:async()=>{
  if(task.epoch!==getConnection().epoch)throw Error('Connection changed; task retained in the original workspace.');
  const {data}=await api.get<Identity>('/workspace/identity',{connectionEpoch:task.epoch,onWorkspaceBusy:()=>change(id,{phase:'Waiting for workspace access'})});
  if(data.id!==task.workspace.id||data.generation!==task.workspace.generation)throw Error('Workspace generation changed; task cannot continue.');
 }};
 try{await context.check();const complete=await runner(context);change(id,{state:complete?'complete':pauses.has(id)?'paused':'attention',...(!complete&&pauses.has(id)?{phase:'Paused — completed work retained'}:{})});if(complete){runners.delete(id);pauses.delete(id);}}
 catch(error){change(id,{state:'attention',phase:'Needs attention',detail:error instanceof Error?error.message:String(error)});reportError('activity.'+task.kind,error);}
 finally{release();}
}
export async function dismissActivity(id:string){const task=tasks.find(value=>value.id===id);if(!task||task.state!=='complete')return;await writing;await new IndexedSessionStore().delete(key(task));tasks=tasks.filter(value=>value.id!==id);runners.delete(id);emit();}
