// Existing updater verification/staging, for the guarded disposable install only.
import {readFile,mkdir,cp} from 'node:fs/promises';
import {resolve,dirname,join} from 'node:path';
import {releaseArtifacts} from './release-artifacts.mjs';
import {Updates} from '../src/updates.mjs';
const [profile,installer,currentVersion]=process.argv.slice(2);
if(!resolve(profile).includes('vaultor-oneclick-'))throw Error('Disposable update profile required');
const envelope=JSON.parse(await readFile(installer+'.vaultor.json','utf8'));
const trust=JSON.parse(await readFile(new URL('../release-trust.json',import.meta.url),'utf8'));
await releaseArtifacts(dirname(installer),envelope.manifest.appVersion,trust.publicKey,'win32');
const directory=join(profile,'updates');await mkdir(directory,{recursive:true});
const file=join(directory,envelope.manifest.filename);await cp(installer,file);
const updates=new Updates({directory,workspace:join(profile,'owned'),publicKey:trust.publicKey,currentVersion});
await updates.load();await updates.retain(file,envelope);
console.log('Original-key verified update staged for the real Updates UI.');
