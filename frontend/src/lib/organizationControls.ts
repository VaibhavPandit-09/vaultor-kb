import type { Resource } from '../types';
import api from './api';
import { useRetainedQuery } from './useRetainedQuery';
export type Membership = {id:string;name:string;selectedCount:number};
export type PinnedItem = {id:string;kind:string;name:string;count:number;resource?:Resource};
export type PinnedShortcut = PinnedItem & ({entityKind:'collection'} | {entityKind:'resource';resourceType:string});
export function normalizePinnedItem(item:PinnedItem):PinnedShortcut {
 return item.kind==='collection'?{...item,entityKind:'collection'}:{...item,entityKind:'resource',resourceType:item.kind};
}
export type PinsPage = {items:PinnedShortcut[];totalPages:number;totalItems:number;appliedKind?:string};
async function memberships(key:string,signal:AbortSignal) {
  return (await api.post<Membership[]>('/organization/selection',{resourceIds:JSON.parse(key)},{signal,backgroundDiagnostic:true})).data;
}
export function useMemberships(ids:string[]) {return useRetainedQuery(JSON.stringify([...ids].sort()),ids.length>0,'collections',memberships);}
async function pins(key:string,signal:AbortSignal) {
 const [q,page,size,kind]=JSON.parse(key);
 const {data}=await api.get<Omit<PinsPage,'items'>&{items:PinnedItem[]}>('/organization/pins',{params:{q,page,size,...(kind!=='all'?{kind}:{})},signal,backgroundDiagnostic:true});
 if(kind!=='all' && data.appliedKind!==kind) throw new Error('Update the connected server to 0.3.1 or later to filter pinned shortcuts.');
 return {...data,items:data.items.map(normalizePinnedItem)};
}
export function usePins(q='',page=0,size=12,enabled=true,kind='all') {return useRetainedQuery(JSON.stringify([q,page,size,kind]),enabled,'pins',pins);}
export function organizationError(error:unknown) {return (error as {response?:{data?:{detail?:string}}})?.response?.data?.detail || 'Could not save this change. Please retry.';}
