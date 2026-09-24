export type SearchMode = 'title' | 'content';
import api from './api';
import type { ResourceSummary } from '../types';
import type { BrowseQuery, ResourcePage } from './resourceBrowse';
export type SearchSnippet={text:string;highlights:{start:number;end:number}[]};
export type SearchHit={resource:ResourceSummary;snippet:SearchSnippet};
export type SearchPage={items:SearchHit[];page:number;size:number;totalItems:number;totalPages:number};
export async function searchResources(query:BrowseQuery,signal?:AbortSignal):Promise<SearchPage>{
 const params=new URLSearchParams();for(const [key,value] of Object.entries(query)){if(key==='sort')continue;if(key==='tags')(value as string[]).forEach(tag=>params.append('tag',tag));else if(value!==undefined)params.set(key,String(value));}
 return (await api.get<SearchPage>('/resources/query',{params,signal,backgroundDiagnostic:true})).data;
}
export async function searchResourcePage(query:BrowseQuery,signal?:AbortSignal):Promise<ResourcePage>{const page=await searchResources(query,signal);return {...page,items:page.items.map(hit=>({...hit.resource,searchSnippet:hit.snippet}))};}
