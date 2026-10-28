import { startActivity,activityTasks } from './activity';
import { folderPaths,runFolderImport,type FolderJournal } from './folderImports';
import type { ImportRow,ImportSession } from './fileImports';
import type { IndexedSessionStore } from './sessionStore';
import { notifyResourceChange } from './resourceEvents';
import { getConnection } from './platform';

export async function dispatchImport(session:ImportSession,rows:ImportRow[],journal:FolderJournal,store:IndexedSessionStore){
 if(session.sourceEpoch!==undefined&&session.sourceEpoch!==getConnection().epoch)throw Error('Connection changed since file selection. Reselect the original source.');
 const active=activityTasks().find(task=>task.receipt===journal.key&&task.state!=='complete');
 if(active?.state==='running')throw Error('This import is already running in Activity.');
 await startActivity({id:active?.id??crypto.randomUUID(),title:'Import '+(session.folder?.name??`${rows.length} files`),kind:'file-import',workspace:journal.identity,phase:'Preparing import',done:rows.filter(row=>row.status==='done').length,total:rows.length,receipt:journal.key},async task=>{
  const directories=session.folder?folderPaths(session).filter(path=>journal.includeRoot||path!==session.folder!.name):[],links=rows.filter(row=>row.asNote&&row.kind==='markdown'&&session.folder);let stage='',linking=false;
  const progress=()=>journal.complete?{done:rows.length,total:rows.length,unit:'files imported'}:stage==='Creating collections'?{done:Object.values(journal.directories).filter(entry=>entry.done).length,total:directories.length,unit:'collections ready'}:linking?{done:links.filter(row=>row.resolved).length,total:links.length,unit:'notes linked'}:{done:rows.filter(row=>row.status==='done').length,total:rows.length,unit:'files created'};
  const warningsFor=(row:ImportRow)=>!row.asNote?row.imageValid===false?['Image preview unavailable; original bytes kept.']:[]:(!session.folder||row.kind!=='markdown'||row.resolved)?row.warnings:[];
  const epoch=getConnection().epoch,pending=new Set<string>();let timer:ReturnType<typeof setTimeout>|undefined;
  const flush=()=>{clearTimeout(timer);timer=undefined;if(pending.size&&getConnection().epoch===epoch)notifyResourceChange({kind:'imported',ids:pending.size>100?[]:[...pending],workspaceId:journal.identity.id,generation:journal.identity.generation});pending.clear();};
  try{await runFolderImport(session,rows,journal,store,task.paused,phase=>{stage=phase;if(phase==='Resolving internal links')linking=true;task.update({phase,...progress(),warnings:rows.reduce((count,row)=>count+warningsFor(row).length,0),detail:rows.filter(row=>row.error).map(row=>`${row.path??row.file.name}: ${row.error}`).join('\n')});},resource=>{pending.add(resource.id);if(!timer)timer=setTimeout(flush,250);});}
  finally{flush();}
  task.update({...progress(),detail:[...rows.filter(row=>row.error).map(row=>`${row.path??row.file.name}: ${row.error}`),...rows.flatMap(row=>warningsFor(row).map(warning=>`${row.path??row.file.name}: ${warning}`))].join('\n').slice(0,12000)});
  return journal.complete;
 });
}
