import { useCallback, useEffect, useMemo, useRef, type ReactNode } from 'react';
import { EscapeManagerContext, type EscapeLayerRegistration, type EscapeManagerValue } from './escape';

type EscapeLayerRecord = EscapeLayerRegistration & {
  order: number;
};

function sortLayers(layers: EscapeLayerRecord[]) {
  return [...layers].sort((a, b) => {
    if (a.priority !== b.priority) {
      return a.priority - b.priority;
    }

    return a.order - b.order;
  });
}

export function EscapeManagerProvider({ children }: { children: ReactNode }) {
  const layersRef = useRef<EscapeLayerRecord[]>([]);
  const orderRef = useRef(0);

  const registerLayer = useCallback((layer: EscapeLayerRegistration) => {
    const nextRecord: EscapeLayerRecord = {
      ...layer,
      order: orderRef.current++,
    };

    layersRef.current = sortLayers([
      ...layersRef.current.filter((entry) => entry.id !== layer.id),
      nextRecord,
    ]);

    return () => {
      layersRef.current = layersRef.current.filter((entry) => entry.id !== layer.id);
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.repeat || event.isComposing) {
        return;
      }

      const topLayer = layersRef.current[layersRef.current.length - 1];
      if (!topLayer) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      topLayer.close();
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, []);

  const value = useMemo<EscapeManagerValue>(() => ({
    registerLayer,
  }), [registerLayer]);

  return <EscapeManagerContext.Provider value={value}>{children}</EscapeManagerContext.Provider>;
}
