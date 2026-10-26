import {createHmac,randomUUID} from 'node:crypto';
import {win32,posix} from 'node:path';
const paths=process.platform==='darwin'?posix:win32;
/** Retained versions only, explicit OS dialog, one-use host-private proof.
 * Native CREATE_NEW is mandatory even when the dialog permits overwrite. */
export async function exportLinked(manager,request,p){
  const registry=manager.registry;registry.check(request);if(!['base','local','visual','disk','captured','stage','external'].includes(p.kind))throw Error('LINKED_EXPORT_KIND');
  if(p.document&&p.recoveryScope)throw Error('INVALID_LINKED_EXPORT_SCOPE');
  const target=manager.recoveryCatalog?await manager.recoveryCatalog.target(p.recoveryScope):{native:registry.native,scope:registry.scope};
  try{let operation=p.operation;
  if(p.document){const d=manager.documents.state(request,p.document,p.binding);if(d.busy||p.kind==='disk')throw Error('LINKED_EXPORT_BUSY');const found=await target.native.call('lookup-view',d.document);operation=found[1];}
  if(typeof operation!=='string'||!operation)throw Error('Protect this draft before exporting it.');
  if(['base','local','visual'].includes(p.kind))await target.native.call('inspect',operation);
  const result=await manager.options.saveDialog({title:'Export a separate linked-document copy',defaultPath:p.kind==='visual'?'visual-draft.json':'document-copy.md'});
  registry.check(request);if(result.canceled)return {outcome:'cancelled'};
  if(typeof result.filePath!=='string'||!paths.isAbsolute(result.filePath))throw Error('INVALID_EXPORT_SELECTION');
  const selected=paths.normalize(result.filePath),nonce=randomUUID(),expires=Date.now()+55000,scope=target.scope;
  const signature=createHmac('sha256',target.native.consent).update(['LINKED-EXPORT-1',scope.workspace,scope.generation,selected,operation,p.kind,nonce,expires].join('\n')).digest('hex');
  const [state]=await target.native.call('export-selected',operation,p.kind,selected,nonce,expires,signature);registry.check(request);return {outcome:state==='EXPORTED_NEW_FILE'?'saved':'recovery-required'};}finally{target.release?.();}
}
