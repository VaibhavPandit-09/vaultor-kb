import { useEffect,useRef,useLayoutEffect } from 'react';
import { Activity as ActivityIcon } from 'lucide-react';
import LibraryPopover from './LibraryPopover';
import { dismissActivity,pauseActivity,resumeActivity,restoreActivity,useActivity } from '../lib/activity';
import api from '../lib/api';
import type { Identity } from '../lib/sessionStore';
import { getConnection } from '../lib/platform';
import { saveActivityOutput } from '../lib/transferActivity';
import '../lib/trashActivity';
import { reportError } from '../lib/diagnostics';
import { DialogFocusContext,useTopDialogScope } from '../lib/dialogFocus';

export default function Activity(){
 const scope=useTopDialogScope(),chrome=useRef<HTMLDivElement>(null);
 useLayoutEffect(()=>{const element=chrome.current;if(!element||!scope)return;scope.portals.add(element);return()=>{scope.portals.delete(element);};},[scope]);
 const tasks=useActivity(),source=getConnection().profileId;
 const current=tasks.filter(task=>task.source===source),count=current.filter(task=>task.state!=='complete'||Boolean(task.warnings)).length;
 const shown=[...current.filter(task=>task.state!=='complete'||Boolean(task.warnings)),...current.filter(task=>task.state==='complete'&&!task.warnings).slice(0,10)];
 useEffect(()=>{void api.get<Identity>('/workspace/identity',{backgroundDiagnostic:true}).then(({data})=>restoreActivity(data)).catch(error=>reportError('activity.restore',error));},[]);
 return <DialogFocusContext.Provider value={scope}><div ref={chrome} className="activity-chrome"><LibraryPopover priority={4000} zIndex={3300} label={count?`Activity · ${count} need attention or are in progress`:'Activity'} trigger={<><ActivityIcon size={16}/><span>Activity</span>{count>0&&<strong>{count>99?'99+':count}</strong>}</>}>
  {close=> <><h2 className="text-sm font-semibold">Activity</h2>{current.some(task=>task.state==='complete')&&<button className="library-button" onClick={()=>void Promise.all(current.filter(task=>task.state==='complete').map(task=>dismissActivity(task.id))).catch(error=>reportError('activity.dismiss',error))}>Dismiss completed</button>}{!current.length&&<p className="text-sm text-[var(--text-secondary)]">No recent tasks.</p>}{shown.map(task=><section key={task.id} className="activity-task" aria-label={task.title}>
   <strong className="block text-sm truncate" title={task.title}>{task.title}</strong><small title={task.workspace.id}>Workspace {task.workspace.id.slice(0,8)} · {task.state}</small>
   <p className="text-sm" role="status">{task.phase}</p>{task.total!==undefined?<><small>{task.done??0}/{task.total} {task.unit??'completed'}</small><progress aria-label={task.title+' progress'} value={task.done??0} max={Math.max(1,task.total)}/></>:task.state==='running'?<progress aria-label={task.title+' progress'}/>:null}
   {!!task.warnings&&<p className="text-sm">{task.warnings} {task.warnings===1?'warning':'warnings'} to review</p>}{task.detail&&<details><summary className="text-sm">Details</summary><p className="text-sm whitespace-pre-wrap">{task.detail}</p><small>Task {task.id}{task.receipt?' · Receipt '+task.receipt:''}</small></details>}
   <div className="flex gap-2">{task.kind==='workspace-preview'&&task.state!=='running'&&task.state!=='complete'&&<button className="library-button" onClick={()=>{close();window.dispatchEvent(new Event('vaultor:workspace-import'));}}>Review transfer…</button>}{task.output&&<button className="library-button" onClick={()=>void saveActivityOutput(task).catch(error=>reportError('activity.download',error))}>Save output…</button>}{task.state==='running'?<button className="library-button" onClick={()=>pauseActivity(task.id)}>{task.kind.startsWith('workspace-')?'Pause monitoring':'Pause'}</button>:task.state==='complete'?<button className="library-button" onClick={()=>void dismissActivity(task.id)}>Dismiss</button>:<button className="library-button" onClick={()=>void resumeActivity(task.id)}>{task.state==='attention'?'Retry':'Resume'}</button>}</div>
  </section>)}</>}
 </LibraryPopover>{current.some(task=>task.state==='attention')&&<span className="sr-only" role="alert">An Activity task needs attention. Open Activity for details.</span>}</div></DialogFocusContext.Provider>;
}
