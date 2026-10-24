import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {NativeChannel} from './native-channel.mjs';

const repository=fileURLToPath(new URL('../../../',import.meta.url));
test('bundled private host refuses all source publication paths after failed confinement experiment',async()=>{
  const directory=await mkdtemp(join(repository,'native/linked-markdown/.scratch/g3-refusal-'));
  await mkdir(join(directory,'private'));
  const channel=new NativeChannel({java:resolve(repository,'desktop/bundle/runtime/bin/java.exe'),classes:resolve(repository,'native/linked-markdown/build'),workspace:'g3-refusal',generation:'one',privateRoot:join(directory,'private/journal'),protectedRoot:join(directory,'private'),applicationRoot:resolve(repository,'desktop')});
  try {
    const ready=await channel.ready;assert.match(ready[0],/^25\./);
    await assert.rejects(channel.call('save','forged-document','forged-epoch','forged-candidate','forged-operation'),/G3_PUBLICATION_UNQUALIFIED/);
    await assert.rejects(channel.call('repair','forged-ticket','local'),/G3_PUBLICATION_UNQUALIFIED/);
    await assert.rejects(channel.call('restore','forged-ticket'),/G3_PUBLICATION_UNQUALIFIED/);
    const metrics=await channel.call('metrics');assert.ok(metrics.length>=9);
  } finally {await channel.close();}
  assert.equal(channel.closed,true);assert.equal(channel.pending.size,0);
  assert.ok(channel.validation.every(byte=>byte===0));assert.ok(channel.consent.every(byte=>byte===0));
});
