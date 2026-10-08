import { OwnedServer } from '../../desktop/src/owned-server.mjs';
import { mkdtemp, writeFile, mkdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline';
import { randomUUID, createHash } from 'node:crypto';
process.env.HOST_NETWORK_PORT = '0';
const root = await mkdtemp(join(tmpdir(), 'vaultor-android-a1-'));
const owned = new OwnedServer({
  bundle:
    process.env.VAULTOR_BUILD_BUNDLE ??
    fileURLToPath(
      new URL('../../desktop/cache/release-0.7.1-bundle/', import.meta.url),
    ),
  data: join(root, 'data'),
});
async function api(path, method = 'GET', body) {
  for (let n = 0; n < 100; n++) {
    const r = await fetch(owned.address + '/api' + path, {
      method,
      headers: {
        'X-Vaultor-Owner': owned.accessKey,
        'X-Vaultor-Protocol': '3',
        ...(body && !(body instanceof FormData)
          ? { 'Content-Type': 'application/json' }
          : {}),
      },
      body:
        body instanceof FormData
          ? body
          : body
          ? JSON.stringify(body)
          : undefined,
    });
    if (r.status === 409) {
      await new Promise(resolve => setTimeout(resolve, 200));
      continue;
    }
    if (!r.ok) throw Error('Disposable host request failed: ' + r.status);
    const text = await r.text();
    return text ? JSON.parse(text) : null;
  }
  throw Error('Fixture maintenance exceeded bound');
}
try {
  await owned.start();
  const sharing = await api('/owner/sharing', 'PUT', { enabled: true });
  const paragraph = {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [
          {
            type: 'text',
            text: 'Emulator editing fixture. Original desktop JSON stays intact.',
          },
        ],
      },
    ],
  };
  const simple = await api('/resources', 'POST', {
    title: 'A1 Editor fixture',
    content: paragraph,
  });
  const linked=await api('/resources','POST',{title:'A3 Linked fixture',content:paragraph});
  const linkContent=(id,label)=>({type:'doc',content:[...paragraph.content,{type:'paragraph',content:[{type:'resourceLink',attrs:{resourceId:id,label,type:'note'}}]}]});
  await api('/resources/'+simple.id+'/note','PUT',{title:simple.title,content:linkContent(linked.id,linked.title)});
  await api('/resources/'+linked.id+'/note','PUT',{title:linked.title,content:linkContent(simple.id,simple.title)});
  await api('/resources', 'POST', {
    title: 'A1 Unsupported fixture',
    content: {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          attrs: { futureMobileAttribute: 'preserve' },
          content: [
            {
              type: 'text',
              text: 'Unsupported attribute: safe editing must be blocked.',
            },
          ],
        },
      ],
    },
  });
  const descriptor = {
    root,
    port: sharing.port,
    address: `https://127.0.0.1:${sharing.port}`,
    noteId: simple.id,
  };
  await mkdir(new URL('../cache/', import.meta.url), { recursive: true });
  await writeFile(
    new URL('../cache/fixture.json', import.meta.url),
    JSON.stringify(descriptor),
  );
  console.log(JSON.stringify({ fixtureReady: true, ...descriptor }));
  const input = createInterface({ input: process.stdin });
  for await (const line of input) {
    try {
      const command = JSON.parse(line);
      if (command.stop) break;
      if (command.dataset) {
        if (!['small', 'atlas'].includes(command.dataset))
          throw Error('Only marked Small/Atlas baselines allowed');
        const directory = new URL(
          command.dataset === 'small'
            ? '../../desktop/cache/atlas/small/'
            : '../../desktop/cache/atlas/',
          import.meta.url,
        );
        const manifest = JSON.parse(
          await readFile(new URL('manifest.json', directory), 'utf8'),
        );
        if (
          manifest.seed !== 'atlas-2026-10-v1' ||
          manifest.small !== (command.dataset === 'small')
        )
          throw Error('Baseline identity differs');
        const bytes = await readFile(new URL('baseline.zip', directory));
        if (
          createHash('sha256').update(bytes).digest('hex') !==
          manifest.archive.sha256
        )
          throw Error('Baseline checksum differs');
        const form = new FormData();
        form.set(
          'file',
          new Blob([bytes], { type: 'application/zip' }),
          'atlas-baseline.zip',
        );
        const preview = await api('/imports/preview', 'POST', form);
        const operation = await api(
          '/imports/' + preview.operation.id + '/commit',
          'POST',
          { mode: 'replace', confirmation: 'replace' },
        );
        let complete = false;
        for (let n = 0; n < 1200; n++) {
          const status = await api('/operations/' + operation.id);
          if (status.status === 'SUCCEEDED') {
            complete = true;
            break;
          }
          if (['FAILED', 'CANCELLED'].includes(status.status))
            throw Error('Fixture import failed');
          await new Promise(r => setTimeout(r, 250));
        }
        if (!complete) throw Error('Fixture import timed out');
        console.log(
          JSON.stringify({
            datasetReady: command.dataset,
            resources: manifest.resources.length,
          }),
        );
      }
      if (command.approve) {
        if (!/^[0-9]{6}$/.test(command.approve))
          throw Error('Invalid test comparison code');
        const pending = (await api('/owner/pairings')).find(
          p => p.code === command.approve && p.name === 'Vaultor Android',
        );
        if (!pending) throw Error('No matching disposable Android enrollment');
        await api('/owner/pairings/' + pending.id + '/approve', 'POST', {
          code: command.approve,
        });
        console.log('Matching disposable test code approved');
      }
      if (command.readNote) {
        const n = await api('/resources/' + simple.id);
        console.log(
          JSON.stringify({ noteRevision: n.revision, content: n.content }),
        );
      }
      if (command.editNote) {
        const n = await api('/resources/' + simple.id);
        await api('/resources/' + simple.id + '/note', 'PUT', {
          title: n.title,
          content: {
            type: 'doc',
            content: [
              {
                type: 'paragraph',
                content: [
                  {
                    type: 'text',
                    text: String(command.editNote).slice(0, 500),
                  },
                ],
              },
            ],
          },
        });
        console.log('Disposable foreign note edit committed');
      }
      if (command.trash) {
        const n = await api('/resources/' + simple.id);
        await api('/resources/lifecycle', 'PUT', [
          {
            operationId: randomUUID(),
            resourceId: simple.id,
            action: 'trash',
            revision: n.revision,
          },
        ]);
        console.log('Disposable note trashed');
      }
      if (command.revoke) {
        const devices = await api('/owner/devices');
        for (const d of devices.filter(v => v.name === 'Vaultor Android'))
          await api('/owner/devices/' + d.id, 'DELETE');
        console.log('Disposable Android approval revoked');
      }
    } catch (e) {
      console.log('Fixture action refused: ' + e.message);
    }
  }
} finally {
  await owned.stop();
}
