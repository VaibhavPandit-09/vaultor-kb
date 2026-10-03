// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { getDefaultShortcut, resolveShortcutBindings, validateShortcutBinding, shortcutMatchesEvent } from './shortcuts';
afterEach(() => vi.restoreAllMocks());
it('migrates the old sidebar default but preserves other custom bindings', () => {
  expect(getDefaultShortcut('toggleSidebar', 'windows')).toBe('Mod+Alt+B');
  expect(getDefaultShortcut('toggleSidebar', 'mac')).toBe('Mod+Alt+B');
  expect(resolveShortcutBindings({ toggleSidebar: { windows: 'Ctrl+B' } }, 'windows').toggleSidebar).toBe('Mod+Alt+B');
  expect(resolveShortcutBindings({ toggleSidebar: { windows: 'Mod+Alt+S' } }, 'windows').toggleSidebar).toBe('Mod+Alt+S');
  const bindings = resolveShortcutBindings(null, 'windows');
  expect(validateShortcutBinding('toggleSidebar', 'Mod+B', bindings)).toContain('Bold or Quote');
  expect(validateShortcutBinding('toggleSidebar', 'Mod+Shift+B', bindings)).toContain('Bold or Quote');
  expect(validateShortcutBinding('toggleSidebar', 'Mod+Alt+B', bindings)).toBeNull();
});
it('does not consume editor Bold/Quote, and sidebar default bubbles from a focused editor', () => {
  const editor = new Editor({ extensions: [StarterKit], content: '<p>hello</p>' });
  document.body.appendChild(editor.view.dom);
  let toggled = 0;
  const binding = getDefaultShortcut('toggleSidebar');
  const handle = (event: KeyboardEvent) => { if (!event.defaultPrevented && shortcutMatchesEvent(binding, event)) { event.preventDefault(); toggled++; } };
  window.addEventListener('keydown', handle);
  try {
    editor.commands.setTextSelection({ from: 1, to: 6 }); editor.view.dom.focus();
    editor.view.dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'b', code: 'KeyB', ctrlKey: true, bubbles: true, cancelable: true }));
    expect(editor.isActive('bold')).toBe(true); expect(toggled).toBe(0);
    editor.view.dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'b', code: 'KeyB', ctrlKey: true, shiftKey: true, bubbles: true, cancelable: true }));
    expect(editor.isActive('blockquote')).toBe(true); expect(toggled).toBe(0);
    editor.view.dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'b', code: 'KeyB', ctrlKey: true, altKey: true, bubbles: true, cancelable: true }));
    expect(toggled).toBe(1); expect(editor.isActive('bold')).toBe(true);
  } finally { window.removeEventListener('keydown', handle); editor.destroy(); }
});
it('matches Cmd+Option+B when macOS reports an Option-produced character', async () => {
  vi.resetModules(); vi.spyOn(navigator, 'platform', 'get').mockReturnValue('MacIntel');
  const shortcuts = await import('./shortcuts');
  expect(shortcuts.shortcutMatchesEvent('Mod+Alt+B', new KeyboardEvent('keydown', { key: '∫', code: 'KeyB', metaKey: true, altKey: true }))).toBe(true);
  expect(shortcuts.shortcutMatchesEvent('Mod+B', new KeyboardEvent('keydown', { key: 'b', metaKey: true, altKey: true }))).toBe(false);
});
