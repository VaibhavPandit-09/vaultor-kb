import { useEffect, useRef, useState } from 'react';
import { Pin, Loader2 } from 'lucide-react';
import api from '../lib/api';
import { setResourceFavorite } from '../lib/resourceBrowse';
import { notifyResourceChange, subscribeResourceChanges } from '../lib/resourceEvents';
import { organizationError } from '../lib/organizationControls';
export default function PinButton({id,name,favorite=false,entity='resource'}:{id:string;name:string;favorite?:boolean;entity?:'resource'|'collection'}) {
 const [pinned,setPinned]=useState(favorite),[busy,setBusy]=useState(false),[error,setError]=useState('');const running=useRef(false);
 useEffect(()=>setPinned(favorite),[favorite,id]);
 useEffect(()=>subscribeResourceChanges(change=>{if(change.kind==='pins'&&change.entity===entity&&change.id===id&&change.favorite!==undefined)setPinned(change.favorite);}),[id,entity]);
 async function toggle(){if(running.current)return;running.current=true;setBusy(true);setError('');const next=!pinned;
 try{if(entity==='resource')await setResourceFavorite(id,next);else await api.put(`/collections/${id}/favorite`,{favorite:next},{backgroundDiagnostic:true});setPinned(next);if(entity==='collection')notifyResourceChange({kind:'pins',entity,id,favorite:next});}
 catch(e){setError(organizationError(e));}finally{running.current=false;setBusy(false);}}
 return <span className="inline-flex items-center gap-1"><button type="button" className="library-button" title={error||`${pinned?'Unpin':'Pin'} ${name}`} aria-label={`${pinned?'Unpin':'Pin'} ${name}`} aria-pressed={pinned} disabled={busy} onClick={()=>void toggle()}>{busy?<Loader2 size={16} className="animate-spin"/>:<Pin size={16} fill={pinned?'currentColor':'none'}/>}</button>{error&&<button role="alert" className="text-xs text-red-500" title={error} onClick={()=>void toggle()}>Retry pin</button>}</span>;
}
