import {useEffect,useState} from 'react';
import AppModal from './modals/AppModal';
import type {LinkedWorkspace} from '../lib/linked/workspace';
import type {Source} from '../lib/linked/types';
type RecordSummary={operation:string;state:string;name:string;version:number};
type Review={ticket?:string;state:string;base:Uint8Array;local:Uint8Array|null;visual:string;disk?:{bytes:Uint8Array;size:number}|null};
/** Recovery never replays a Save. Each mutation requires a fresh native review
 * ticket; exports use the ordinary user-selected derivative-file dialog. */
export default function LinkedRecovery({workspace,onClose}:{workspace:LinkedWorkspace;onClose:()=>void}){
  const [records,setRecords]=useState<RecordSummary[]>([]),[sources,setSources]=useState<Source[]>([]),[source,setSource]=useState(''),[selected,setSelected]=useState<RecordSummary>(),[review,setReview]=useState<Review>(),[kind,setKind]=useState<'base'|'local'|'visual'|'disk'>('local'),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[history,setHistory]=useState(false);
  const action=async(run:()=>Promise<void>)=>{setBusy(true);setError('');try{await run();}catch(failure){setError(String(failure).replace(/^Error: /,''));}finally{setBusy(false);}};
  const refresh=async()=>{setRecords(await workspace.request<RecordSummary[]>('recovery'));};
  useEffect(()=>{let alive=true;void Promise.all([workspace.request<RecordSummary[]>('recovery'),workspace.sources()]).then(([rows,value])=>{if(alive){setRecords(rows);setSources(value.sources);setSource(value.sources[0]?.id??'');}}).catch(failure=>{if(alive)setError(String(failure));});return()=>{alive=false;};},[workspace]);
  const selectedBytes=()=>!review?null:kind==='visual'?new TextEncoder().encode(review.visual):kind==='disk'?review.disk?.bytes:review[kind];
  const exportVersion=async()=>{if(!selected||!review)return;const operation=kind==='disk'?review.ticket:selected.operation;if(!operation)throw Error('Review the current file again before exporting it.');const result=await workspace.request<{outcome:string}>('export',{operation,kind});if(result.outcome==='saved')setNotice('A new separate copy was exported. Recovery evidence is retained.');if(kind==='disk')setReview(current=>current?{...current,ticket:undefined}:current);};
  const inspect=async(record:RecordSummary)=>{setSelected(record);setReview(undefined);setNotice('');setReview(await workspace.request<Review>('inspect',{operation:record.operation}));setKind('local');};
  const reviewedAction=async(operation:'restore'|'metadata-repair'|'resolve')=>{
    if(!selected||!source)return;
    const fresh=await workspace.request<Review>('review',{operation:selected.operation,source});
    if(fresh.state!==review?.state||fresh.disk?.size!==review.disk?.size||JSON.stringify(fresh.disk?.bytes)!==JSON.stringify(review.disk?.bytes))throw Error('The original changed. Review its current version before continuing.');
    const result=await workspace.request<{state?:string;resolved?:boolean}>(operation,{ticket:fresh.ticket});setReview(undefined);setNotice(result.resolved?'Reviewed recovery record removed. Source files are unchanged.':result.state==='BASE_RESTORED_REOPEN_REQUIRED'?'Original restored. Reopen it from the linked folder.':'File permissions restored. Reopen the file from its folder.');await refresh();
  };
  const rows=history?records:records.filter(record=>record.state!=='LINKED_ACKNOWLEDGED');
  return <AppModal open title="Linked document recovery" description="Your drafts and prior versions stay protected until you resolve them." widthClassName="max-w-3xl" onClose={()=>{if(!busy)onClose();}} footer={<button className="library-button" disabled={busy} onClick={onClose}>Keep drafts and close</button>}>
    <div className="space-y-3"><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={history} onChange={event=>setHistory(event.target.checked)}/>Show previous successful Saves</label>
      {!rows.length&&<p className="browse-feedback">No unresolved recovery records.</p>}
      <ul className="space-y-1">{rows.map(record=><li key={record.operation}><button className="library-button w-full text-left" disabled={busy} aria-pressed={selected?.operation===record.operation} onClick={()=>void action(()=>inspect(record))}>{record.name} · {record.state==='LINKED_ACKNOWLEDGED'?'Previous saved version':record.state.startsWith('DRAFT_')?'Protected draft':'Save needs review'}</button></li>)}</ul>
      {review&&<section className="space-y-3 border-t border-border pt-3"><h3 className="font-medium">{selected?.name}</h3><div className="flex flex-wrap gap-2">{(['local','disk','base','visual'] as const).map(value=><button className="library-button" key={value} aria-pressed={kind===value} disabled={value==='disk'&&!review.disk||value==='local'&&!review.local} onClick={()=>setKind(value)}>{value==='local'?'Validated Vaultor source':value==='disk'?'Current file':value==='base'?'Original base':'Visual draft'}</button>)}</div>
        {kind==='visual'&&<p className="browse-feedback">This retained editor draft can contain edits that cannot safely become Markdown. Export it as JSON to preserve every edit.</p>}
        <textarea readOnly aria-label="Retained version" rows={12} className="w-full rounded border border-border bg-background p-3 font-mono text-sm" value={new TextDecoder().decode(selectedBytes()??new Uint8Array())}/>
        <button className="library-button" disabled={busy||!selectedBytes()} onClick={()=>void action(exportVersion)}>Export separate copy</button>
        <div className="flex flex-wrap items-center gap-2"><label className="text-sm">Original folder <select className="rounded border border-border bg-background p-1" value={source} onChange={event=>{setSource(event.target.value);setReview(current=>current?{...current,ticket:undefined,disk:undefined}:current);}}>{sources.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label><button className="library-button" disabled={busy||!source} onClick={()=>void action(async()=>{if(selected)setReview(await workspace.request<Review>('review',{operation:selected.operation,source}));})}>Review original file</button></div>
        {review.ticket&&<div className="flex flex-wrap gap-2">{review.state==='PATH_MISSING'&&<button className="library-button" disabled={busy} onClick={()=>void action(()=>reviewedAction('restore'))}>Restore missing original</button>}{review.disk&&<button className="library-button" disabled={busy} onClick={()=>void action(()=>reviewedAction('metadata-repair'))}>Complete interrupted permissions</button>}<button className="library-button" disabled={busy} onClick={()=>void action(()=>reviewedAction('resolve'))}>Remove reviewed recovery record</button></div>}
        {review.state==='INDEPENDENT_OCCUPANT'&&<p className="browse-feedback">This pathname now has a different file. It will not be overwritten by recovery. Keep or export your draft, then reopen the new file.</p>}
      </section>}
      {error&&<p role="alert" className="browse-feedback">{error}</p>}{notice&&<p role="status" className="browse-feedback">{notice}</p>}
    </div>
  </AppModal>;
}
