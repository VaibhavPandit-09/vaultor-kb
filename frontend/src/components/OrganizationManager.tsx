import PinButton from './PinButton';
import { useEffect, useState } from 'react';
import { Folder, Tag, Pencil, Trash2 } from 'lucide-react';
import AppModal from './modals/AppModal';
import api from '../lib/api';
import { organizationChanged, useOrganizationPage, type OrganizationItem, type OrganizationKind } from '../lib/organization';

export default function OrganizationManager({onClose,onCollection,onTag,tags,resourceIds=[],onApplied,onTagRenamed,selectedCollection}: {
  onClose:()=>void;onCollection:(item:OrganizationItem|null)=>void;selectedCollection?:OrganizationItem|null;onTag:(name:string)=>void;tags:string[];resourceIds?:string[];onApplied:()=>void;onTagRenamed:(oldName:string,newName:string|null)=>void;
}) {
  const [kind,setKind]=useState<OrganizationKind>('collection'),[query,setQuery]=useState(''),[search,setSearch]=useState(''),[page,setPage]=useState(0);
  const [name,setName]=useState(''),[editing,setEditing]=useState<OrganizationItem|null>(null),[deleting,setDeleting]=useState<OrganizationItem|null>(null);
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
  const results=useOrganizationPage(kind,search,page);
  useEffect(()=>{const timer=setTimeout(()=>{setSearch(query);setPage(0);},200);return()=>clearTimeout(timer);},[query]);
  async function action(work:()=>Promise<void>) {
    setBusy(true);setError('');setMessage('');
    try {await work();organizationChanged(kind,resourceIds.length ? resourceIds : undefined);} catch(e) { const detail=(e as {response?:{data?:{detail?:string}}}).response?.data?.detail;setError(detail??'Change failed. Your selection is retained; try again.'); } finally {setBusy(false);}
  }
  function switchKind(next:OrganizationKind) {setKind(next);setQuery('');setSearch('');setPage(0);setEditing(null);setDeleting(null);setName('');setError('');setMessage('');}
  const noun=kind==='collection'?'collection':'tag';
  async function save() {
    await action(async()=>{
      if(kind==='collection') {const {data}=await api[editing?'put':'post'](editing?`/collections/${editing.id}`:'/collections',{name,favorite:editing?.favorite??false});if(editing && selectedCollection?.id===editing.id)onCollection(data);}
      else if(editing) {const {data}=await api.put(`/tags/${editing.id}/name`,{name});onTagRenamed(editing.name,data.name);}
      else await api.post('/tags',{name});
      setName('');setEditing(null);setMessage('Saved.');
    });
  }
  function bulk(item:OrganizationItem,change:'add'|'remove') {void action(async()=>{await api.post('/organization/memberships',{resourceIds,kind,targetId:item.id,action:change});setMessage(`${change==='add'?'Added to':'Removed from'} ${item.name}.`);onApplied();});}
  return <AppModal open title={resourceIds.length?`Organize ${resourceIds.length} selected resources`:'Collections and tags'} description="Collections group resources by topic. Tags describe them across collections." onClose={()=>{if(!busy)onClose();}} widthClassName="max-w-2xl">
    <div className="organization-manager">
      <div className="flex gap-2"><button disabled={busy} className="library-button" aria-pressed={kind==='collection'} onClick={()=>switchKind('collection')}><Folder size={16}/>Collections</button><button disabled={busy} className="library-button" aria-pressed={kind==='tag'} onClick={()=>switchKind('tag')}><Tag size={16}/>Tags</button></div>
      <input className="organization-input" aria-label={`Search ${noun}s`} placeholder={`Search ${noun}s…`} value={query} maxLength={100} onChange={e=>setQuery(e.target.value)}/>
      <form className="flex gap-2" onSubmit={e=>{e.preventDefault();void save();}}><input className="organization-input flex-1" disabled={busy} aria-label={`${editing?'Rename':'New'} ${noun}`} placeholder={`${editing?'Rename':'New'} ${noun}`} maxLength={100} value={name} onChange={e=>setName(e.target.value)}/><button className="library-button" disabled={busy||!name.trim()}>{editing?'Save':'Create'}</button>{editing&&<button type="button" className="library-button" disabled={busy} onClick={()=>{setEditing(null);setName('');}}>Cancel</button>}</form>
      {error&&<p role="alert">{error}</p>}{message&&<p role="status">{message}</p>}
      {deleting&&<div className="organization-confirm" role="alert"><p>Delete {noun} “{deleting.name}”? Its resources will be kept.</p><button className="library-button" disabled={busy} onClick={()=>void action(async()=>{await api.delete(`/${kind==='collection'?'collections':'tags'}/${deleting.id}`);if(kind==='tag')onTagRenamed(deleting.name,null);else if(selectedCollection?.id===deleting.id)onCollection(null);setDeleting(null);setEditing(null);setName('');setPage(0);setMessage('Deleted. Resources were kept.');})}>Confirm delete</button><button className="library-button" disabled={busy} onClick={()=>setDeleting(null)}>Cancel</button></div>}
      {results.error && results.data && <p role="alert">{results.error}<button onClick={results.retry}>Retry</button></p>}
      <div className="organization-list" aria-busy={results.loading}>
        {results.loading?<p>Loading…</p>:results.error && !results.data?<p role="alert">{results.error}<button onClick={results.retry}>Retry</button></p>:!results.data?.items.length?<p>No {noun}s match.</p>:results.data.items.map(item=><div key={item.id} className="organization-row">
          <button disabled={busy || resourceIds.length > 0} className="organization-name" title={`Browse ${item.name}`} onClick={()=>{if(kind==='collection'){onCollection(item);onClose();}else onTag(item.name);}}>{kind==='tag'&&<span className="organization-dot" style={{background:item.color}}/>}<span>{item.name}</span><small>{item.count}</small>{kind==='tag'&&tags.includes(item.name)&&<small>Selected</small>}</button>
          {resourceIds.length>0?<><button disabled={busy} className="library-button" onClick={()=>bulk(item,'add')}>Add</button><button disabled={busy} className="library-button" onClick={()=>bulk(item,'remove')}>Remove</button></>:<>
            {kind==='collection'?<PinButton id={item.id} name={item.name} favorite={item.favorite} entity="collection"/>:<input type="color" title={`Color for ${item.name}`} aria-label={`Color for ${item.name}`} disabled={busy} value={item.color?.startsWith('#')?item.color:'#64748b'} onChange={e=>{const color=e.target.value;void action(async()=>{await api.put(`/tags/${item.id}/color`,{color});});}}/>}
            <button disabled={busy} className="library-button" aria-label={`Rename ${item.name}`} onClick={()=>{setEditing(item);setName(item.name);}}><Pencil size={14}/></button><button disabled={busy} className="library-button" aria-label={`Delete ${item.name}`} onClick={()=>setDeleting(item)}><Trash2 size={14}/></button>
          </>}
        </div>)}
      </div>
      <footer className="library-pagination"><span>{results.data?.totalItems??0} {noun}s · page {page+1}</span><button className="library-button" disabled={busy||results.loading||page===0} onClick={()=>setPage(page-1)}>Previous</button><button className="library-button" disabled={busy||results.loading||!results.data||page+1>=results.data.totalPages} onClick={()=>setPage(page+1)}>Next</button></footer>
      {resourceIds.length>0&&<p className="text-xs text-[var(--text-tertiary)]">Add/remove affects only the selected resources and chosen {noun}. Other memberships stay unchanged.</p>}
    </div>
  </AppModal>;
}
