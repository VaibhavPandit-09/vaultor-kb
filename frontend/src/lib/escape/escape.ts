import { createContext, useContext, useEffect, useId, useRef } from 'react';

export const ESCAPE_PRIORITIES = {
  modal: 500,
  commandPalette: 400,
  popover: 300,
  inlineEditor: 200,
  editorFocus: 100,
} as const;

export type EscapeLayerRegistration = {
  id: string;
  priority: number;
  close: () => void;
};

export interface EscapeManagerValue {
  registerLayer: (layer: EscapeLayerRegistration) => () => void;
}

export const EscapeManagerContext = createContext<EscapeManagerValue | null>(null);

interface UseEscapeLayerOptions {
  active: boolean;
  close: () => void;
  priority: number;
  id?: string;
}

export function useEscapeLayer({ active, close, priority, id }: UseEscapeLayerOptions) {
  const context = useContext(EscapeManagerContext);
  const generatedId = useId();
  const layerId = id ?? generatedId;
  const closeRef = useRef(close);

  useEffect(() => {
    closeRef.current = close;
  }, [close]);

  useEffect(() => {
    if (!active) {
      return;
    }

    if (!context) {
      throw new Error('useEscapeLayer must be used within EscapeManagerProvider');
    }

    return context.registerLayer({
      id: layerId,
      priority,
      close: () => closeRef.current(),
    });
  }, [active, context, layerId, priority]);
}
