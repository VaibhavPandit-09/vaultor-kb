import api from './api';
import {useRetainedQuery} from './useRetainedQuery';
import type {OrganizationItem,OrganizationPage} from './organization';
export type TagSummary=OrganizationItem&{color:string};
export type TagSort='name'|'name-desc'|'usage';
async function load(key:string,signal:AbortSignal){const {q,page,size,sort,ids}=JSON.parse(key);return (await api.get<OrganizationPage>('/tags/browse',{params:{q,page,size,sort,...(ids?.length?{ids:ids.join(',')}:{})},signal,backgroundDiagnostic:true})).data;}
export function useTagPage(q:string,page:number,size:number,sort:TagSort,enabled:boolean,ids?:string[]){return useRetainedQuery(JSON.stringify({q,page,size,sort,ids}),enabled,'tags',load);}
export function quickTagRows(quick:string[],recent:string[],known:OrganizationItem[],popular:OrganizationItem[]){const index=new Map(known.map(tag=>[tag.id,tag]));return [...new Map([...quick,...recent].flatMap(id=>index.has(id)?[[id,index.get(id)!] as const]:[]).concat(popular.map(tag=>[tag.id,tag] as const))).values()].slice(0,8);}
