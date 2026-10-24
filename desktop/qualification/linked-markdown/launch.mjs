import {mkdtemp,mkdir,writeFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {join,resolve,dirname} from 'node:path';
const here=dirname(fileURLToPath(import.meta.url)),repository=resolve(here,'../../..'),require=createRequire(new URL('../../package.json',import.meta.url));
const scratch=join(repository,'native','linked-markdown','.scratch');await mkdir(scratch,{recursive:true});
const directory=process.argv[2]?resolve(process.argv[2]):await mkdtemp(join(scratch,'gate3-desktop-'));
if(!process.argv[2]){await mkdir(join(directory,'source'));await mkdir(join(directory,'exports'));
await writeFile(join(directory,'gate3-disposable.marker'),'VAULTOR_G3_DISPOSABLE');
await writeFile(join(directory,'source','guide.md'),'---\r\ntitle: untouched\r\n---\r\n\r\n# Guide\r\n\r\nA **bold** paragraph with Unicode 😀 and [relative link](./other.md).\r\n\r\n<!-- keep exactly -->\r\n\r\n| A | B |\r\n| --- | --- |\r\n| one | two |\r\n');
await writeFile(join(directory,'source','other.md'),'# Other\n\nSecond document.\n');
await writeFile(join(directory,'source','large.md'),'Large source\n'+'x'.repeat(300000));
}
await writeFile(join(scratch,'latest-g3-desktop.txt'),directory);
const environment={...process.env,VAULTOR_LINKED_G3:'1',VAULTOR_G3_DIRECTORY:directory};delete environment.ELECTRON_RUN_AS_NODE;
console.log('Disposable Gate3 fixture: '+directory);
const child=spawn(require('electron'),[join(here,'main.mjs'),'--remote-debugging-port=9337'],{env:environment,windowsHide:false,stdio:'inherit'});
child.on('exit',code=>{process.exitCode=code??1;});child.on('error',error=>{console.error(error.message);process.exitCode=1;});
