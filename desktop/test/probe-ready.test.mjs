import {test} from 'node:test';
import assert from 'node:assert/strict';
import {probeReady} from '../src/probe-ready.mjs';
const reply=(status,value)=>({status,data:new TextEncoder().encode(JSON.stringify(value))});
test('maintenance handshake waits, preserving the read response',async()=>{
 let time=0,calls=0;
 const value=await probeReady(async()=>++calls<3?reply(409,{code:'WORKSPACE_BUSY'}):reply(200,{id:'same-workspace'}),{now:()=>time,pause:async ms=>{time+=ms;}});
 assert.equal(calls,3);assert.equal(value.id,'same-workspace');
});
test('maintenance timeout stays bounded and offers retry',async()=>{
 let time=0,calls=0;await assert.rejects(probeReady(async()=>{calls++;return reply(409,{code:'WORKSPACE_BUSY'});},{budget:500,now:()=>time,pause:async ms=>{time+=ms;}}),/maintenance.*Retry/);
 assert.equal(time,500);assert.equal(calls,4);
});
test('approval, arbitrary conflicts and transport failures never retry',async()=>{
 for(const status of [401,403,409,500]){let calls=0;await assert.rejects(probeReady(async()=>{calls++;return reply(status,{code:'OTHER'});}),/Server check failed/);assert.equal(calls,1);}
 await assert.rejects(probeReady(async()=>{throw new Error('Connection lost');}),/Connection lost/);
});
