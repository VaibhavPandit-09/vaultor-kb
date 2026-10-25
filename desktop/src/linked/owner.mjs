import {randomUUID} from 'node:crypto';
/** Recheck the authenticated bundled host, never a renderer-supplied role. */
export function linkedOwner({transport,currentToken,status}){
  return async request=>{
    const before=transport.active,token=currentToken();
    if(!request||request.token!==token||!token||before?.token!==token||before.profile.source!=='bundled'||before.profile.kind!=='local'||status()!=='ready')throw Error('LINKED_LOCAL_OWNER_REQUIRED');
    const reply=await transport.request({token,id:randomUUID(),path:'/workspace/identity',method:'GET',headers:{},timeout:10000});
    if(transport.active!==before||currentToken()!==token||status()!=='ready')throw Error('LINKED_OWNER_CHANGED');
    if(reply.status!==200)throw Error('LINKED_HOST_UNAVAILABLE');
    const identity=JSON.parse(Buffer.from(reply.data).toString('utf8'));
    if(typeof identity.id!=='string'||typeof identity.generation!=='string'||!identity.id||!identity.generation||identity.id.length>100||identity.generation.length>100||identity.id!==request.workspace||identity.generation!==request.generation)throw Error('LINKED_WORKSPACE_CHANGED');
    return {kind:'owned-local',mainFrame:true,token,workspace:identity.id,generation:identity.generation,epoch:[token,identity.id,identity.generation].join(':')};
  };
}
