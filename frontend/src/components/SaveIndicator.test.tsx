// @vitest-environment jsdom
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import SaveIndicator from './SaveIndicator';
afterEach(cleanup);
it('exposes icon state and allows keyboard-accessible retry only on failure', () => {
  const retry = vi.fn();
  const { rerender } = render(<SaveIndicator status="saved" onRetry={retry} />);
  fireEvent.click(screen.getByRole('button', { name: 'All changes saved' }));
  expect(retry).not.toHaveBeenCalled();
  rerender(<SaveIndicator status="saving" onRetry={retry} />);
  expect(screen.getByRole('status').textContent).toBe('Saving…');
  rerender(<SaveIndicator status="failed" onRetry={retry} />);
  fireEvent.click(screen.getByRole('button', { name: 'Save failed — click to retry' }));
  expect(retry).toHaveBeenCalledOnce();
});
