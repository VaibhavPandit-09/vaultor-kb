import { useLayoutEffect, useRef, useState, type RefObject } from 'react';

/** Keep navigation bounds through loading; preserve scroll only for the same query/page. */
export function useBrowsePagination(viewport: RefObject<HTMLElement | null>, criteriaKey: string, page: number, loadedPages: number | undefined, enabled = true, visible = true) {
  const [known, setKnown] = useState({ key: criteriaKey, pages: loadedPages ?? 0 });
  if (loadedPages !== undefined && (known.key !== criteriaKey || known.pages !== loadedPages)) {
    setKnown({ key: criteriaKey, pages: loadedPages });
  }
  const position = useRef({ key: JSON.stringify([criteriaKey,page]), top: 0 });
  useLayoutEffect(() => {
    const element = viewport.current;
    if (!enabled || !element) return;
    const key = JSON.stringify([criteriaKey,page]);
    if (position.current.key !== key) position.current = { key, top: 0 };
    if (!visible) return;
    // eslint-disable-next-line react-hooks/immutability -- Imperative DOM scroll restoration; React props/ref identity stay unchanged.
    element.scrollTop = position.current.top;
    const remember = () => { position.current = { key, top: element.scrollTop }; };
    element.addEventListener('scroll', remember, { passive: true });
    return () => element.removeEventListener('scroll', remember);
  }, [criteriaKey, page, viewport, enabled, visible]);
  return loadedPages ?? (known.key === criteriaKey ? known.pages : 0);
}
