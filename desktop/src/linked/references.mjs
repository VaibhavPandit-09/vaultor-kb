import {randomUUID} from 'node:crypto';
const uuid=value=>typeof value==='string'&&/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(value);
export function referenceDescriptor(resource,id){
  if(!uuid(id)||resource?.id!==id||resource.type!=='linked'||resource.trashedAt)throw Error('LINKED_REFERENCE_UNAVAILABLE');
  const ref=typeof resource.content==='string'?JSON.parse(resource.content):resource.content;
  if(!ref||Object.keys(ref).length!==5||ref.type!=='linkedDocument'||ref.version!==1||!uuid(ref.sourceId)||typeof ref.sourceName!=='string'||!ref.sourceName.trim()||ref.sourceName.length>255||/[\x00-\x1f/\\:]/.test(ref.sourceName))throw Error('LINKED_REFERENCE_INVALID');
  const path=ref.relativePath;if(typeof path!=='string'||!path.isWellFormed()||path.length>1000||!path.toLowerCase().match(/\.(md|markdown)$/))throw Error('LINKED_REFERENCE_INVALID');
  const parts=path.split('/');if(parts.length>32||parts.some(p=>!p||p==='.'||p==='..'||/[\\:\x00-\x1f<>"|*?]/.test(p)||/[. ]$/.test(p)||p.toLowerCase()==='.git'||p.toLowerCase().startsWith('.vaultor-recovery')))throw Error('LINKED_REFERENCE_INVALID');
  return {...ref};
}
export function linkedReferenceReader({transport,owner}){return async(request,id)=>{
  if(!uuid(id))throw Error('LINKED_REFERENCE_INVALID');await owner(request);const before=transport.active;
  const reply=await transport.request({token:request.token,id:randomUUID(),path:'/resources/'+id,method:'GET',headers:{},timeout:10000});
  await owner(request);if(transport.active!==before)throw Error('LINKED_OWNER_CHANGED');
  if(reply.status!==200||reply.data.byteLength>65536)throw Error('LINKED_REFERENCE_UNAVAILABLE');
  return referenceDescriptor(JSON.parse(Buffer.from(reply.data).toString('utf8')),id);
};}
