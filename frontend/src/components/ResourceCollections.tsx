import { useEffect, useRef, useState } from 'react';
import { useRestoreFocusOnClose } from '../lib/useRestoreFocusOnClose';
import { createPortal } from 'react-dom';
import { FolderPlus, Plus } from 'lucide-react';
import AppModal from './modals/AppModal';
import api from '../lib/api';
import { organizationChanged, useOrganizationPage, type OrganizationItem } from '../lib/organization';
import { organizationError, useMemberships, type Membership } from '../lib/organizationControls';

export function CollectionPicker({resourceIds,onClose,onCreated}:{resourceIds:string[];onClose:()=>void;onCreated?:(item:OrganizationItem)=>void}) {
 const [query,setQuery]=useState(''),[search,setSearch]=useState(''),[page,setPage]=useState(0);
 const result=useOrganizationPage('collection',search,page),membership=useMemberships(resourceIds);
 const [overrides,setOverrides]=useState<Record<string,Membership>>({}),[pending,setPending]=useState<string[]>([]),[errors,setErrors]=useState<Record<string,string>>({});
 const running=useRef(new Set<string>()), creation=useRef({name:'',id:''});
 useEffect(()=>{const timer=setTimeout(()=>{setSearch(query.trim());setPage(0);},180);return()=>clearTimeout(timer);},[query]);
 const members=new Map((membership.data??[]).map(item=>[item.id,item]));Object.values(overrides).forEach(item=>members.set(item.id,item));
 const selected=[...members.values()].filter(item=>item.selectedCount>0&&item.name.toLowerCase().includes(search.toLowerCase())).sort((a,b)=>a.name.localeCompare(b.name));
 const items=[...selected,...(result.data?.items??[]).filter(item=>!selected.some(value=>value.id===item.id)).map(item=>({...item,selectedCount:members.get(item.id)?.selectedCount??0}))];
 async function toggle(item:Membership){if(running.current.has(item.id))return;running.current.add(item.id);setPending(v=>[...v,item.id]);setErrors(v=>({...v,[item.id]:''}));const adding=item.selectedCount!==resourceIds.length;
 setOverrides(v=>({...v,[item.id]:{...item,selectedCount:adding?resourceIds.length:0}}));
 try{await api.post('/organization/memberships',{resourceIds,kind:'collection',targetId:item.id,action:adding?'add':'remove'},{backgroundDiagnostic:true});organizationChanged('collection',resourceIds);}
 catch(e){setOverrides(v=>({...v,[item.id]:item}));setErrors(v=>({...v,[item.id]:organizationError(e)}));}
 finally{running.current.delete(item.id);setPending(v=>v.filter(id=>id!==item.id));}}
 async function create(){if(running.current.has('create'))return;running.current.add('create');setPending(v=>[...v,'create']);setErrors(v=>({...v,create:''}));const name=query.trim();if(creation.current.name!==name)creation.current={name,id:crypto.randomUUID()};
 try{const {data}=await api.put<OrganizationItem>('/collections/creations/'+creation.current.id,{name,resourceIds},{backgroundDiagnostic:true});setOverrides(v=>({...v,[data.id]:{...data,selectedCount:resourceIds.length}}));organizationChanged('collection',resourceIds.length?resourceIds:undefined);setQuery('');creation.current={name:'',id:''};onCreated?.(data);}
 catch(e){setErrors(v=>({...v,create:organizationError(e)}));}finally{running.current.delete('create');setPending(v=>v.filter(id=>id!=='create'));}}
 const exact=Boolean(result.data?.exactMatch)||items.some(item=>item.name.toLowerCase()===query.trim().toLowerCase());
 return createPortal(<AppModal open title={resourceIds.length?'Add to collection':'New collection'} description={resourceIds.length>1?`Changes apply to ${resourceIds.length} resources. Mixed memberships are marked “some”.`:undefined} onClose={()=>{if(!running.current.size)onClose();}}>
 <div className="space-y-3"><input autoFocus className="organization-input w-full" aria-label="Search or create collection" placeholder="Search or create a collection…" maxLength={100} value={query} onChange={e=>setQuery(e.target.value)}/>
 {(result.error||membership.error)&&<p role="alert">Could not load collections. <button onClick={()=>{result.retry();membership.retry();}}>Retry</button></p>}
 {resourceIds.length>0&&<div className="max-h-72 overflow-y-auto space-y-1">{membership.loading?<p>Loading memberships…</p>:items.map(item=><div key={item.id}><label className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-[var(--surface-hover)]"><input type="checkbox" aria-checked={item.selectedCount>0&&item.selectedCount<resourceIds.length?'mixed':item.selectedCount===resourceIds.length} checked={item.selectedCount===resourceIds.length} disabled={pending.includes(item.id)||Boolean(membership.error)} onChange={()=>void toggle(item)}/><span className="truncate flex-1">{item.name}</span>{item.selectedCount>0&&item.selectedCount<resourceIds.length&&<small>some</small>}{pending.includes(item.id)&&<small>Saving…</small>}</label>{errors[item.id]&&<p role="alert" className="text-xs text-red-500">{errors[item.id]} <button onClick={()=>void toggle(item)}>Retry</button></p>}</div>)}</div>}
 {query.trim()&&!exact&&<button className="library-button w-full" disabled={pending.includes('create')||result.loading||search!==query.trim()||Boolean(result.error)} onClick={()=>void create()}><Plus size={15}/>{pending.includes('create')?'Creating…':`Create “${query.trim()}”${resourceIds.length?' and add':''}`}</button>}
 {!resourceIds.length&&exact&&<p className="text-sm">A collection with this name already exists. Choose another name.</p>}
 {errors.create&&<p role="alert" className="text-sm text-red-500">{errors.create} <button disabled={pending.includes('create')} onClick={()=>void create()}>Retry</button></p>}
 {resourceIds.length>0&&<div className="flex gap-2 justify-end"><button className="library-button" disabled={page===0} onClick={()=>setPage(page-1)}>Previous</button><button className="library-button" disabled={!result.data||page+1>=result.data.totalPages} onClick={()=>setPage(page+1)}>Next</button></div>}
 </div></AppModal>,document.body);
}
export default function ResourceCollections({id,onOpen}:{id:string;onOpen:(item:OrganizationItem)=>void}) {
 const focus=useRestoreFocusOnClose();
 const result=useMemberships([id]),[open,setOpen]=useState(false),[expanded,setExpanded]=useState(false);
 const items=result.data??[];
 async function navigate(collectionId:string){try{const {data}=await api.get<OrganizationItem>('/collections/'+collectionId);onOpen(data);}catch{result.retry();}}
 return <div className="resource-collections"><span className="text-xs text-[var(--text-tertiary)]">Collections</span>{(expanded?items:items.slice(0,2)).map(item=><button className="collection-chip" key={item.id} onClick={()=>void navigate(item.id)} title={item.name}>{item.name}</button>)}{items.length>2&&<button className="collection-chip" onClick={()=>setExpanded(!expanded)}>{expanded?'Less':`+${items.length-2}`}</button>}<button className="collection-chip" onClick={()=>{focus.captureFocus();setOpen(true);}}><FolderPlus size={13}/>Add to collection</button>{result.error&&<button className="text-xs text-red-500" onClick={result.retry}>Retry collections</button>}{open&&<CollectionPicker resourceIds={[id]} onClose={()=>{setOpen(false);focus.restoreFocus();}}/>}</div>;
}
