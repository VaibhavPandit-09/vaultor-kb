/** Preserve the first visible document block while pane widths reflow text. */
export function capturePaneReadingAnchors(root: HTMLElement) {
 const anchors: { viewport: HTMLElement; block: HTMLElement; header: HTMLElement | null; offset: number }[] = [];
 for (const viewport of root.querySelectorAll<HTMLElement>('.journey-viewport')) {
  if (!viewport.clientHeight || !viewport.clientWidth) continue;
  const bounds = viewport.getBoundingClientRect(), top = bounds.top;
  const scale = bounds.height / viewport.clientHeight || 1;
  const header = viewport.querySelector<HTMLElement>('.note-orientation');
  const edge = top + (header?.getBoundingClientRect().height ?? 0);
  const block = [...viewport.querySelectorAll<HTMLElement>('.ProseMirror > *')].find(node => node.getBoundingClientRect().bottom > edge + 1);
  if (block) anchors.push({ viewport, block, header, offset: (block.getBoundingClientRect().top - edge) / scale });
 }
 return (skip?: HTMLElement | null) => {
  for (const { viewport, block, header, offset } of anchors) {
   if (viewport === skip || !block.isConnected || !viewport.clientHeight) continue;
   const bounds = viewport.getBoundingClientRect(), scale = bounds.height / viewport.clientHeight || 1;
   const delta = (block.getBoundingClientRect().top - bounds.top - (header?.getBoundingClientRect().height ?? 0)) / scale - offset;
   if (Math.abs(delta) > .5) viewport.scrollTop += delta;
  }
 };
}
