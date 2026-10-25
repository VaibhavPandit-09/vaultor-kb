import {Worker} from 'node:worker_threads';
import {createHash,createHmac} from 'node:crypto';

const hash=value=>createHash('sha256').update(value).digest('hex');
/** Independent host-owned copy of the actual engine. It reproduces transitions;
 * parsing arbitrary renderer replacement source is never sufficient authority. */
export class Validator {
  constructor(file,bytes){
    const bootstrap=`const {parentPort,workerData}=require('node:worker_threads');globalThis.postMessage=value=>parentPort.postMessage(value);import(require('node:url').pathToFileURL(workerData).href).then(()=>parentPort.on('message',data=>globalThis.onmessage({data})));`;
    this.worker=new Worker(bootstrap,{eval:true,workerData:file});this.busy=false;this.worker.on('exit',()=>this.cancel?.(new Error('VALIDATOR_EXIT')));this.ready=this.request({type:'open',bytes,byteLimit:262144});
  }
  request(message){
    if(this.closed||this.busy)return Promise.reject(new Error('VALIDATOR_BUSY_OR_CLOSED'));this.busy=true;
    return new Promise((resolve,reject)=>{
      const finish=(error,result)=>{clearTimeout(timer);this.worker.off('error',failed);this.worker.off('message',received);this.cancel=undefined;this.busy=false;if(error)reject(error);else resolve(result);};
      const failed=error=>finish(error),received=result=>finish(result.type==='error'?new Error(result.reason):null,result);
      const timer=setTimeout(()=>{finish(new Error('VALIDATOR_TIMEOUT'));void this.close();},15000);
      this.cancel=failed;this.worker.once('error',failed);this.worker.once('message',received);this.worker.postMessage(message);
    });
  }
  async validate({document,epoch,base,version,draft,claimedSource,sessionMetadata},key){
    await this.ready;const visual=JSON.stringify({schema:'G3_VISUAL_1',document:draft,session:sessionMetadata});if(Buffer.byteLength(visual)>1024*1024)throw new Error('DRAFT_LIMIT');
    const reply=await this.request({type:'edit',version,doc:draft});
    if(!reply.result?.accepted)return {visual,reason:reply.result?.reason??'VALIDATION_REFUSED'};
    if(claimedSource===undefined)return {visual,reason:'VISUAL_SOURCE_NOT_ADMITTED'};
    const source=Buffer.from(reply.result.source,'utf8');if(claimedSource!==undefined&&!source.equals(Buffer.from(claimedSource,'utf8')))return {visual,reason:'VALIDATOR_PROVENANCE_MISMATCH'};
    if(sessionMetadata?.sourceDraft!==undefined)return {visual,reason:'TARGETED_SOURCE_DRAFT_PENDING',sourceForReview:reply.result.source};
    const proof=createHmac('sha256',key).update(['G2-VALIDATED-1',document,epoch,version,base.identity,base.sha256,base.metadata,hash(source),hash(visual)].join('\n')).digest('hex');
    return {visual,source,proof};
  }
  async close(){this.closed=true;this.cancel?.(new Error('VALIDATOR_CLOSED'));await this.worker.terminate();}
}
