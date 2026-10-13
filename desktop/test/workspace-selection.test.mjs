import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Profiles} from '../src/profiles.mjs';
import {connectionFetch} from '../src/network.mjs';
const id='11111111-1111-4111-8111-111111111111';
test('native scope overrides renderer headers for JSON, files, multipart and streams',async()=>{
 const original=global.fetch;const seen=[];global.fetch=async(url,options)=>{seen.push({url,options});return new Response('{}');};
 try{for(const path of ['/resources','/resources/id/download','/changes','/resources/imports/id'])await connectionFetch({profile:{kind:'local',address:'http://127.0.0.1:8080',selectedWorkspaceId:id}},path,{headers:{'x-vaultor-workspace':'wrong','Accept':'test'}});
 for(const row of seen){assert.equal(row.options.headers['X-Vaultor-Workspace'],id);assert.equal(row.options.headers['x-vaultor-workspace'],undefined);}
 await connectionFetch({profile:{kind:'local',address:'http://127.0.0.1:8080'}},'/resources',{headers:{'X-Vaultor-Workspace':id}});assert.equal(seen.at(-1).options.headers['X-Vaultor-Workspace'],undefined);
 }finally{global.fetch=original;}
});
test('explicit workspace survives profile restart separately from legacy metadata',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'vaultor-w2-profiles-'));try{const p=new Profiles(dir);await p.load();const host=await p.add({name:'Local',address:'http://127.0.0.1:8080'});await p.activate(host.id,id,id);const q=new Profiles(dir);await q.load();assert.equal(q.get(host.id).selectedWorkspaceId,id);assert.throws(()=>q.validate({...host,selectedWorkspaceId:'../escape'}));await q.activate(host.id,id);const legacy=new Profiles(dir);await legacy.load();assert.equal(legacy.get(host.id).selectedWorkspaceId,undefined);assert.equal(legacy.get(host.id).workspaceId,id);}finally{await rm(dir,{recursive:true,force:true});}
});
