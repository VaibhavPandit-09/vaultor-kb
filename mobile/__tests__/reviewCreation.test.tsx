import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { NativeModules } from 'react-native';
import ReviewCapture from '../src/ReviewCapture';
import type { CaptureSeed } from '../src/reviews';
jest.mock('react-native', () => ({
  View: 'View',
  Text: 'Text',
  TextInput: 'TextInput',
  ScrollView: 'ScrollView',
  StyleSheet: { create: (v: any) => v },
  useWindowDimensions: () => ({ height: 800 }),
  findNodeHandle: () => 42,
  Keyboard: {
    isVisible: () => false,
    dismiss: jest.fn(),
    addListener: () => ({ remove() {} }),
  },
  AppState: {
    currentState: 'active',
    addEventListener: () => ({ remove() {} }),
  },
  Alert: { alert: jest.fn() },
  NativeEventEmitter: class {
    addListener() {
      return { remove() {} };
    }
  },
  NativeModules: { VaultorNative: { reviewCapture: jest.fn() } },
  Animated: {
    Value: class {
      setValue() {}
      interpolate() {
        return 0;
      }
    },
    View: 'AnimatedView',
    timing: () => ({ start: (cb: any) => cb?.({ finished: true }), stop() {} }),
  },
  Easing: { bezier: jest.fn() },
}));
jest.mock('../src/ui', () => ({
  useThemeStyles: (v: any) => v,
  usePalette: () => ({}),
  useReading: () => ({
    preferences: { motion: 'smooth', haptics: 'off' },
    reduced: true,
  }),
}));
jest.mock('../src/ContextSheet', () => ({
  __esModule: true,
  default: (p: any) => require('react').createElement('Sheet', p, p.children),
}));
jest.mock('../src/Action', () => ({
  Action: (p: any) => require('react').createElement('Action', p),
}));
jest.mock('../src/haptics', () => ({
  VaultorHaptics: {
    reject: jest.fn(),
    selectionSnap: jest.fn(),
    playAuthoredPattern: jest.fn(),
  },
}));
jest.mock('../src/captureTrace', () => ({
  claimCaptureTrace: () => undefined,
  recordTrace: jest.fn(),
}));
const native = NativeModules.VaultorNative.reviewCapture as jest.Mock;
let tree: ReactTestRenderer, row: any;
const seed = {} as CaptureSeed;
beforeEach(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  row = {
    id: 'same-uuid',
    version: 0,
    state: 'draft',
    body: {
      comment: '',
      quote: 'evidence',
      context: 'context',
      locator: { kind: 'resource' },
    },
    source: {
      targetTitle: 'Fixture',
      workspaceName: 'Source',
      address: '',
      baseRevision: 'r1',
    },
  };
  native
    .mockReset()
    .mockImplementation(async (action: string, input: string) => {
      const a = JSON.parse(input);
      if (action === 'put') {
        row = {
          ...row,
          version: row.version + 1,
          body: { ...row.body, comment: a.comment },
        };
      }
      if (action === 'queue') {
        if (!row.body.comment.trim()) throw Error('Comment required');
        row = { ...row, version: row.version + 1, state: 'queued' };
      }
      return JSON.stringify(action === 'list' ? [row] : row);
    });
});
afterEach(async () => {
  await act(async () => tree?.unmount());
});
async function mount(props: any = { seed }) {
  await act(async () => {
    tree = create(<ReviewCapture {...props} close={jest.fn()} />);
  });
}
const sheet = () => tree.root.findByType('Sheet' as any);
const comment = () => tree.root.findByType('TextInput' as any);
test('Flag opens an incomplete protected draft; one Create queues the same identity and complete comment', async () => {
  await mount();
  expect(sheet().props.primaryAction.label).toBe('Create Review');
  expect(sheet().props.primaryAction.disabled).toBe(true);
  expect(native.mock.calls.map(v => v[0])).not.toContain('queue');
  await act(async () => comment().props.onChangeText('A completed concern'));
  await act(async () => sheet().props.primaryAction.onPress());
  expect(row.state).toBe('queued');
  expect(row.id).toBe('same-uuid');
  expect(row.body.comment).toBe('A completed concern');
  expect(native.mock.calls.filter(v => v[0] === 'queue')).toHaveLength(1);
  expect(sheet().props.primaryAction).toBeUndefined();
});
test('dismissing a protected draft never publishes it; reopening has one explicit completion action', async () => {
  await mount();
  await act(async () => comment().props.onChangeText('Still composing'));
  await act(async () => sheet().props.close());
  expect(row.state).toBe('draft');
  expect(native.mock.calls.map(v => v[0])).not.toContain('queue');
  await act(async () => tree.unmount());
  await mount({ initialId: row.id });
  expect(comment().props.value).toBe('Still composing');
  await act(async () => sheet().props.primaryAction.onPress());
  expect(row.state).toBe('queued');
});
test('failed draft protection cannot queue stale or partial text', async () => {
  await mount();
  native.mockImplementation(async (action: string) => {
    if (action === 'put') throw Error('Storage unavailable');
    return JSON.stringify(row);
  });
  await act(async () => comment().props.onChangeText('Not yet protected'));
  await act(async () => sheet().props.primaryAction.onPress());
  expect(row.state).toBe('draft');
  expect(row.body.comment).toBe('');
  expect(native.mock.calls.map(v => v[0])).not.toContain('queue');
});
