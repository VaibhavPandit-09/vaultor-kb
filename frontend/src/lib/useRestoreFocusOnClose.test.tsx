// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, renderHook } from '@testing-library/react';
import { useRestoreFocusOnClose } from './useRestoreFocusOnClose';
import { registerFocusRestore } from './escape/escape';
afterEach(() => { cleanup(); document.body.innerHTML = ''; });
it('restores the captured pane in a microtask without a global editor or animation delay', async () => {
 const source = document.createElement('div'); source.className = 'ProseMirror'; source.tabIndex = 0; document.body.append(source); source.focus();
 const restore = vi.fn(); const unregister = registerFocusRestore(source, restore);
 const { result } = renderHook(() => useRestoreFocusOnClose()); result.current.captureFocus();
 const dialog = document.createElement('input'); document.body.append(dialog); dialog.focus();
 result.current.restoreFocus(); expect(document.activeElement).toBe(dialog); await Promise.resolve();
 expect(document.activeElement).toBe(source); expect(restore).toHaveBeenCalledOnce(); unregister();
});
it('preserves ordinary control focus and ignores disconnected sources', async () => {
 const source = document.createElement('button'); document.body.append(source); source.focus();
 const { result } = renderHook(() => useRestoreFocusOnClose()); result.current.captureFocus(); document.body.focus(); result.current.restoreFocus(); await Promise.resolve(); expect(document.activeElement).toBe(source);
 source.remove(); const other = document.createElement('input'); document.body.append(other); other.focus(); result.current.restoreFocus(); await Promise.resolve(); expect(document.activeElement).toBe(other);
});
