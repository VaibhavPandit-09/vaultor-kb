import test from 'node:test';
import assert from 'node:assert/strict';
import { saveDiagnostics, errorCode, saveFailureMessage, saveFailureEvidence, observeSaveUI } from '../scripts/perf-save-diagnostics.mjs';

test('Save stage observation preserves results, arguments and durable receipt ordering without payloads',async()=>{
  const secret={operation:'save',payload:{document:'private-id',source:'PRIVATE CONTENT',path:'C:\\private\\source.md',token:'SECRET'}};
  const native={async call(command,...args){assert.equal(args[0],secret);return command==='save'?['COMMITTED','private-receipt']:[];}};
  const manager={async dispatch(request){assert.equal(request,secret);await native.call('save',request);await native.call('ack-save',request);return {state:'COMMITTED',operation:'private-receipt'};}};
  const original=manager.dispatch,diagnostics=saveDiagnostics(manager,native);
  try{
    assert.deepEqual(await manager.dispatch(secret),{state:'COMMITTED',operation:'private-receipt'});
    assert.deepEqual(diagnostics.events.map(e=>[e.stage,e.operation,e.phase,e.state]),[
      ['dispatch','save','start',undefined],['native','save','start',undefined],['native','save','end','COMMITTED'],
      ['native','ack-save','start',undefined],['native','ack-save','end',undefined],['dispatch','save','end','COMMITTED'],
    ]);
    assert.ok(diagnostics.events.every(e=>Number.isFinite(e.t)));
    assert.doesNotMatch(JSON.stringify(diagnostics.events),/private|PRIVATE|SECRET/);
  }finally{diagnostics.restore();}
  assert.equal(manager.dispatch,original);
});

test('failure evidence distinguishes saved bytes, unchanged prior bytes, mismatch and unavailable disk without claiming durability',async()=>{
  for(const [disk,expectedMatches,previousSavedMatches] of [['new',true,false],['prior',false,true],['unexpected',false,false],[null,null,null]]){
    const evidence=await saveFailureEvidence({context:{round:2,caseId:'tables-256',marker:'First',sample:0,clickReturned:true},readUI:async()=>({statuses:['Saving…']}),readSource:async()=>{if(disk===null)throw Error('C:\\private\\source.md');return Buffer.from(disk);},expected:'new',previousSaved:'prior',original:'original',stages:[]});
    assert.equal(evidence.source.expectedMatches,expectedMatches);
    assert.equal(evidence.source.previousSavedMatches,previousSavedMatches);
    assert.equal(evidence.source.readable,disk!==null);
    assert.equal(evidence.round,2);
    assert.doesNotMatch(JSON.stringify(evidence),/private|unexpected|original/);
    assert.equal(evidence.durable,undefined); // Only native/dispatch receipts establish this.
  }
  const absent=await saveFailureEvidence({context:{},readUI:async()=>{throw Error('gone');},readSource:async()=>null,expected:'',previousSaved:'',original:'',stages:[]});
  assert.deepEqual(absent.ui,{unavailable:true});
});

test('UI receipt probe retains a transient Saved state and redacts unrelated page text',()=>{
  let notify,disconnected=false,time=0;
  const label={textContent:'Unsaved changes'},privateLabel={textContent:'C:\\private\\source.md'},button={textContent:'Save',disabled:false,getBoundingClientRect:()=>({width:80})};
  const document={defaultView:{performance:{now:()=>++time},MutationObserver:class{constructor(callback){notify=callback;}observe(){}disconnect(){disconnected=true;}}},querySelectorAll:selector=>selector==='[role="status"]'?[label,privateLabel]:selector==='button'?[button]:[]};
  const probe=observeSaveUI(document);
  for(const text of ['Saving…','Saved','Unsaved changes']){label.textContent=text;notify();}
  const snapshot=probe.snapshot();
  assert.deepEqual(snapshot.transitions.map(e=>e.statuses),[['Unsaved changes'],['Saving…'],['Saved'],['Unsaved changes']]);
  assert.deepEqual(snapshot.saveButtons,[{disabled:false,visible:true}]);
  assert.doesNotMatch(JSON.stringify(snapshot),/private/);
  probe.stop();assert.equal(disconnected,true);
});

