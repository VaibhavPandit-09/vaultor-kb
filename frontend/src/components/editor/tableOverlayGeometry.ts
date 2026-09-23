export type Bounds = { top: number; left: number; right: number; bottom: number };

/** Intersect the viewport with every clipping ancestor, including a fullscreen editor. */
export function visibleEditorBounds(container: HTMLElement): Bounds {
  const bounds = { top: 0, left: 0, right: window.innerWidth, bottom: window.innerHeight };
  for (let node: HTMLElement | null = container; node; node = node.parentElement) {
    const style = getComputedStyle(node), rect = node.getBoundingClientRect();
    if (/(auto|scroll|hidden|clip)/.test(style.overflowY)) {
      bounds.top = Math.max(bounds.top, rect.top);
      bounds.bottom = Math.min(bounds.bottom, rect.bottom);
    }
    if (/(auto|scroll|hidden|clip)/.test(style.overflowX)) {
      bounds.left = Math.max(bounds.left, rect.left);
      bounds.right = Math.min(bounds.right, rect.right);
    }
    // Fullscreen is in the browser top layer; its former pane no longer clips it.
    if (node === document.fullscreenElement) break;
  }
  return bounds;
}

export function tableToolbarPosition(table: Bounds, pane: Bounds, width: number, height: number) {
  const top = Math.max(table.top, pane.top), bottom = Math.min(table.bottom, pane.bottom);
  const left = Math.max(table.left, pane.left), right = Math.min(table.right, pane.right);
  if (bottom - top < 12 || right <= left || pane.right - pane.left < 48) return null;
  const above = table.top - height - 24; // Leave space for column handles.
  return {
    top: above >= pane.top + 6 ? above : top + 6,
    left: Math.max(pane.left + 6, right - width - 6),
    maxWidth: Math.max(0, pane.right - pane.left - 12),
  };
}

export function tableOverlayHost(container: HTMLElement) {
  const full = document.fullscreenElement;
  return full?.contains(container) ? full : document.body;
}
