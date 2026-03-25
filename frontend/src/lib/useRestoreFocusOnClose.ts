import { useCallback, useRef } from 'react';
import type { Editor } from '@tiptap/react';

type WindowWithEditor = typeof window & {
  __vaultor_editor?: Editor | null;
};

export function useRestoreFocusOnClose(editor?: Editor | null) {
  const previousFocusRef = useRef<HTMLElement | null>(null);

  const captureFocus = useCallback(() => {
    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  }, []);

  const restoreFocus = useCallback(() => {
    const previousFocus = previousFocusRef.current;

    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        if (!previousFocus?.isConnected) {
          return;
        }

        if (previousFocus.closest('.ProseMirror')) {
          const focusEditor = editor ?? (window as WindowWithEditor).__vaultor_editor;
          focusEditor?.commands.focus(undefined, { scrollIntoView: false });
          return;
        }

        previousFocus.focus({ preventScroll: true });
      });
    });
  }, [editor]);

  return { captureFocus, restoreFocus };
}
