import api from './api';
import { getConnection } from './platform';
import type { Resource } from '../types';
import type { OrganizationItem } from './organization';
import { organizationChanged } from './organization';
import { setResourceFavorite } from './resourceBrowse';
export type CommandScope={epoch:number;generation?:string};
export const commandScope=():CommandScope=>({epoch:getConnection().epoch,generation:getConnection().generation});
export function requireCommandScope(scope:CommandScope){if(scope.epoch!==getConnection().epoch||(scope.generation&&getConnection().generation&&scope.generation!==getConnection().generation))throw new Error('Workspace changed. Reselect the resources.');}
export const commandConfig=(scope:CommandScope)=>({connectionEpoch:scope.epoch,backgroundDiagnostic:true,...(scope.generation?{headers:{'X-Vaultor-Generation':scope.generation}}:{})});
export function boundedResources(resources:Resource[]){if(!resources.length||resources.length>100||new Set(resources.map(item=>item.id)).size!==resources.length||resources.some(item=>item.trashedAt))throw new Error('Select 1–100 available resources.');}
/** The host validates every ID and commits this membership change atomically. */
export async function changeMembership(resourceIds:string[],kind:'collection'|'tag',targetId:string,action:'add'|'remove',scope=commandScope()){
 requireCommandScope(scope);if(!resourceIds.length||resourceIds.length>100||new Set(resourceIds).size!==resourceIds.length)throw new Error('Select 1–100 resources.');
 await api.post('/organization/memberships',{resourceIds,kind,targetId,action},commandConfig(scope));requireCommandScope(scope);organizationChanged(kind,resourceIds);
}
export async function pinResources(resources:Resource[],favorite:boolean,scope=commandScope()){
 boundedResources(resources);requireCommandScope(scope);const completed:string[]=[],failed:Array<{id:string;title:string;detail:string}>=[];
 for(const resource of resources){try{requireCommandScope(scope);await setResourceFavorite(resource.id,favorite,scope);requireCommandScope(scope);completed.push(resource.id);}catch(error){failed.push({id:resource.id,title:resource.title,detail:error instanceof Error?error.message:'Pin failed. Retry.'});}}
 return {completed,failed};
}
export async function reparentCollection(collection:OrganizationItem,destination:OrganizationItem|null,scope=commandScope()){
 requireCommandScope(scope);if(destination&&(collection.id===destination.id||destination.ancestors?.some(item=>item.id===collection.id)))throw new Error('A collection cannot be placed inside itself or its children.');
 const {data}=await api.put<OrganizationItem>('/collections/'+collection.id+'/parent',{parentId:destination?.id??null},commandConfig(scope));requireCommandScope(scope);organizationChanged('collection');return data;
}

export async function pinCollection(id:string,favorite:boolean,scope=commandScope()){requireCommandScope(scope);await api.put('/collections/'+id+'/favorite',{favorite},commandConfig(scope));requireCommandScope(scope);organizationChanged('collection');const {notifyResourceChange}=await import('./resourceEvents');notifyResourceChange({kind:'pins',entity:'collection',id,favorite});}
