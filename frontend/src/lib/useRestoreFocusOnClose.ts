import { useCallback, useRef } from 'react';
import type { Editor } from '@tiptap/react';
import { focusWithoutScroll } from './escape/escape';

export function useRestoreFocusOnClose(editor?: Editor | null) {
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const captureFocus = useCallback(() => {
    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  }, []);
  const restoreFocus = useCallback(() => {
    const previousFocus = previousFocusRef.current;
    // Wait only for React's removal/focus-containment cleanup, never for the visual exit.
    queueMicrotask(() => {
      if (!previousFocus?.isConnected) return;
      const view = previousFocus.closest<HTMLElement>('.ProseMirror');
      focusWithoutScroll(view ?? previousFocus);
      if (view && editor && !editor.isDestroyed && editor.view.dom === view) {
        editor.commands.focus(undefined, { scrollIntoView: false });
      }
    });
  }, [editor]);
  return { captureFocus, restoreFocus };
}
