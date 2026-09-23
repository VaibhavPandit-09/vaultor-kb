import api from './api';
import { useRetainedQuery } from './useRetainedQuery';
export type Membership = {id:string;name:string;selectedCount:number};
export type PinnedItem = {id:string;kind:string;name:string;count:number};
export type PinsPage = {items:PinnedItem[];totalPages:number;totalItems:number};
async function memberships(key:string,signal:AbortSignal) {
  return (await api.post<Membership[]>('/organization/selection',{resourceIds:JSON.parse(key)},{signal,backgroundDiagnostic:true})).data;
}
export function useMemberships(ids:string[]) {return useRetainedQuery(JSON.stringify([...ids].sort()),ids.length>0,'collections',memberships);}
async function pins(key:string,signal:AbortSignal) {const [q,page,size]=JSON.parse(key);return (await api.get<PinsPage>('/organization/pins',{params:{q,page,size},signal,backgroundDiagnostic:true})).data;}
export function usePins(q='',page=0,size=12,enabled=true) {return useRetainedQuery(JSON.stringify([q,page,size]),enabled,'pins',pins);}
export function organizationError(error:unknown) {return (error as {response?:{data?:{detail?:string}}})?.response?.data?.detail || 'Could not save this change. Please retry.';}
