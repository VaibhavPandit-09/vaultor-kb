import { bridgeMessage, scopeFor } from '../src/bridge';
describe('restricted editor messages', () => {
  test('reading context is bounded and belongs to the current editor load', () => {
    const message = (scroll: number, loadId = 'current') =>
      JSON.stringify({
        protocol: 1,
        type: 'position',
        loadId,
        position: { anchor: 2, head: 3, scroll },
      });
    expect(bridgeMessage(message(40), 'current')?.position).toEqual({
      anchor: 2,
      head: 3,
      scroll: 40,
    });
    expect(bridgeMessage(message(-1), 'current')).toBeNull();
    expect(bridgeMessage(message(10000001), 'current')).toBeNull();
    expect(bridgeMessage(message(40, 'old'), 'current')).toBeNull();
  });
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
