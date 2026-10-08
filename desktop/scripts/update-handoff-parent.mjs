// Disposable installer harness; no renderer IPC or production profile access.
import {readFile} from 'node:fs/promises';import {dirname,resolve} from 'node:path';
import {releaseArtifacts} from './release-artifacts.mjs';import {startUpdateHandoff} from '../src/update-handoff.mjs';
const [directory,executable,installer]=process.argv.slice(2);
if(!resolve(directory).includes('vaultor-oneclick-')||!resolve(executable).includes('vaultor-oneclick-'))throw new Error('Expected disposable handoff paths.');
const trust=JSON.parse(await readFile(new URL('../release-trust.json',import.meta.url),'utf8'));const envelope=JSON.parse(await readFile(installer+'.vaultor.json','utf8'));await releaseArtifacts(dirname(installer),envelope.manifest.appVersion,trust.publicKey,'win32');
await startUpdateHandoff({directory,executable,file:installer,manifest:envelope.manifest});console.log('Verified helper ready; parent exits before silent upgrade.');
