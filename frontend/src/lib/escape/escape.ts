import { createContext, useContext, useEffect, useId, useLayoutEffect, useRef } from 'react';

const focusRestoreRegistry = new WeakMap<HTMLElement, () => void>();

export const ESCAPE_PRIORITIES = {
  modal: 500,
  commandPalette: 400,
  preview: 350,
  popover: 300,
  inlineEditor: 200,
  editorFocus: 100,
} as const;

export type EscapeLayerRegistration = {
  id: string;
  priority: number;
  close: () => void;
  restoreFocus?: () => void;
};

export interface EscapeManagerValue {
  registerLayer: (layer: EscapeLayerRegistration) => () => void;
  getLastMeaningfulFocus: () => HTMLElement | null;
}

export const EscapeManagerContext = createContext<EscapeManagerValue | null>(null);

interface UseEscapeLayerOptions {
  active: boolean;
  close: () => void;
  priority: number;
  id?: string;
  restoreFocus?: () => void;
  restoreFocusOnEscape?: boolean;
}

function isMeaningfullyFocusable(element: Element | null): element is HTMLElement {
  if (!(element instanceof HTMLElement)) {
    return false;
  }

  return element.isContentEditable || element.tagName === 'TEXTAREA' || element.tagName === 'INPUT';
}

function focusWithoutScroll(element: HTMLElement | null) {
  if (!element?.isConnected) {
    return;
  }

  const restoreFocus = focusRestoreRegistry.get(element);
  if (restoreFocus) {
    restoreFocus();
    return;
  }

  element.focus({ preventScroll: true });
}

export function registerFocusRestore(element: HTMLElement, restoreFocus: () => void) {
  focusRestoreRegistry.set(element, restoreFocus);

  return () => {
    focusRestoreRegistry.delete(element);
  };
}

export function useEscapeLayer({
  active,
  close,
  priority,
  id,
  restoreFocus,
  restoreFocusOnEscape = true,
}: UseEscapeLayerOptions) {
  const context = useContext(EscapeManagerContext);
  const generatedId = useId();
  const layerId = id ?? generatedId;
  const closeRef = useRef(close);
  const restoreFocusRef = useRef(restoreFocus);
  const capturedFocusRef = useRef<HTMLElement | null>(null);
  const wasActiveRef = useRef(active);

  if (active && !wasActiveRef.current && context) {
    const activeElement = document.activeElement;
    capturedFocusRef.current =
      context.getLastMeaningfulFocus()
      ?? (isMeaningfullyFocusable(activeElement) ? activeElement : null);
  }

  useEffect(() => {
    closeRef.current = close;
  }, [close]);

  useEffect(() => {
    restoreFocusRef.current = restoreFocus;
  }, [restoreFocus]);

  useEffect(() => {
    wasActiveRef.current = active;
  }, [active]);

  useEffect(() => {
    if (!context || active) {
      return;
    }

    const syncCapturedFocus = () => {
      capturedFocusRef.current = context.getLastMeaningfulFocus();
    };

    syncCapturedFocus();
    window.addEventListener('focusin', syncCapturedFocus, true);
    return () => window.removeEventListener('focusin', syncCapturedFocus, true);
  }, [active, context]);

  useLayoutEffect(() => {
    if (!active) {
      return;
    }

    if (!context) {
      throw new Error('useEscapeLayer must be used within EscapeManagerProvider');
    }

    capturedFocusRef.current = capturedFocusRef.current
      ?? context.getLastMeaningfulFocus();

    return context.registerLayer({
      id: layerId,
      priority,
      close: () => closeRef.current(),
      restoreFocus: restoreFocusOnEscape
        ? () => {
            if (restoreFocusRef.current) {
              restoreFocusRef.current();
              return;
            }

            focusWithoutScroll(capturedFocusRef.current);
          }
        : undefined,
    });
  }, [active, context, layerId, priority, restoreFocusOnEscape]);
}
