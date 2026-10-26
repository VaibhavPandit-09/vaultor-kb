import {test} from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {restoreUpdateWindow,consumeUpdateReopen} from '../src/update-window.mjs';
import {mkdtemp,writeFile,utimes,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

function fixture({minimized=false,destroyed=false}={}) {
  const window=new EventEmitter(), calls=[];
  Object.assign(window,{isDestroyed:()=>destroyed,isMinimized:()=>minimized,
    restore:()=>calls.push('restore'),show:()=>calls.push('show'),focus:()=>calls.push('focus')});
  return {window,calls};
}
test('explicit update foregrounds the same window once, after ready',()=>{
  const {window,calls}=fixture({minimized:true});
  restoreUpdateWindow(window,['--background','--reopen-after-update']);
  assert.deepEqual(calls,[]);
  window.emit('ready-to-show'); window.emit('ready-to-show');
  assert.deepEqual(calls,['restore','show','focus']);
});
test('ordinary/background startup has no update visibility override',()=>{
  for(const args of [[],['--background']]) {
    const {window,calls}=fixture();restoreUpdateWindow(window,args);
    window.emit('ready-to-show');assert.deepEqual(calls,[]);
  }
});
test('an interrupted window lifecycle does not restore a destroyed window',()=>{
  const {window,calls}=fixture({destroyed:true});
  restoreUpdateWindow(window,['--reopen-after-update']);window.emit('ready-to-show');
  assert.deepEqual(calls,[]);
});
test('legacy updater completion opens only the matching version once',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'vaultor-update-window-'));
  const file=join(directory,'handoff-status.json'),options={platform:'win32',packaged:true};
  await writeFile(file,JSON.stringify({phase:'complete',version:'0.20.0'}));
  assert.equal(await consumeUpdateReopen(directory,'0.20.0',options),true);
  assert.equal(await consumeUpdateReopen(directory,'0.20.0',options),false);
  for(const [phase,version,age] of [['complete','0.19.1',0],['complete','0.20.0',700000],['error','0.20.0',0],['installing','0.20.0',0]]){
    await writeFile(file,JSON.stringify({phase,version}));await utimes(file,new Date(),new Date(Date.now()-age));
    assert.equal(await consumeUpdateReopen(directory,'0.20.0',options),false);
    if(phase!=='complete')assert.equal(JSON.parse(await readFile(file,'utf8')).phase,phase);
  }
});
