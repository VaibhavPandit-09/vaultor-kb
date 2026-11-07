/** A projection of Activity, not a task runner or persisted task registry. */
export function activityProgress(tasks){
 const running=tasks.filter(task=>task.state==='running'),attention=tasks.some(task=>task.state==='attention'),paused=tasks.some(task=>task.state==='paused');
 if(running.length){const measured=running.every(task=>Number.isFinite(task.done)&&Number.isFinite(task.total)&&task.total>0&&typeof task.unit==='string'&&task.unit.length>0&&task.done>=0&&task.done<=task.total)&&new Set(running.map(task=>task.unit??'unknown')).size===1;const value=measured?running.reduce((n,t)=>n+t.done,0)/running.reduce((n,t)=>n+t.total,0):2;return {value,mode:measured?(attention?'error':'normal'):'indeterminate'};}
 return attention?{value:1,mode:'error'}:paused?{value:1,mode:'paused'}:{value:-1,mode:'none'};
}
const validTask=task=>task&&typeof task.id==='string'&&task.id.length<=100&&typeof task.title==='string'&&task.title.length<=200&&typeof task.kind==='string'&&task.kind.length<=80&&typeof task.phase==='string'&&task.phase.length<=200&&(task.unit===undefined||typeof task.unit==='string'&&task.unit.length<=50)&&['running','paused','attention','complete'].includes(task.state)&&[task.done,task.total].every(value=>value===undefined||Number.isFinite(value)&&value>=0&&value<=1e12);
export class NativeActivity {
 constructor({owner,window,notification,now=Date.now}){Object.assign(this,{owner,window,notification,now});this.seen=new Map();this.notices=new Set();this.progress='';}
 update({token,tasks}){
  if(token!==this.owner()?.token)throw Error('Activity source changed');if(!Array.isArray(tasks)||tasks.length>200||tasks.some(task=>!validTask(task))||new Set(tasks.map(task=>task.id)).size!==tasks.length)throw Error('Invalid Activity snapshot');
  if(this.token!==token){this.reset();this.token=token;}
  const window=this.window(),progress=activityProgress(tasks),key=JSON.stringify(progress);if(key!==this.progress){this.progress=key;if(window&&!window.isDestroyed())window.setProgressBar(progress.value,{mode:progress.mode});}
  for(const task of tasks){const previous=this.seen.get(task.id),started=previous?.started??this.now();
   if(previous?.state==='running'&&task.state!=='running'&&task.state!=='paused'&&task.kind!=='workspace-preview'&&!/cancel/i.test(task.phase)&&(task.state==='attention'||this.now()-started>=30000)&&!(window?.isVisible()&&window?.isFocused()&&!window?.isMinimized())){
    try{const notice=this.notification({title:task.state==='attention'?'Vaultor needs attention':'Vaultor task complete',body:task.title,silent:true});notice?.on('click',()=>{if(this.owner()?.token!==token)return;const target=this.window();if(!target||target.isDestroyed())return;if(target.isMinimized())target.restore();target.show();target.focus();target.webContents.send('desktop:activity-open');});if(notice){this.notices.add(notice);notice.once?.('close',()=>this.notices.delete(notice));if(this.notices.size>50){const first=this.notices.values().next().value;try{first.close();}catch{}this.notices.delete(first);}}notice?.show();}catch{/* OS policy or unavailable notification service: in-app Activity remains actionable. */}
   }
   this.seen.set(task.id,{state:task.state,started:task.state==='running'&&previous?.state!=='running'?this.now():started});
  }
  for(const id of this.seen.keys())if(!tasks.some(task=>task.id===id))this.seen.delete(id);
 }
 reset(){for(const notice of this.notices){try{notice.close();}catch{}}this.notices.clear();const window=this.window();if(window&&!window.isDestroyed())window.setProgressBar(-1);this.seen.clear();this.progress='';this.token=undefined;}
}
