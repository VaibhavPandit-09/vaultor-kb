import type { CaptureItem } from './reviews';
import {
  defaultBrowse,
  normalizeBrowse,
  type BrowseConfig,
  type Destination,
} from './browse';

/** Presentation-only history; durable current-source sessions stay model-owned. */
export class BrowseMemory {
  private entries = new Map<string, BrowseConfig>();
  select(scope: string, current: BrowseConfig, destination: Destination) {
    const key = (d: Destination) => JSON.stringify([scope, d]);
    this.entries.delete(key(current.destination));
    this.entries.set(key(current.destination), normalizeBrowse(current));
    while (this.entries.size > 64)
      this.entries.delete(this.entries.keys().next().value!);
    return normalizeBrowse(
      destination === current.destination
        ? current
        : this.entries.get(key(destination)) ?? {
            ...defaultBrowse(),
            destination,
          },
    );
  }
}

/** Window space, not device identity, determines navigation placement. */
export function navigationLayout(
  width: number,
  height: number,
  fontScale: number,
) {
  return {
    rail: width >= 840 && height >= 480 && width / fontScale >= 720,
    // Preserve real hit space for destinations, source, disclosure and More.
    stacked: width < 360 || width / fontScale < 300,
  };
}

/** Never merge generations or same-named workspaces from different hosts. */
export function reviewGroups(items: CaptureItem[]) {
  const groups = new Map<
    string,
    { key: string; source: CaptureItem['source']; data: CaptureItem[] }
  >();
  for (const item of items) {
    const s = item.source;
    const key = JSON.stringify([s.hostId, s.workspaceId, s.generation]);
    let group = groups.get(key);
    if (!group) {
      group = { key, source: s, data: [] };
      groups.set(key, group);
    }
    group.data.push(item);
  }
  return [...groups.values()];
}
