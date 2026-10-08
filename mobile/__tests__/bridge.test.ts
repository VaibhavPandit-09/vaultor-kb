import { bridgeMessage, scopeFor } from '../src/bridge';
describe('restricted editor messages', () => {
  test('accepts only current document protocol messages', () => {
    expect(
      bridgeMessage(
        JSON.stringify({
          protocol: 1,
          type: 'changed',
          loadId: 'old',
          content: { type: 'doc' },
        }),
        'current',
      ),
    ).toBeNull();
    expect(
      bridgeMessage(JSON.stringify({ protocol: 2, type: 'ready' }), 'current'),
    ).toBeNull();
    expect(
      bridgeMessage(
        JSON.stringify({
          protocol: 1,
          type: 'changed',
          loadId: 'current',
          content: { type: 'doc' },
        }),
        'current',
      )?.type,
    ).toBe('changed');
  });
  test('rejects malformed, oversized and non-document payloads', () => {
    expect(bridgeMessage('{', 'x')).toBeNull();
    expect(bridgeMessage('x'.repeat(1500001), 'x')).toBeNull();
    expect(
      bridgeMessage(
        JSON.stringify({
          protocol: 1,
          type: 'changed',
          loadId: 'x',
          content: { type: 'paragraph' },
        }),
        'x',
      ),
    ).toBeNull();
    expect(
      bridgeMessage(
        JSON.stringify({ protocol: 1, type: 'fetch', path: '/owner/devices' }),
        'x',
      ),
    ).toBeNull();
  });
  test('scope separates hosts, workspace identities and generations', () => {
    const original = scopeFor('host', 'workspace', 'generation');
    expect(original).not.toBe(scopeFor('other', 'workspace', 'generation'));
    expect(original).not.toBe(scopeFor('host', 'other', 'generation'));
    expect(original).not.toBe(scopeFor('host', 'workspace', 'other'));
  });
});
