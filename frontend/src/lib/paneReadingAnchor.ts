/** Preserve the first visible document block while pane widths reflow text. */
export function capturePaneReadingAnchors(root: HTMLElement) {
 const anchors: { viewport: HTMLElement; block: HTMLElement; header: HTMLElement | null; offset: number }[] = [];
 for (const viewport of root.querySelectorAll<HTMLElement>('.journey-viewport')) {
  if (!viewport.clientHeight || !viewport.clientWidth) continue;
  const top = viewport.getBoundingClientRect().top;
  const header = viewport.querySelector<HTMLElement>('.note-orientation');
  const edge = top + (header?.getBoundingClientRect().height ?? 0);
  const block = [...viewport.querySelectorAll<HTMLElement>('.ProseMirror > *')].find(node => node.getBoundingClientRect().bottom > edge + 1);
  if (block) anchors.push({ viewport, block, header, offset: block.getBoundingClientRect().top - edge });
 }
 return (skip?: HTMLElement | null) => {
  for (const { viewport, block, header, offset } of anchors) {
   if (viewport === skip || !block.isConnected || !viewport.clientHeight) continue;
   const delta = block.getBoundingClientRect().top - viewport.getBoundingClientRect().top - (header?.getBoundingClientRect().height ?? 0) - offset;
   if (Math.abs(delta) > .5) viewport.scrollTop += delta;
  }
 };
}
