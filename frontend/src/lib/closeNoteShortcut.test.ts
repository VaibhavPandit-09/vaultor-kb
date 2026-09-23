// @vitest-environment jsdom
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { afterEach, expect, it, vi } from 'vitest';
import { shortcutMatchesEvent } from './shortcuts';
const editors: Editor[] = [];
afterEach(() => { editors.splice(0).forEach(editor => editor.destroy()); document.body.innerHTML = ''; });
function editor(content: string) {
  const element = document.createElement('div'); document.body.appendChild(element);
  const instance = new Editor({ element, extensions: [StarterKit], content }); editors.push(instance);
  instance.commands.setTextSelection(instance.state.doc.content.size - 1);
  return instance;
}
function closeKey() { return new KeyboardEvent('keydown', { key: 'Backspace', keyCode: 8, ctrlKey: true, shiftKey: true, bubbles: true, cancelable: true }); }
it('reproduces the old bubbling handler losing the shortcut for an empty note', () => {
  const note = editor('<p></p>'), close = vi.fn();
  const oldHandler = (event: KeyboardEvent) => { if (!event.defaultPrevented && shortcutMatchesEvent('Mod+Shift+Backspace', event)) close(); };
  window.addEventListener('keydown', oldHandler);
  try {
    const event = closeKey(); note.view.dom.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(close).not.toHaveBeenCalled();
    note.commands.setContent('<p>Text</p>'); note.commands.setTextSelection(5);
    note.view.dom.dispatchEvent(closeKey()); expect(close).toHaveBeenCalledOnce();
  } finally { window.removeEventListener('keydown', oldHandler); }
});
import { registerCloseNoteShortcut } from './closeNoteShortcut';
import { SaveCoordinator } from './saveCoordinator';

it('closes empty, populated and emptied notes before editor handling without changing content', async () => {
  const note = editor('<p></p>'), other = editor('<p>Other pane</p>');
  const close = vi.fn(async () => {}), stop = registerCloseNoteShortcut('Mod+Shift+Backspace', close);
  try {
    for (const content of ['<p></p>', '<p>Text</p>', '<p></p>']) {
      note.commands.setContent(content); note.commands.setTextSelection(note.state.doc.content.size - 1);
      const before = note.getJSON(), untouched = other.getJSON();
      note.view.dom.dispatchEvent(closeKey()); await Promise.resolve();
      expect(note.getJSON()).toEqual(before); expect(other.getJSON()).toEqual(untouched);
    }
    expect(close).toHaveBeenCalledTimes(3);
  } finally { stop(); }
});

it('respects custom bindings and leaves ordinary Backspace to the editor', async () => {
  const note = editor('<p>Text</p>'), close = vi.fn(async () => {});
  const stop = registerCloseNoteShortcut('Alt+W', close);
  const local = vi.fn(); note.view.dom.addEventListener('keydown', local);
  try {
    note.view.dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace', keyCode: 8, bubbles: true, cancelable: true }));
    expect(local).toHaveBeenCalledOnce(); expect(close).not.toHaveBeenCalled();
    note.view.dom.dispatchEvent(closeKey()); expect(close).not.toHaveBeenCalled();
    note.view.dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'w', altKey: true, bubbles: true, cancelable: true }));
    await Promise.resolve(); expect(close).toHaveBeenCalledOnce();
  } finally { stop(); }
});

it('does not close from a dialog, fullscreen, composition or a repeated key', () => {
  const note = editor('<p></p>'), close = vi.fn(async () => {}), stop = registerCloseNoteShortcut('Mod+Shift+Backspace', close);
  const dialog = document.createElement('div'); dialog.setAttribute('role', 'dialog'); document.body.appendChild(dialog);
  try {
    dialog.dispatchEvent(closeKey());
    Object.defineProperty(document, 'fullscreenElement', { configurable: true, value: note.view.dom });
    note.view.dom.dispatchEvent(closeKey()); Reflect.deleteProperty(document, 'fullscreenElement');
    for (const extra of [{ isComposing: true }, { repeat: true }]) note.view.dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace', keyCode: 8, ctrlKey: true, shiftKey: true, bubbles: true, cancelable: true, ...extra }));
    dialog.setAttribute('aria-modal', 'true'); note.view.dom.dispatchEvent(closeKey());
    expect(close).not.toHaveBeenCalled();
  } finally { stop(); Reflect.deleteProperty(document, 'fullscreenElement'); }
});

it('waits for saves, suppresses duplicate closes, and retains a failed draft for retry', async () => {
  const note = editor('<p></p>'); let fail = true, release!: () => void;
  const saves = new SaveCoordinator<string>(async () => { await new Promise<void>(resolve => { release = resolve; }); if (fail) throw new Error('offline'); }, () => {});
  saves.enqueue('active', 'latest draft', 100000);
  const closed: string[] = [];
  const close = vi.fn(async () => { try { await saves.flushAll(); } catch { return; } closed.push('active'); });
  const stop = registerCloseNoteShortcut('Mod+Shift+Backspace', close);
  try {
    note.view.dom.dispatchEvent(closeKey()); note.view.dom.dispatchEvent(closeKey());
    expect(closed).toEqual([]); expect(close).toHaveBeenCalledOnce(); release();
    await vi.waitFor(() => expect(saves.status('active')).toBe('failed'));
    expect(closed).toEqual([]); expect(saves.latest('active')).toBe('latest draft');
    fail = false; note.view.dom.dispatchEvent(closeKey()); release();
    await vi.waitFor(() => expect(closed).toEqual(['active'])); expect(saves.dirty()).toBe(false);
  } finally { stop(); saves.clear(); }
});
