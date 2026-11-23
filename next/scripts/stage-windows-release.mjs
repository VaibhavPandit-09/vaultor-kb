import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {join, resolve} from 'node:path';

const root = resolve(import.meta.dirname, '../..');
const git = args => execFileSync('git', args, {cwd:root, encoding:'utf8'}).trim();
assert.equal(git(['status', '--porcelain']), '', 'Stage from the clean release source');
const sourceCommit = git(['rev-parse', 'HEAD']);
const {version} = JSON.parse(await readFile(join(root, 'next/package.json'), 'utf8'));
assert.match(version, /^\d+\.\d+\.\d+$/);
const target = join(root, 'next/src-tauri/target/release');
const build = join(target, 'bundle/nsis', 'Vaultor Next_'+version+'_x64-setup.exe');
const out = join(target, 'windows-assets', version);
const name = 'Vaultor-Next-'+version+'-windows-x64-setup.exe';
const tag = 'v'+version;
const [installer, signatureBytes] = await Promise.all([readFile(build), readFile(build+'.sig')]);
const signature = signatureBytes.toString('utf8').trim();
assert(signature.length > 100 && /^[A-Za-z0-9+/=]+$/.test(signature), 'Invalid Tauri signature file');
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const download = 'https://github.com/VaibhavPandit-09/vaultor-kb/releases/download/'+tag+'/'+name;
const manifest = {version, platforms:{'windows-x86_64':{signature,url:download}}};
await mkdir(out, {recursive:true});
await Promise.all([
  writeFile(join(out,name),installer),
  writeFile(join(out,name+'.sig'),signatureBytes),
  writeFile(join(out,'vaultor-next-windows-update.json'),JSON.stringify(manifest,null,2)+'\n'),
  writeFile(join(out,'windows-release-source.json'),JSON.stringify({version,tag,sourceCommit,installer:name,sha256:sha256(installer)},null,2)+'\n'),
]);
const checks = await Promise.all([name,name+'.sig','vaultor-next-windows-update.json','windows-release-source.json']
  .map(async file => sha256(await readFile(join(out,file)))+'  '+file));
await writeFile(join(out,'SHA256SUMS-Windows.txt'),checks.join('\n')+'\n');
console.log(JSON.stringify({version,tag,sourceCommit,installer:name,sha256:sha256(installer)}));
