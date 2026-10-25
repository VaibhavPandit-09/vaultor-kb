import {createHmac,randomUUID} from 'node:crypto';
import {win32} from 'node:path';
/** Retained versions only, explicit OS dialog, one-use host-private proof.
 * Native CREATE_NEW is mandatory even when the dialog permits overwrite. */
export async function exportLinked(manager,request,p){
  const registry=manager.registry;registry.check(request);if(!['base','local','visual','disk'].includes(p.kind))throw Error('LINKED_EXPORT_KIND');
  let operation=p.operation;
  if(p.document){const d=manager.documents.state(request,p.document,p.binding);if(d.busy||p.kind==='disk')throw Error('LINKED_EXPORT_BUSY');const found=await registry.native.call('lookup-view',d.document);operation=found[1];}
  if(typeof operation!=='string'||!operation)throw Error('Protect this draft before exporting it.');
  if(p.kind!=='disk')await registry.native.call('inspect',operation);
  const result=await manager.options.saveDialog({title:'Export a separate linked-document copy',defaultPath:p.kind==='visual'?'visual-draft.json':'document-copy.md'});
  registry.check(request);if(result.canceled)return {outcome:'cancelled'};
  if(typeof result.filePath!=='string'||!win32.isAbsolute(result.filePath))throw Error('INVALID_EXPORT_SELECTION');
  const selected=win32.normalize(result.filePath),nonce=randomUUID(),expires=Date.now()+60000,scope=registry.scope;
  const signature=createHmac('sha256',registry.native.consent).update(['LINKED-EXPORT-1',scope.workspace,scope.generation,selected,operation,p.kind,nonce,expires].join('\n')).digest('hex');
  const [state]=await registry.native.call('export-selected',operation,p.kind,selected,nonce,expires,signature);registry.check(request);return {outcome:state==='EXPORTED_NEW_FILE'?'saved':'recovery-required'};
}
