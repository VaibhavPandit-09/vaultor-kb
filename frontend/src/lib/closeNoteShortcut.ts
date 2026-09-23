import { shortcutMatchesEvent } from './shortcuts';

/** Reserve only the configured close action before ProseMirror's delete fallback. */
export function registerCloseNoteShortcut(shortcut: string, close: () => Promise<void>) {
  let closing = false;
  const handle = async (event: KeyboardEvent) => {
    const target = event.target instanceof Element ? event.target : null;
    if (event.isComposing || event.defaultPrevented || document.fullscreenElement ||
      target?.closest('[role="dialog"]') || document.querySelector('[aria-modal="true"]') ||
      !shortcutMatchesEvent(shortcut, event)) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.repeat || closing) return;
    closing = true;
    try { await close(); }
    catch (error) { console.error('Could not close note', error); }
    finally { closing = false; }
  };
  window.addEventListener('keydown', handle, true);
  return () => window.removeEventListener('keydown', handle, true);
}
