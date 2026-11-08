import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {mkdtemp,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {NativeChannel} from '../src/linked/native-channel.mjs';
const bundle=resolve(process.env.VAULTOR_NATIVE_TEST_BUNDLE??fileURLToPath(new URL('../bundle',import.meta.url)));
const java=join(bundle,'runtime/bin',process.platform==='win32'?'java.exe':'java'),classes=join(bundle,'linked-files.jar');
test('real native journal ownership rejects duplicate hosts, preserves the owner and releases only on close',{skip:!['win32','darwin'].includes(process.platform)||!existsSync(java)||!existsSync(classes)},async()=>{
 const root=await mkdtemp(join(tmpdir(),'vaultor-d4-owner-'));for(const name of ['scope','managed','app'])await mkdir(join(root,name));
 const options={java,classes,workspace:'qualification',generation:'generation',privateRoot:join(root,'scope/journal'),protectedRoot:join(root,'managed'),applicationRoot:join(root,'app'),production:true};
 const owner=new NativeChannel(options);let duplicate,reopened;
 try{await owner.ready;duplicate=new NativeChannel(options);await assert.rejects(duplicate.ready,/JOURNAL_OWNER_LOCK/);assert.deepEqual(await owner.call('recovery'),[]);await owner.close();reopened=new NativeChannel(options);await reopened.ready;assert.deepEqual(await reopened.call('recovery'),[]);}finally{await duplicate?.close();await owner.close();await reopened?.close();}
});
