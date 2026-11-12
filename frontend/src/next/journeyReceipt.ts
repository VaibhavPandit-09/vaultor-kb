import type {Pane,ReadingPosition} from '../lib/paneNavigation';
import type {JourneyReceipt,WorkspaceSession} from './desktopState';
/** Metadata only. Reject malformed visits before the original controller receives them. */
export function decodeJourneys(value:unknown):JourneyReceipt|undefined{
 if(!value||typeof value!=='object')return;const r=value as JourneyReceipt;
 if(!Array.isArray(r.sessions)||r.sessions.length>64||!Array.isArray(r.panes)||r.panes.length>2)return;
 const valid=(p:Pane)=>p&&typeof p.paneId==='string'&&p.paneId.length<=200&&typeof p.id==='string'&&p.id.length<=200&&Array.isArray(p.history)&&p.history.length>0&&p.history.length<=200&&Number.isInteger(p.cursor)&&p.cursor>=0&&p.cursor<p.history.length&&p.history[p.cursor].resourceId===p.id&&p.history.every(v=>v&&typeof v.visitId==='string'&&v.visitId.length<=200&&typeof v.resourceId==='string'&&v.resourceId.length<=200&&typeof v.title==='string'&&v.title.length<=240);
 if(!r.sessions.every(valid)||new Set(r.sessions.map(p=>p.paneId)).size!==r.sessions.length||!r.panes.every(p=>valid(p)&&r.sessions.some(s=>s.paneId===p.paneId&&s.id===p.id)))return;
 const positions:Record<string,ReadingPosition>={},keys=new Set(r.sessions.flatMap(p=>p.history.map(v=>v.visitId)));
 for(const [id,p] of Object.entries(r.positions??{})){if(!keys.has(id)||!p||!Number.isFinite(p.scrollTop)||!Number.isFinite(p.scrollLeft))continue;positions[id]={scrollTop:Math.max(0,Math.min(1e7,p.scrollTop)),scrollLeft:Math.max(0,Math.min(1e7,p.scrollLeft)),...(p.selection&&Number.isInteger(p.selection.from)&&Number.isInteger(p.selection.to)&&p.selection.from>=0&&p.selection.to>=p.selection.from?{selection:p.selection}:{})};}
 return {sessions:r.sessions,panes:r.panes,activePaneId:r.panes.some(p=>p.paneId===r.activePaneId)?r.activePaneId:r.panes.at(-1)?.paneId??null,positions};
}
/** Existing Rust session limit stays32KiB; no document/Undo content enters a receipt. */
export function boundSession(value:WorkspaceSession):WorkspaceSession{
 const r=value.journeys;let result:WorkspaceSession={...value,remembered:value.remembered?.slice(-24),history:value.history?{entries:value.history.entries.slice(-16),index:Math.max(0,value.history.index-Math.max(0,value.history.entries.length-16))}:undefined};
 if(r){const shown=new Set(r.panes.map(p=>p.paneId));let remaining=96;
 const sessions=[...r.sessions.filter(p=>shown.has(p.paneId)),...r.sessions.filter(p=>!shown.has(p.paneId)).slice(-22)].flatMap(p=>{if(remaining<=0)return [];const start=Math.max(0,p.cursor-Math.min(8,remaining-1)),history=p.history.slice(start,Math.min(p.history.length,start+Math.min(16,remaining))).map(v=>({...v,title:v.title.slice(0,160)}));remaining-=history.length;return [{...p,history,cursor:p.cursor-start}];});
 const keys=new Set(sessions.flatMap(p=>p.history.map(v=>v.visitId)));result={...result,journeys:{sessions,panes:r.panes.map(p=>({...sessions.find(s=>s.paneId===p.paneId)!,slotId:p.slotId})),activePaneId:r.activePaneId,positions:Object.fromEntries(Object.entries(r.positions).filter(([id])=>keys.has(id)))}};
 }
 // Browsing receipts can contain long searches/paths. Drop oldest inactive metadata first.
 while(new TextEncoder().encode(JSON.stringify(result)).length>32000&&result.journeys?.sessions.some(p=>!result.journeys!.panes.some(v=>v.paneId===p.paneId))){const j=result.journeys;const id=j.sessions.find(p=>!j.panes.some(v=>v.paneId===p.paneId))!.paneId;j.sessions=j.sessions.filter(p=>p.paneId!==id);const keys=new Set(j.sessions.flatMap(p=>p.history.map(v=>v.visitId)));j.positions=Object.fromEntries(Object.entries(j.positions).filter(([id])=>keys.has(id)));}
 if(new TextEncoder().encode(JSON.stringify(result)).length>32000)result={...result,browsers:{},remembered:[],history:undefined};
 while(new TextEncoder().encode(JSON.stringify(result)).length>32000&&result.journeys?.sessions.some(p=>p.history.length>1)){
  const j=result.journeys,p=j.sessions.find(p=>p.history.length>1)!;
  if(p.cursor>0){p.history=p.history.slice(1);p.cursor--;}else p.history=p.history.slice(0,-1);
  j.panes=j.panes.map(v=>({...j.sessions.find(s=>s.paneId===v.paneId)!,slotId:v.slotId}));
  const keys=new Set(j.sessions.flatMap(s=>s.history.map(v=>v.visitId)));j.positions=Object.fromEntries(Object.entries(j.positions).filter(([id])=>keys.has(id)));
 }
 return result;
}
