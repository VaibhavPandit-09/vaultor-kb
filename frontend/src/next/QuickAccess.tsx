import {useEffect,useState,type ReactNode} from 'react';
import {SidebarCustomization,SidebarSection} from '../components/SidebarSections';
import {command,type Summary} from './client';
import type {Preferences} from './desktopState';
type Recent={id:string;title:string;source?:string;path?:string;kind?:string};
function Group({name,preferences,save,active,revision,recent,shortcut,viewAll}:{name:'pinned'|'recent';preferences:Preferences;save:(p:Preferences)=>void;active:boolean;revision:number;recent:Recent[];shortcut:(r:Recent,pinned?:boolean)=>ReactNode;viewAll:()=>void}){
 const config=preferences.sidebarSections[name],enabled=active&&config.visible&&!config.collapsed;
 const [items,setItems]=useState<Summary[]>([]),[error,setError]=useState(''),[retry,setRetry]=useState(0);
 useEffect(()=>{if(!enabled||name==='recent'&&config.type==='all')return;let cancelled=false;void command<{items:Summary[]}>({kind:'search',options:{query:'',content:false,collection:null,view:name==='pinned'?'pinned':'recent',order:name==='pinned'?'title':'created',kind:config.type},limit:6}).then(p=>{if(!cancelled){setItems(p.items);setError('');}}).catch(e=>{if(!cancelled)setError(String(e));});return()=>{cancelled=true;};},[enabled,name,config.type,revision,retry,recent]);
 const rows=name==='recent'&&config.type==='all'?recent.slice(0,6):items;
 return <SidebarSection name={name} types={['note','file']} preferences={preferences.sidebarSections} onChange={sidebarSections=>save({...preferences,sidebarSections})} onViewAll={viewAll}>{error?<p role="alert" className="browse-feedback">{error}<button onClick={()=>setRetry(v=>v+1)}>Retry</button></p>:rows.map(r=>shortcut(r,name==='pinned'))}{!rows.length&&!error&&<p className="browse-feedback">{name==='pinned'?'Pin resources to keep them here.':'Opened resources of this type appear here.'}</p>}</SidebarSection>;
}
export default function QuickAccess({preferences,save,active,revision,recent,shortcut,viewAll,error,saving}:{preferences:Preferences;save:(p:Preferences)=>void;active:boolean;revision:number;recent:Recent[];shortcut:(r:Recent,pinned?:boolean)=>ReactNode;viewAll:(v:'pinned'|'recent')=>void;error:string;saving:boolean}){
 return <><SidebarCustomization preferences={preferences.sidebarSections} onChange={sidebarSections=>save({...preferences,sidebarSections})} status={error?'failed':saving?'saving':'saved'} onRetry={()=>save(preferences)}/>{(['pinned','recent'] as const).map(name=><Group key={name} name={name} preferences={preferences} save={save} active={active} revision={revision} recent={recent} shortcut={shortcut} viewAll={()=>viewAll(name)}/>)}</>;
}