test('bounded stage history reports truncation and preserves a stable cursor',async()=>{
  const manager={async dispatch(){return {state:'COMMITTED'};}},native={call(){}};
  const diagnostics=saveDiagnostics(manager,native);
  try{
    const initial=diagnostics.cursor;
    for(let i=0;i<1002;i++)await manager.dispatch({operation:'save'});
    assert.equal(diagnostics.events.length,2000);
    assert.equal(diagnostics.truncatedSince(initial),true);
    const boundary=diagnostics.cursor;
    await manager.dispatch({operation:'save'});
    assert.equal(diagnostics.since(boundary).length,2);
    assert.equal(diagnostics.truncatedSince(boundary),false);
  }finally{diagnostics.restore();}
});

test('receipt version and operation matching are reported as booleans without retaining identifiers',async()=>{
  const manager={async dispatch(){return {state:'COMMITTED',version:4};}},native={async call(){return ['COMMITTED','4','','','','opaque-receipt'];}};
  const diagnostics=saveDiagnostics(manager,native);
  try{
    await manager.dispatch({operation:'save',payload:{version:4}});
    assert.equal(diagnostics.events.at(-1).versionMatches,true);
    await manager.dispatch({operation:'save',payload:{version:5}});
    assert.equal(diagnostics.events.at(-1).versionMatches,false);
    await native.call('save','private-document','epoch','private-candidate','opaque-receipt');
    assert.equal(diagnostics.events.at(-1).operationMatches,true);
    await native.call('save','private-document','epoch','private-candidate','different-receipt');
    assert.equal(diagnostics.events.at(-1).operationMatches,false);
    assert.doesNotMatch(JSON.stringify(diagnostics.events),/opaque|private|different-receipt/);
  }finally{diagnostics.restore();}
});

test('refusal and pending/failure stages stay explicit, with original errors rethrown and private messages redacted',async()=>{
  const failure=new Error('C:\\private\\file.md: SECRET');
  const manager={async dispatch(){return {protected:true,validated:false,reason:'VALIDATION_FAILED_DRAFT_RETAINED'};}};
  const native={async call(){throw failure;}};
  const diagnostics=saveDiagnostics(manager,native);
  try{
    await manager.dispatch({operation:'protect'});
    assert.equal(diagnostics.events.at(-1).validated,false);
    assert.equal(diagnostics.events.at(-1).code,'VALIDATION_FAILED_DRAFT_RETAINED');
    await assert.rejects(native.call('save'),error=>error===failure);
    assert.equal(diagnostics.events.at(-1).phase,'error');
    assert.equal(diagnostics.events.at(-1).code,'UNCLASSIFIED_ERROR');
    assert.doesNotMatch(JSON.stringify(diagnostics.events),/private|SECRET/);
    assert.equal(errorCode(new Error('NATIVE_TIMEOUT')),'NATIVE_TIMEOUT');
    assert.equal(saveFailureMessage(new Error('Timed out: Save receipt')),'Timed out: Save receipt');
    assert.equal(saveFailureMessage(failure),'UNCLASSIFIED_ERROR');
  }finally{diagnostics.restore();}
});

test('unobserved operations are unchanged and instrumentation never acknowledges a pending Save',async()=>{
  let complete;
  const pending=new Promise(resolve=>{complete=resolve;});
  const manager={dispatch(){return pending;}},native={call(){return pending;}};
  const diagnostics=saveDiagnostics(manager,native);
  try{
    assert.equal(manager.dispatch({operation:'index'}),pending);
    const save=manager.dispatch({operation:'save'});
    assert.deepEqual(diagnostics.events.map(e=>e.phase),['start']);
    complete({state:'RECOVERY_REQUIRED'});
    assert.deepEqual(await save,{state:'RECOVERY_REQUIRED'});
    assert.equal(diagnostics.events.at(-1).state,'RECOVERY_REQUIRED');
  }finally{diagnostics.restore();}
});
