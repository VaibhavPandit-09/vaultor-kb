// @vitest-environment jsdom
import { render, screen, cleanup } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import ErrorBoundary from './ErrorBoundary';
import { getLocalDiagnostics } from '../lib/diagnostics';
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
it('keeps sibling state mounted and reports a rendering error', () => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  function Broken(): never { throw new Error('deliberate region failure'); }
  render(<><input aria-label="draft" defaultValue="Keep this text" /><ErrorBoundary region="settings"><Broken /></ErrorBoundary></>);
  expect(screen.getByRole('alert').textContent).toContain('Unable to display settings');
  expect((screen.getByLabelText('draft') as HTMLInputElement).value).toBe('Keep this text');
  expect(getLocalDiagnostics().at(-1)?.action).toBe('render.settings');
});
