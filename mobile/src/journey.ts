import type { Position } from './workspace';
export type Visit = {
  id: string;
  title: string;
  position?: Position;
  unavailable?: boolean;
};
export type Journey = { visits: Visit[]; cursor: number };
export const emptyJourney = (): Journey => ({ visits: [], cursor: -1 });
export function normalizeJourney(value: unknown): Journey {
  const j = value as Journey | undefined;
  if (
    !Array.isArray(j?.visits) ||
    j.visits.length > 200 ||
    !Number.isInteger(j.cursor) ||
    j.cursor < -1 ||
    j.cursor >= j.visits.length
  )
    return emptyJourney();
  if (
    !j.visits.every(
      v =>
        /^[a-f0-9-]{36}$/i.test(v.id) &&
        typeof v.title === 'string' &&
        v.title.length <= 500,
    )
  )
    return emptyJourney();
  return {
    visits: j.visits.map(v => ({
      ...v,
      position:
        v.position &&
        [v.position.anchor, v.position.head, v.position.scroll].every(
          n => Number.isFinite(n) && n >= 0 && n <= 10000000,
        )
          ? {
              anchor: v.position.anchor,
              head: v.position.head,
              scroll: v.position.scroll,
              path:
                typeof v.position.path === 'string' &&
                /^\/\d+(?:\/\d+)*$/.test(v.position.path)
                  ? v.position.path
                  : undefined,
              offset:
                typeof v.position.offset === 'number' &&
                Number.isFinite(v.position.offset)
                  ? Math.max(-100000, Math.min(100000, v.position.offset))
                  : undefined,
              revision:
                typeof v.position.revision === 'string'
                  ? v.position.revision.slice(0, 200)
                  : undefined,
            }
          : undefined,
    })),
    cursor: j.cursor,
  };
}
export function advance(
  journey: Journey,
  visit: Visit,
  linked: boolean,
): Journey {
  if (!linked) return { visits: [visit], cursor: 0 };
  if (journey.visits[journey.cursor]?.id === visit.id) return journey;
  const visits = [...journey.visits.slice(0, journey.cursor + 1), visit].slice(
    -200,
  );
  return { visits, cursor: visits.length - 1 };
}
