import {Search,X,RotateCw,SlidersHorizontal} from 'lucide-react';
import {type RefObject} from 'react';
import {MenuAction} from '../components/MenuAction';
import LibraryPopover from '../components/LibraryPopover';
import {isFiltered,defaultCriteria,type Criteria} from './searchState';
export default function SearchBar({value,change,input,focused,down,refresh,pending}:{value:Criteria;change:(c:Criteria)=>void;input:RefObject<HTMLInputElement|null>;focused:(v:boolean)=>void;down:()=>void;refresh:()=>void;pending:boolean}){
 return <div className="next-search" data-pending={pending}>
  <label><Search size={15}/><input ref={input} aria-label="Search notes" type="search" maxLength={256} value={value.query} placeholder={value.content?'Titles and saved text…':'Search titles…'} onChange={e=>change({...value,query:e.target.value})} onFocus={()=>focused(true)} onBlur={()=>focused(false)} onKeyDown={e=>{if(e.key==='ArrowDown'){e.preventDefault();down();}}}/></label>
  {(value.query.length>0||isFiltered(value))&&<button aria-label="Clear search and filters" title="Clear search and filters" onClick={()=>{change({...defaultCriteria,view:value.view,tag:value.tag,tagName:value.tagName});input.current?.focus();}}><X size={14}/></button>}
  <LibraryPopover label="Search options" trigger={<SlidersHorizontal size={15}/>} >{()=> <div className="next-search-options"><label>Match<select autoFocus aria-label="Search text" value={value.content?'content':'title'} onChange={e=>change({...value,content:e.target.value==='content'})}><option value="title">Titles only</option><option value="content">Titles and saved content</option></select></label><label>Order<select aria-label="Search ordering" value={value.order} onChange={e=>change({...value,order:e.target.value as Criteria['order']})}><option value="created">Newest created</option><option value="updated">Recently modified</option><option value="title">Title A–Z</option></select></label><p>Words match prefixes, ignoring case and accents. All words must match. Searches use saved notes, not unsaved drafts.</p><MenuAction icon={RotateCw} onClick={refresh}>Refresh results</MenuAction></div>}</LibraryPopover>
 </div>;
}
