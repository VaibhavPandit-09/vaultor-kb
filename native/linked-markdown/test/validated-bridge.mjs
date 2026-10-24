// Test bridge: run the actual bundled Markdown worker in a private Node worker.
// Signing keys arrive only on stdin, never argv/renderer. Not a public service.
import {Worker} from 'node:worker_threads';import {readdirSync} from 'node:fs';import {resolve} from 'node:path';import {createHmac,createHash} from 'node:crypto';
let input='';for await(const chunk of process.stdin)input+=chunk;const [original,document,epoch,identity,baseHash,metadata,key]=input.trim().split('\n');
const assets=resolve('frontend/node_modules/.cache/markdown-g1-build/assets');const file=readdirSync(assets).find(n=>n.startsWith('markdown.worker-'));
if(!file)throw new Error('Build the isolated G2 worker first');
const bootstrap=`const {parentPort,workerData}=require('node:worker_threads');globalThis.postMessage=value=>parentPort.postMessage(value);import(require('node:url').pathToFileURL(workerData.file).href).then(()=>parentPort.on('message',data=>globalThis.onmessage({data})));`;
const worker=new Worker(bootstrap,{eval:true,workerData:{file:resolve(assets,file)}});
const request=message=>new Promise((resolve,reject)=>{worker.once('message',resolve);worker.once('error',reject);worker.postMessage(message);});
try{
 const ready=await request({type:'open',bytes:Buffer.from(original,'base64'),byteLimit:262144});
 const rejected=structuredClone(ready.doc);rejected.content[0].content[0].marks=[{type:'underline'}];
 const refusal=await request({type:'edit',version:1,doc:rejected});if(refusal.result?.accepted!==false)throw new Error('Expected unsupported draft rejection');
 const intended=structuredClone(ready.doc);intended.content[0].content[0].text='Validated engine edit';const result=await request({type:'edit',version:2,doc:intended});
 if(!result.result?.accepted)throw new Error('Actual engine validation failed');const bytes=Buffer.from(result.result.source),hash=createHash('sha256').update(bytes).digest('hex');
 const visual=JSON.stringify(intended),visualHash=createHash('sha256').update(visual).digest('hex');
 const payload=['G2-VALIDATED-1',document,epoch,'2',identity,baseHash,metadata,hash,visualHash].join('\n'),proof=createHmac('sha256',Buffer.from(key,'base64')).update(payload).digest('hex');
 process.stdout.write([bytes.toString('base64'),proof,Buffer.from(JSON.stringify(rejected)).toString('base64'),Buffer.from(JSON.stringify(intended)).toString('base64')].join('\n')+'\n');
}finally{await worker.terminate();}
