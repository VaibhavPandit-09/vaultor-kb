import {randomUUID} from 'node:crypto';
import {basename,relative,resolve,sep} from 'node:path';
import {NativeChannel} from './native-channel.mjs';
import {Validator} from './validator.mjs';
import {RootConsent} from '../../../native/linked-markdown/desktop-consent.mjs';

export const snapshot=fields=>({identity:fields[0],sha256:fields[1],metadata:fields[2],source:Buffer.from(fields[3],'base64').toString('utf8'),size:Number(fields[4])});
export class Controller {
  constructor(options){this.options=options;this.roots=new Map();this.documents=new Map();this.refreshes=new Map();this.context={kind:'owned-local',mainFrame:true,workspace:options.workspace,generation:options.generation,epoch:randomUUID(),token:randomUUID()};this.native=new NativeChannel(options);this.sequence=0;this.active=0;}
  check(request){
    if(this.closed||this.context.kind!=='owned-local'||!this.context.mainFrame||!request||Object.keys(request).some(k=>!['token','workspace','generation','epoch','id','operation','payload'].includes(k))||request.token!==this.context.token||request.epoch!==this.context.epoch||request.workspace!==this.context.workspace||request.generation!==this.context.generation)throw new Error('OWNER_CONTEXT_CHANGED');
    const sequence=Number(request.id);if(typeof request.id!=='string'||!Number.isSafeInteger(sequence)||String(sequence)!==request.id||sequence<=this.sequence)throw new Error('REQUEST_REPLAY_OR_LIMIT');
    if(this.active>=8)throw new Error('OWNER_BUSY');this.sequence=sequence;
  }
  confined(path){if(typeof path!=='string'||!path.isWellFormed())throw new Error('PATH_UNICODE_UNQUALIFIED');const target=resolve(path),fence=resolve(this.options.disposableRoot);if(!target.startsWith(fence+sep))throw new Error('DISPOSABLE_ROOT_REQUIRED');return target;}
  async selectRoot(){
    const consent=new RootConsent({current:()=>this.closed?null:this.context,key:this.native.consent,picker:async settings=>{const result=await this.options.dialog.showOpenDialog(this.options.window(),{...settings,title:'Gate 3: authorize disposable Markdown folder',defaultPath:this.options.defaultRoot});if(!result.canceled)result.filePaths=result.filePaths.map(path=>this.confined(path));return result;},sendToOwnedHost:async selection=>{const [root]=await this.native.call('root',selection.selected,selection.nonce,selection.expires,selection.proof);this.roots.set(root,selection.selected);return root;}});
    const result=await consent.select({token:this.context.token,workspace:this.context.workspace,generation:this.context.generation});return result;
  }
  async dispatch(request){
    this.check(request);this.active++;const epoch=this.context.epoch;
    try{
      const p=request.payload??{};let result;
      const allowed={authorize:[],open:['root'],journal:['document','version','draft','claimedSource','reading','sourceDraft','editorVersion'],source:['document','version','block','expected','text'],save:['document','version'],check:['document'],refresh:['document'],'commit-refresh':['ticket'],'abort-refresh':['ticket'],chunk:['document','offset'],close:['document'],revoke:['root'],recovery:[],inspect:['operation'],review:['operation','root'],repair:['ticket','choice'],restore:['ticket'],resolve:['ticket'],'open-recovery':['operation','root','validatedOnly'],export:['operation','choice'], 'export-disk':['ticket'],disconnect:['root'],reconnect:['root']}[request.operation];
      if(!allowed||Array.isArray(p)||Object.keys(p).some(key=>!allowed.includes(key)))throw new Error('INVALID_OPERATION_FIELDS');
      switch(request.operation){
        case 'authorize':if(Object.keys(p).length)throw new Error('NO_RENDERER_PATHS');result=await this.selectRoot();break;
        case 'open':{
          if(Object.keys(p).some(k=>k!=='root')||!this.roots.has(p.root)||this.documents.size>=8)throw new Error('ROOT_CAPABILITY_OR_LIMIT');
          const selection=await this.options.dialog.showOpenDialog(this.options.window(),{properties:['openFile'],title:'Open disposable Markdown document',defaultPath:this.roots.get(p.root),filters:[{name:'Markdown',extensions:['md']}]});
          if(selection.canceled)return {outcome:'cancelled'};if(this.closed||epoch!==this.context.epoch)throw new Error('OWNER_CONTEXT_CHANGED');
          const file=this.confined(selection.filePaths[0]),name=relative(this.roots.get(p.root),file).split(sep).join('/');
          const fields=await this.native.call('open',p.root,name),document=fields[0],documentEpoch=fields[1],base=snapshot(fields.slice(2));
          if(this.closed||epoch!==this.context.epoch){await this.native.call('close',document).catch(()=>{});throw new Error('OWNER_CONTEXT_CHANGED');}
          const existing=[...this.documents.values()].find(d=>d.root===p.root&&d.base.identity===base.identity&&d.relative===name);if(existing){await this.native.call('close',document);result={document:existing.document,epoch:existing.epoch,name:existing.name,base:existing.base,viewId:existing.sessionId,readonly:existing.readonly};break;}
          if(base.size>262144){this.documents.set(document,{document,epoch:documentEpoch,root:p.root,name:basename(file),relative:name,base,readonly:true});result={document,epoch:documentEpoch,name:basename(file),base,readonly:true};break;}
          const validator=new Validator(this.options.worker,Buffer.from(base.source,'utf8'));try{await validator.ready;if(this.closed||epoch!==this.context.epoch||!this.roots.has(p.root))throw new Error('OWNER_CONTEXT_CHANGED');}catch(error){await validator.close();await this.native.call('close',document).catch(()=>{});throw error;}
          const state={document,epoch:documentEpoch,root:p.root,name:basename(file),relative:name,base,validator,version:-1,busy:false,sessionId:randomUUID()};this.documents.set(document,state);result={document,epoch:documentEpoch,name:state.name,base,viewId:state.sessionId};break;
        }
        case 'journal':{
          if(Object.keys(p).some(k=>!['document','version','draft','claimedSource','reading','sourceDraft','editorVersion'].includes(k)))throw new Error('INVALID_EDIT_FIELDS');
          const d=this.documents.get(p.document);if(!d||d.readonly||d.busy||!Number.isSafeInteger(p.version)||p.version<=d.version)throw new Error('DOCUMENT_VERSION_OR_BUSY');d.version=p.version;d.candidate=undefined;d.busy=true;
          try{if(p.reading!==undefined&&Buffer.byteLength(JSON.stringify(p.reading))>65536)throw new Error('READING_STATE_LIMIT');const sessionMetadata={id:d.sessionId,name:d.originalName??d.name,reading:p.reading,sourceDraft:p.sourceDraft,editorVersion:p.editorVersion};let accepted;
            try{accepted=await d.validator.validate({...d,...p,sessionMetadata},this.native.validation);}catch(error){const visual=JSON.stringify({schema:'G3_VISUAL_1',document:p.draft,session:sessionMetadata});if(Buffer.byteLength(visual)>1024*1024)throw new Error('DRAFT_LIMIT');accepted={visual,reason:'VALIDATOR_FAILED_DRAFT_RETAINED'};}
            if(this.closed||epoch!==this.context.epoch)throw new Error('OWNER_CONTEXT_CHANGED');
            const [candidate]=await this.native.call('draft',d.document,d.epoch,p.version,accepted.visual,accepted.source?.toString('base64')??'-',accepted.proof??'-');d.candidate=candidate;d.validatedSource=accepted.sourceForReview??accepted.source?.toString('utf8');result={version:p.version,protected:true,validated:!!candidate,reason:accepted.reason};
          }finally{d.busy=false;}break;
        }
        case 'save':{
          if(Object.keys(p).some(k=>!['document','version'].includes(k)))throw new Error('NO_RAW_SOURCE_SAVE');const d=this.documents.get(p.document);if(!d||d.busy||p.version!==d.version||!d.candidate)throw new Error('UNVALIDATED_DRAFT');
          d.busy=true;const candidate=d.candidate;d.candidate=undefined;try{const r=await this.native.call('save',d.document,d.epoch,candidate,randomUUID());if(r[0]==='COMMITTED')d.base={...d.base,source:d.validatedSource,identity:r[2],sha256:r[3],metadata:r[4]};result={state:r[0],version:Number(r[1])};}finally{d.busy=false;}break;
        }
        case 'source':{
          const d=this.documents.get(p.document);if(!d||d.busy||d.version!==p.version||typeof d.validatedSource!=='string')throw new Error('SOURCE_REQUIRES_VALIDATED_DRAFT');d.candidate=undefined;d.busy=true;
          try{const region=await d.validator.request({type:'region',version:p.version,block:p.block,expected:p.expected});const applied=await d.validator.request({type:'source',version:p.version+1,token:region.token,text:p.text});if(!applied.result?.accepted)throw new Error('SOURCE_REFUSED');result={source:applied.result.source};}finally{d.busy=false;}break;
        }
        case 'check':{if(!this.documents.has(p.document))throw new Error('DOCUMENT_CAPABILITY');const r=await this.native.call('check',p.document);result={state:r[0],dirty:r[1]==='true',disk:r[2]?snapshot(r.slice(2)):null};break;}
        case 'refresh':{
          const d=this.documents.get(p.document);if(!d||d.busy||d.readonly||this.refreshes.size>=2||[...this.refreshes.values()].some(r=>r.old===d))throw new Error('DOCUMENT_BUSY_OR_READ_ONLY');d.busy=true;
          try{const checked=await this.native.call('check',d.document);if(checked[1]==='true'||!['UNCHANGED','EXTERNAL_CHANGED'].includes(checked[0])||checked[2]!==d.base.identity)throw new Error('DIRTY_OR_REPLACED_REOPEN_REQUIRED');
            const fields=await this.native.call('open',d.root,d.relative),base=snapshot(fields.slice(2));if(base.identity!==d.base.identity){await this.native.call('close',fields[0]);throw new Error('REPLACED_REOPEN_REQUIRED');}
            const validator=new Validator(this.options.worker,Buffer.from(base.source,'utf8'));try{await validator.ready;}catch(error){await validator.close();await this.native.call('close',fields[0]);throw error;}
            const ticket=randomUUID(),next={...d,document:fields[0],epoch:fields[1],base,validator,version:-1,candidate:undefined,busy:false};this.refreshes.set(ticket,{old:d,next,version:d.version});result={ticket,document:fields[0],epoch:fields[1],name:d.name,base,viewId:d.sessionId};
          }finally{d.busy=false;}break;
        }
        case 'abort-refresh':case 'commit-refresh':{
          const pending=this.refreshes.get(p.ticket);if(!pending)throw new Error('REFRESH_TICKET');this.refreshes.delete(p.ticket);
          try{
            if(request.operation==='commit-refresh'){
              if(this.documents.get(pending.old.document)!==pending.old||pending.old.busy||pending.old.version!==pending.version)throw new Error('REFRESH_SUPERSEDED');
              const checked=await this.native.call('check',pending.next.document);if(checked[0]!=='UNCHANGED')throw new Error('REFRESH_SOURCE_CHANGED');
              await this.native.call('close',pending.old.document);await pending.old.validator.close();this.documents.delete(pending.old.document);this.documents.set(pending.next.document,pending.next);result={committed:true};break;
            }
            result={aborted:true};
          }catch(error){await this.native.call('close',pending.next.document).catch(()=>{});await pending.next.validator.close();throw error;}
          await this.native.call('close',pending.next.document);await pending.next.validator.close();break;
        }
        case 'chunk':{const d=this.documents.get(p.document);if(!d||!d.readonly||!Number.isSafeInteger(p.offset)||p.offset<0)throw new Error('READ_ONLY_CHUNK');const r=await this.native.call('chunk',d.document,d.epoch,p.offset,65536);result={bytes:r[0]};break;}
        case 'close':{const d=this.documents.get(p.document);if(!d||d.busy)throw new Error('DOCUMENT_BUSY');await this.native.call('close',d.document);await d.validator?.close();this.documents.delete(d.document);result={closed:true};break;}
        case 'revoke':{if(!this.roots.has(p.root))throw new Error('ROOT_CAPABILITY');await this.native.call('revoke',p.root);this.roots.delete(p.root);for(const d of this.documents.values())if(d.root===p.root)d.candidate=undefined;result={revoked:true};break;}
        case 'recovery':{const r=await this.native.call('recovery');result=Array.from({length:r.length/4},(_,i)=>({operation:r[i*4],state:r[i*4+1],name:r[i*4+2],version:Number(r[i*4+3])}));break;}
        case 'inspect':{const r=await this.native.call('inspect',p.operation);result={base:Buffer.from(r[0],'base64').toString('utf8'),local:Buffer.from(r[1],'base64').toString('utf8'),visual:r[2],state:r[3]};break;}
        case 'review':{if(!this.roots.has(p.root))throw new Error('ROOT_CAPABILITY');const r=await this.native.call('review',p.operation,p.root);result={ticket:r[0],state:r[1],base:Buffer.from(r[2],'base64').toString('utf8'),local:Buffer.from(r[3],'base64').toString('utf8'),visual:r[4],disk:r[5]?snapshot(r.slice(5)):null};break;}
        case 'repair':{if(!['base','local'].includes(p.choice))throw new Error('RECOVERY_CHOICE');const r=await this.native.call('repair',p.ticket,p.choice);result={state:r[0]};break;}
        case 'restore':{const r=await this.native.call('restore',p.ticket);result={state:r[0]};break;}
        case 'export':{if(!['base','local','visual','captured','stage','external'].includes(p.choice))throw new Error('RECOVERY_CHOICE');const selection=await this.selectRoot();if(selection.outcome!=='authorized')return selection;const name=`recovered-${p.choice}-${randomUUID()}.md`;const [filename]=await this.native.call('export',p.operation,p.choice,selection.root,name);result={outcome:'exported',name:filename};break;}
        case 'export-disk':{const selection=await this.selectRoot();if(selection.outcome!=='authorized')return selection;const [filename]=await this.native.call('export-disk',p.ticket,selection.root,`recovered-disk-${randomUUID()}.md`);result={outcome:'exported',name:filename};break;}
        case 'resolve':{await this.native.call('resolve',p.ticket);result={state:'REVIEWED_EVIDENCE_REMOVED'};break;}
        case 'open-recovery':{
          if(!this.roots.has(p.root)||this.documents.size>=8)throw new Error('ROOT_CAPABILITY_OR_LIMIT');
          const r=await this.native.call('recover-open',p.operation,p.root),document=r[0],documentEpoch=r[1],base=snapshot(r.slice(2)),seed=Buffer.from(r[7],'base64').toString('utf8');let visual;
          try{visual=JSON.parse(r[8]);}catch{await this.native.call('close',document);throw new Error('VISUAL_DRAFT_EXPORT_ONLY');}
          const saved=visual?.schema==='G3_VISUAL_1'?visual:{document:visual,session:{}};const sessionId=/^[\da-f-]{36}$/.test(saved.session?.id??'')?saved.session.id:randomUUID();
          const validator=new Validator(this.options.worker,Buffer.from(seed,'utf8'));try{await validator.ready;}catch(error){await validator.close();await this.native.call('close',document);throw error;}
          const name=`Recovered ${saved.session?.name??'Markdown draft'}`;this.documents.set(document,{document,epoch:documentEpoch,root:p.root,name,base,validator,version:-1,busy:false,sessionId,recoveryOnly:r[9]==='true'});
          result={document,epoch:documentEpoch,name,base,seed,visual:p.validatedOnly?undefined:saved.document,viewId:sessionId,recoveryOnly:r[9]==='true',reading:saved.session?.reading};break;
        }
        case 'disconnect':case 'reconnect':{if(!this.roots.has(p.root))throw new Error('ROOT_CAPABILITY');await this.native.call(request.operation,p.root);result={state:request.operation==='disconnect'?'SOURCE_UNAVAILABLE':'REOPEN_REQUIRED'};break;}
        default:throw new Error('OPERATION_DENIED');
      }
      if(this.closed||epoch!==this.context.epoch)throw new Error('OWNER_CONTEXT_CHANGED');return result;
    }finally{this.active--;}
  }
  async close(){if(this.closed)return;this.closed=true;this.context={...this.context,epoch:randomUUID(),token:randomUUID()};await Promise.allSettled([...this.documents.values(),...[...this.refreshes.values()].map(r=>r.next)].map(d=>d.validator?.close()));this.documents.clear();this.refreshes.clear();this.roots.clear();await this.native.close();}
}
