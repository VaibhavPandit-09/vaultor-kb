import {useEffect,useState,type ReactNode} from 'react';
import {Folder,MoreHorizontal} from 'lucide-react';
import {SidebarCustomization,SidebarSection} from '../components/SidebarSections';
import SidebarShortcut from '../components/SidebarShortcutSurface';
import LibraryPopover from '../components/LibraryPopover';
import {command,org,type Summary} from './client';
import type {Preferences} from './desktopState';
export type Shortcut={id:string;title:string;source?:string;path?:string;kind?:string;revision?:number;updatedAt?:string;fileCategory?:string};
export type PinsPage={items:Shortcut[];total:number;next:number|null};
function Group({name,preferences,save,active,revision,recent,shortcut,viewAll,onCollection,unpinCollection}:{name:'pinned'|'recent';preferences:Preferences;save:(p:Preferences)=>void;active:boolean;revision:number;recent:Shortcut[];shortcut:(r:Shortcut,pinned?:boolean)=>ReactNode;viewAll:()=>void;onCollection:(id:string)=>void;unpinCollection:(id:string)=>void}){
 const config=preferences.sidebarSections[name],enabled=active&&config.visible&&!config.collapsed;
 const [items,setItems]=useState<Shortcut[]>([]),[error,setError]=useState(''),[retry,setRetry]=useState(0);
 useEffect(()=>{if(!enabled||name==='recent'&&config.type==='all')return;let cancelled=false;
 const request=name==='pinned'?org<PinsPage>({op:'pins',query:'',kind:config.type,offset:0,limit:6}):command<{items:Summary[]}>({kind:'search',options:{query:'',content:false,collection:null,view:'recent',order:'created',kind:config.type},limit:6});
 void request.then(p=>{if(!cancelled){setItems(p.items);setError('');}}).catch(e=>{if(!cancelled)setError(String(e));});return()=>{cancelled=true;};},[enabled,name,config.type,revision,retry,recent]);
 const rows=name==='recent'&&config.type==='all'?recent.slice(0,6):items;
 return <div data-pin-drop={name==='pinned'?'true':undefined}><SidebarSection name={name} types={name==='pinned'?['note','file','collection','image','pdf','audio','video','text','other']:['note','file','image','pdf','audio','video','text','other']} preferences={preferences.sidebarSections} onChange={sidebarSections=>save({...preferences,sidebarSections})} onViewAll={viewAll}>{error?<p role="alert" className="browse-feedback">{error}<button onClick={()=>setRetry(v=>v+1)}>Retry</button></p>:rows.map(r=>r.kind==='collection'?<SidebarShortcut key={'collection:'+r.id} title={r.title} description="Pinned collection" icon={Folder} onClick={()=>onCollection(r.id)} actions={<LibraryPopover label={'Actions for collection '+r.title} trigger={<MoreHorizontal size={14}/>} menu>{close=><button onClick={()=>{close();unpinCollection(r.id);}}>Unpin collection</button>}</LibraryPopover>}/>:shortcut(r,name==='pinned'))}{!rows.length&&!error&&<p className="browse-feedback">{name==='pinned'?'Pin resources or collections to keep them here.':'Opened resources of this type appear here.'}</p>}</SidebarSection></div>;
}
export default function QuickAccess({preferences,save,active,revision,recent,shortcut,viewAll,error,saving,onCollection,unpinCollection}:{preferences:Preferences;save:(p:Preferences)=>void;active:boolean;revision:number;recent:Shortcut[];shortcut:(r:Shortcut,pinned?:boolean)=>ReactNode;viewAll:(v:'pinned'|'recent')=>void;error:string;saving:boolean;onCollection:(id:string)=>void;unpinCollection:(id:string)=>void}){
 return <><SidebarCustomization preferences={preferences.sidebarSections} onChange={sidebarSections=>save({...preferences,sidebarSections})} status={error?'failed':saving?'saving':'saved'} onRetry={()=>save(preferences)}/>{(['pinned','recent'] as const).map(name=><Group key={name} name={name} preferences={preferences} save={save} active={active} revision={revision} recent={recent} shortcut={shortcut} viewAll={()=>viewAll(name)} onCollection={onCollection} unpinCollection={unpinCollection}/>)}</>;
}
