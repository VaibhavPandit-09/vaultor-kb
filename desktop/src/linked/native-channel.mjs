import {linkedPublicError} from './errors.mjs';
import {dirname,join} from 'node:path';
import {spawn} from 'node:child_process';
import {randomBytes} from 'node:crypto';

const encode=values=>values.map(value=>Buffer.from(String(value),'utf8').toString('base64')).join('\t')+'\n';
const decode=line=>line.split('\t').map(value=>Buffer.from(value,'base64').toString('utf8'));
/** Private inherited pipes only. Every process has fresh keys and sequence space. */
export class NativeChannel {
  constructor({java,classes,workspace,generation,privateRoot,protectedRoot,applicationRoot,production=false,protectedPaths=[]}){
    if(typeof production!=='boolean'||!Array.isArray(protectedPaths)||protectedPaths.length>8||protectedPaths.some(path=>typeof path!=='string'))throw new Error('INVALID_NATIVE_CONFIGURATION');
    this.validation=randomBytes(32);this.consent=randomBytes(32);this.sequence=0;this.pending=new Map();this.buffer='';
    const env={...process.env};for(const key of Object.keys(env))if(['JAVA_TOOL_OPTIONS','JDK_JAVA_OPTIONS','_JAVA_OPTIONS','CLASSPATH'].includes(key.toUpperCase()))delete env[key];
    this.child=spawn(java,['-Xmx128m',...(process.platform==='darwin'?['-Dvaultor.linked.library='+join(classes.endsWith('.jar')?dirname(classes):classes,'libvaultor-files.dylib')]:[]),'--enable-native-access=ALL-UNNAMED','-cp',classes,production?'vaultor.linked.LinkedHost':'vaultor.linked.PrivateHost'],{windowsHide:true,env,stdio:['pipe','pipe','pipe']});
    this.ready=new Promise((resolve,reject)=>this.pending.set(0,{resolve,reject,timer:setTimeout(()=>this.fail(new Error('NATIVE_START_TIMEOUT')),30000)}));
    this.child.stdout.setEncoding('utf8');this.child.stdout.on('data',chunk=>{
      this.buffer+=chunk;if(this.buffer.length>6*1024*1024)return this.fail(new Error('NATIVE_FRAME_LIMIT'));
      let end;while((end=this.buffer.indexOf('\n'))>=0){const fields=decode(this.buffer.slice(0,end).replace(/\r$/,''));this.buffer=this.buffer.slice(end+1);const id=Number(fields.shift()),pending=this.pending.get(id);if(!pending)return this.fail(new Error('NATIVE_SEQUENCE'));this.pending.delete(id);clearTimeout(pending.timer);if(fields[0]==='ERROR')pending.reject(linkedPublicError(new Error(fields[1])));else pending.resolve(fields.slice(1));}
    });
    this.child.stderr.on('data',()=>{this.nativeDiagnostics=(this.nativeDiagnostics??0)+1;}); // Never forward payloads/credentials.
    this.child.on('error',error=>this.fail(error));this.child.on('exit',()=>this.fail(new Error('NATIVE_HOST_CLOSED')));
    this.child.stdin.on('error',error=>this.fail(error));
    this.child.stdin.write(encode(['INIT-G3',workspace,generation,privateRoot,protectedRoot,this.validation.toString('base64'),this.consent.toString('base64'),applicationRoot,...protectedPaths]));
  }
  async call(command,...fields){
    await this.ready;if(this.closed||this.pending.size>=16)throw new Error('NATIVE_BUSY_OR_CLOSED');
    const id=++this.sequence,frame=encode([id,command,...fields]);if(Buffer.byteLength(frame)>6*1024*1024)throw new Error('NATIVE_FRAME_LIMIT');
    return new Promise((resolve,reject)=>{const timer=setTimeout(()=>this.fail(new Error('NATIVE_TIMEOUT')),30000);this.pending.set(id,{resolve,reject,timer});this.child.stdin.write(frame);});
  }
  fail(error){if(this.closed)return;this.closed=true;for(const pending of this.pending.values()){clearTimeout(pending.timer);pending.reject(error);}this.pending.clear();this.validation.fill(0);this.consent.fill(0);this.child.kill();}
  async close(){
    if(this.child.exitCode!==null||this.child.signalCode!==null)return;
    let timer;const exited=new Promise(resolve=>this.child.once('exit',resolve));
    const shutdown=(async()=>{if(!this.closed)try{await this.call('quit');}finally{this.fail(new Error('NATIVE_HOST_CLOSED'));}await exited;})();
    try{await Promise.race([shutdown,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('NATIVE_CLOSE_TIMEOUT')),3000);})]);}finally{clearTimeout(timer);this.fail(new Error('NATIVE_HOST_CLOSED'));}
  }
}
