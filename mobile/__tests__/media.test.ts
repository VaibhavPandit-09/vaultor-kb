import {
  MediaQueue,
  normalizePlacement,
  hasPlacement,
  type MediaInput,
  type MediaPort,
} from '../src/media';
const id = '00000000-0000-4000-8000-000000000001',
  second = '00000000-0000-4000-8000-000000000002';
function setup() {
  let source = {
    host: { hostId: 'h', epoch: 'e', address: 'https://127.0.0.1' },
    scope: 'scope',
    noteId: 'note',
    loadId: 'load',
    editable: true,
  };
  const calls: { action: string; input: any }[] = [],
    messages: any[] = [];
  let fail = false,
    protect = false;
  let queue: MediaQueue;
  const port: MediaPort = {
    current: () => source,
    call: async <T>(action: string, input: any) => {
      calls.push({ action, input });
      if (action === 'upload') {
        if (fail) throw Error('Uncertain upload');
        return { id: input.id, resourceId: input.id } as T;
      }
      return {} as T;
    },
    send: m => {
      messages.push(m);
      void queue.inserted((m as any).inputId, true);
    },
    protect: async () => {
      if (protect) throw Error('Storage failed');
    },
  };
  queue = new MediaQueue(port);
  const item: MediaInput = {
    id,
    title: 'image.png',
    bytes: 10,
    image: true,
    mime: 'image/png',
  };
  return {
    queue,
    item,
    calls,
    messages,
    setFail: (v: boolean) => {
      fail = v;
    },
    setProtect: (v: boolean) => {
      protect = v;
    },
    switch: () => {
      source = { ...source, loadId: 'other' };
    },
  };
}
test('ordered insertions use exact UUID and remove bytes only after protection', async () => {
  const s = setup();
  await s.queue.insert([s.item, { ...s.item, id: second }], 'anchor');
  expect(s.messages.map(m => m.resourceId)).toEqual([id, second]);
  expect(s.calls.map(v => v.action)).toEqual([
    'bind',
    'upload',
    'remove',
    'bind',
    'upload',
    'remove',
  ]);
});
test('uncertain retry preserves upload identity and does not insert twice', async () => {
  const s = setup();
  s.setFail(true);
  await expect(s.queue.insert([s.item], 'anchor')).rejects.toThrow('Uncertain');
  expect(s.messages).toHaveLength(0);
  s.setFail(false);
  await s.queue.insert([s.item], 'new anchor');
  expect(
    s.calls.filter(c => c.action === 'upload').map(c => c.input.id),
  ).toEqual([id, id]);
});
test('foreign note binding is refused before upload', async () => {
  const s = setup();
  await expect(
    s.queue.insert(
      [
        {
          ...s.item,
          binding: {
            hostId: 'h',
            scope: 'elsewhere',
            noteId: 'note',
            loadId: 'load',
            anchor: 'a',
          },
        },
      ],
      'a',
    ),
  ).rejects.toThrow('another source');
  expect(s.calls).toHaveLength(0);
});
test('source change during upload retains original without insertion', async () => {
  const s = setup();
  const work = s.queue.insert([s.item], 'a');
  s.switch();
  await expect(work).rejects.toThrow('Source changed');
  expect(s.messages).toHaveLength(0);
  expect(s.calls.some(c => c.action === 'remove')).toBe(false);
});
test('failed recovery write never removes pending bytes', async () => {
  const s = setup();
  s.setProtect(true);
  await expect(s.queue.insert([s.item], 'a')).rejects.toThrow('recovery');
  expect(s.messages).toHaveLength(1);
  expect(s.calls.some(c => c.action === 'remove')).toBe(false);
});
test('placement normalization bounds width and keeps captions separate from bytes', () => {
  expect(
    normalizePlacement({
      resourceId: id,
      width: 2,
      alignment: 'right',
      caption: 'caption',
    }),
  ).toEqual({
    resourceId: id,
    width: 20,
    alignment: 'right',
    alt: '',
    caption: 'caption',
  });
  expect(normalizePlacement({ width: 999 }).width).toBe(100);
});
test('a textual UUID is not mistaken for an existing placement',()=>{
  expect(hasPlacement({type:'doc',content:[{type:'text',text:id}]},id)).toBe(false);
  expect(hasPlacement({type:'doc',content:[{type:'image',attrs:{resourceId:id}}]},id)).toBe(true);
});
test('replacement acknowledgement protects edits before removing its pending input',async()=>{
  const s=setup();await s.queue.commit(id,{type:'mediaEdit',anchor:'placement',attrs:{resourceId:second}});
  expect(s.messages[0].type).toBe('mediaEdit');expect(s.calls.map(v=>v.action)).toEqual(['remove']);
});
