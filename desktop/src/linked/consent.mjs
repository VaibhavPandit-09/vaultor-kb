import {createHmac,randomUUID} from 'node:crypto';
import {win32} from 'node:path';
/** Main-process consent adapter. Paths and keys stay outside the renderer.
 * The callback is the owned Java host's private channel, never HTTP. */
export class RootConsent {
  constructor({current,picker,sendToOwnedHost,key}){this.current=current;this.picker=picker;this.send=sendToOwnedHost;this.key=key;this.pending=false;}
  context(request){
    if(!request||Object.keys(request).some(k=>!['token','workspace','generation'].includes(k)))throw new Error('Unexpected root request');
    const c=this.current();if(!c||c.kind!=='owned-local'||!c.mainFrame||request.token!==c.token||request.workspace!==c.workspace||request.generation!==c.generation)throw new Error('Local owner context required');return {...c};
  }
  async select(request){
    const before=this.context(request);if(this.pending)throw new Error('Picker already open');this.pending=true;
    try{
      const result=await this.picker({properties:['openDirectory']});if(result.canceled)return {outcome:'cancelled'};
      const after=this.context(request);if(before.epoch!==after.epoch)throw new Error('Owner epoch changed');
      if(result.filePaths.length!==1||!win32.isAbsolute(result.filePaths[0]))throw new Error('Invalid picker result');
      const selected=win32.normalize(result.filePaths[0]),nonce=randomUUID(),expires=Date.now()+55000;
      const payload=['G2-ROOT-1',before.workspace,before.generation,selected,nonce,String(expires)].join('\n');
      const proof=createHmac('sha256',this.key).update(payload).digest('hex');
      const root=await this.send({selected,nonce,expires,proof,workspace:before.workspace,generation:before.generation});
      this.context(request);if(this.current().epoch!==before.epoch)throw new Error('Owner epoch changed');
      return {outcome:'authorized',root}; // No native paths or signing key in renderer result.
    }finally{this.pending=false;}
  }
}
