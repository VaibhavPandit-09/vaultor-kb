import {RootConsent} from '../desktop-consent.mjs';
const selected=Buffer.from(process.argv[2],'base64').toString('utf8');let proof;
const authority=new RootConsent({key:Buffer.alloc(32,1),current:()=>({kind:'owned-local',mainFrame:true,token:'test-token',epoch:'one',workspace:'workspace',generation:'generation'}),picker:async()=>({filePaths:[selected]}),sendToOwnedHost:async value=>{proof=value;return 'test-opaque';}});
await authority.select({token:'test-token',workspace:'workspace',generation:'generation'});
process.stdout.write([Buffer.from(proof.selected).toString('base64'),proof.nonce,String(proof.expires),proof.proof].join('\n')+'\n');
