import api from './api';
import { registerActivityAdapter,startActivity,type ActivityTask,type TaskContext } from './activity';
import { getConnection } from './platform';
import type { Identity } from './sessionStore';
import { resourcesChanged } from './resourceBrowse';
export type TrashSnapshot={id:string;generation:string;total:number;done:number;pending:number;sources:number;confirmed:boolean;failures:{resourceId:string;status:string;detail:string}[]};
function purgeRunner(task:Pick<ActivityTask,'receipt'|'workspace'|'epoch'|'total'>){return async(context:TaskContext)=>{
 const config={connectionEpoch:task.epoch,headers:{'X-Vaultor-Generation':task.workspace.generation},onWorkspaceBusy:()=>context.update({phase:'Waiting for workspace access'})};
 const path='/resources/trash/snapshots/'+task.receipt;
 let status=(await api.get<TrashSnapshot>(path,config)).data;
 if(!status.confirmed){if(task.total!==status.total)throw Error('The retained approval does not match this Trash snapshot. Review it again.');status=(await api.post<TrashSnapshot>(path+'/confirm',{generation:task.workspace.generation,count:task.total},config)).data;}
 while(status.pending>0&&!context.paused()){
  await context.check();context.update({phase:'Deleting Trash items',done:status.done,total:status.total});
  const before=status.done;status=(await api.post<TrashSnapshot>(path+'/step',undefined,config)).data;
  resourcesChanged();context.update({done:status.done,warnings:status.failures.length,detail:status.failures.map(value=>`${value.resourceId}: ${value.detail||value.status}`).join('\n')});
  if(status.failures.length&&status.done===before){context.update({phase:'Some resources need attention — retry retains the same snapshot'});return false;}
 }
 context.update({phase:status.pending?'Paused — remaining items kept':'Trash emptied',done:status.done,total:status.total});return status.pending===0;
};}
registerActivityAdapter('empty-trash',purgeRunner);
export async function dispatchTrash(snapshot:TrashSnapshot,workspace:Identity){
 const epoch=getConnection().epoch;
 // The deliberate confirmation click is journaled before network dispatch.
 // An uncertain confirmation reuses the same count, generation and receipt.
 const input={id:snapshot.id,title:'Empty Trash',kind:'empty-trash',workspace,receipt:snapshot.id,phase:'Deleting Trash items',done:snapshot.done,total:snapshot.total};
 await startActivity(input,purgeRunner({...input,epoch}));
}
