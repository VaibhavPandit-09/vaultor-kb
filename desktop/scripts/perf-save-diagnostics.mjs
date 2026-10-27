// Test-process-only observation. Never retain arguments, IDs, paths or payloads.
const state = value => ['COMMITTED','CONFLICT','RECOVERY_REQUIRED','UNCHANGED'].includes(value) ? value : undefined;
export const errorCode = error => /^[A-Z][A-Z0-9_]{1,79}$/.test(error?.message ?? '') ? error.message : 'UNCLASSIFIED_ERROR';
export const saveFailureMessage = error => ['Timed out: Save receipt','Complete source preservation','Missing button: Save'].includes(error?.message) ? error.message : errorCode(error);
export function saveDiagnostics(manager, native) {
  const events=[],restore=[];let sequence=0,cursor=0;
  const wrap=(target,key,stage,operation)=>{
    const original=target[key];
    target[key]=function(...args){
      const name=operation(args);
      if(!name)return original.apply(this,args);
      const id=++sequence,record=(phase,extra={})=>{events.push({event:++cursor,stage,operation:name,sequence:id,phase,t:performance.now(),...extra});if(events.length>2000)events.shift();};
      const version=stage==='dispatch'&&Number.isSafeInteger(args[0]?.payload?.version)?args[0].payload.version:undefined;
      record('start',{version});
      return (async()=>{try{const result=await original.apply(this,args);record('end',{state:state(stage==='native'?result?.[0]:result?.state),...(stage==='dispatch'?{versionMatches:version===undefined?undefined:result?.version===version}:{}),...(stage==='native'&&name==='save'?{operationMatches:typeof args[4]==='string'?result?.[5]===args[4]:undefined}:{}),...(stage==='dispatch'&&name==='protect'?{validated:result?.validated===true,protected:result?.protected===true}:{}),...(result?.reason?{code:errorCode({message:result.reason})}:{})});return result;}catch(error){record('error',{code:errorCode(error)});throw error;}})();
    };
    restore.push(()=>{target[key]=original;});
  };
  wrap(manager,'dispatch','dispatch',args=>['save','protect'].includes(args[0]?.operation)?args[0].operation:null);
  wrap(native,'call','native',args=>['draft','save','ack-save'].includes(args[0])?args[0]:null);
  return {events,get cursor(){return cursor;},since:at=>events.filter(e=>e.event>at),truncatedSince:at=>!!events.length&&events[0].event>at+1,restore:()=>restore.reverse().forEach(fn=>fn())};
}

// Serialized into this benchmark's renderer; keep dependencies inside the function.
export function observeSaveUI(document) {
  const known=['Saved','Saving…','Recovery needed','Source unavailable','Checking edit…','Unsaved changes'];
  const states=[];let previous;
  const statuses=()=>[...document.querySelectorAll('[role="status"]')].map(e=>e.textContent).filter(t=>known.includes(t));
  const record=()=>{const status=statuses(),key=JSON.stringify(status);if(key!==previous){states.push({t:document.defaultView.performance.now(),statuses:status});if(states.length>32)states.shift();previous=key;}};
  const observer=new document.defaultView.MutationObserver(record);
  for(const element of document.querySelectorAll('[role="status"]'))if(known.includes(element.textContent))observer.observe(element,{childList:true,characterData:true,subtree:true});
  record();
  return {stop:()=>observer.disconnect(),snapshot:()=>{record();return {statuses:statuses(),transitions:states,alerts:document.querySelectorAll('[role="alert"]').length,saveButtons:[...document.querySelectorAll('button')].filter(b=>b.textContent.trim()==='Save').map(b=>({disabled:b.disabled,visible:!!b.getBoundingClientRect().width}))};}};
}

export async function saveFailureEvidence({context,readUI,readSource,expected,original,previousSaved,stages,traceTruncated}) {
  const ui=await readUI().catch(()=>({unavailable:true})),disk=await readSource().catch(()=>null);
  return {...context,ui,source:{readable:!!disk,expectedMatches:disk?disk.equals(Buffer.from(expected)):null,previousSavedMatches:disk?disk.equals(Buffer.from(previousSaved)):null,fixtureMatches:disk?disk.equals(Buffer.from(original)):null},stages,traceTruncated};
}
