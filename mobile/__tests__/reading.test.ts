import {
  normalizeReading,
  externalAddress,
  noteImages,
  mediaPosition,
} from '../src/reading';
import { advance, emptyJourney, normalizeJourney } from '../src/journey';
const a = '00000000-0000-4000-8000-000000000001',
  b = '00000000-0000-4000-8000-000000000002';
test('device appearance normalization and bounded typography', () => {
  expect(normalizeReading(undefined).theme).toBe('os');
  expect(
    normalizeReading({
      theme: 'oled',
      size: 99,
      spacing: 0,
      measure: Infinity,
    }),
  ).toMatchObject({ theme: 'oled', size: 28, spacing: 1.4, measure: 660 });
  expect(normalizeReading({ theme: 'evil', accent: 'evil' })).toMatchObject({
    theme: 'os',
    accent: 'blue',
  });
});
test('external links have an explicit safe HTTP boundary', () => {
  expect(externalAddress('https://example.com/path?q=x')).toBe(
    'https://example.com/path?q=x',
  );
  for (const u of [
    'javascript:alert(1)',
    'file:///etc/passwd',
    'intent://x',
    'https://user:password@example.com',
    'https://example.com/\nsecret',
  ])
    expect(externalAddress(u)).toBeUndefined();
});
test('gallery preserves original occurrence order, deduplicates and caps work', () => {
  const doc = {
    type: 'doc',
    content: [
      { type: 'image', attrs: { resourceId: a } },
      {
        type: 'paragraph',
        content: [{ type: 'image', attrs: { resourceId: b } }],
      },
      { type: 'image', attrs: { resourceId: a } },
    ],
  };
  expect(noteImages(doc)).toEqual([a, b]);
  expect(
    noteImages({
      type: 'doc',
      content: Array.from({ length: 200 }, (_, i) => ({
        type: 'image',
        attrs: {
          resourceId: '00000000-0000-4000-8000-' + String(i).padStart(12, '0'),
        },
      })),
    }),
  ).toHaveLength(128);
});
test('media restore cannot request impossible pages/zoom/offsets', () =>
  expect(mediaPosition({ page: 2.8, zoom: 900, x: NaN, y: -1 })).toEqual({
    page: 2,
    zoom: 4,
    x: 0,
    y: 0,
  }));
test('journey retains verified block offsets and independently records cycles up to 200', () => {
  let j = emptyJourney();
  for (let i = 0; i < 205; i++)
    j = advance(
      j,
      {
        id: i % 2 ? a : b,
        title: 'Visit',
        position: {
          anchor: 0,
          head: 0,
          scroll: i,
          path: '/1/0',
          offset: 20,
          revision: 'r1',
        },
      },
      true,
    );
  expect(j.visits).toHaveLength(200);
  expect(normalizeJourney(j).visits[199].position).toMatchObject({
    path: '/1/0',
    offset: 20,
    revision: 'r1',
  });
  const branched = advance(
    { ...j, cursor: 1 },
    { id: '00000000-0000-4000-8000-000000000003', title: 'Branch' },
    true,
  );
  expect(branched.visits).toHaveLength(3);
});
