/** Shared, finite motion. Never owns focus, editor state or network work. */
export type MotionKind = 'panel' | 'menu' | 'page' | 'category' | 'notice' | 'side';
export function motionProfile(mode = document.documentElement.dataset.animation, reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false) {
  return reduced ? { panel: 0, menu: 0, page: 0, exit: 0, stagger: 0, lift: 0 } : mode === 'smooth'
    ? { panel: 280, menu: 220, page: 200, exit: 180, stagger: 24, lift: 2 }
    : { panel: 90, menu: 75, page: 70, exit: 60, stagger: 0, lift: 0 };
}
const surfaces = '[data-motion-surface], .library-popover, .journey-popover, .settings-options, .settings-confirm, .image-more, .image-details, [role="dialog"], [role="alertdialog"], [role="alert"]';
const animations = new Set<Animation>();
const surfaceAnimations = new WeakMap<HTMLElement, Animation>();
const ghosts = new Map<string, HTMLElement>();
function track(animation: Animation) { animations.add(animation); void animation.finished.catch(() => {}).finally(() => animations.delete(animation)); return animation; }
function kind(element: HTMLElement): MotionKind { return (element.dataset.motionSurface as MotionKind) || (element.matches('.library-popover,.journey-popover,.settings-options,.image-more') ? 'menu' : element.matches('[role="alert"]') ? 'notice' : 'panel'); }
function owner(element: HTMLElement) { return element.dataset.motionKey || element.getAttribute('aria-label') || element.getAttribute('aria-labelledby') || element.className; }
export function enterSurface(element: HTMLElement, type = kind(element), delay = 0) {
  if (element.closest('[hidden], [inert], [aria-hidden="true"]')) return;
  surfaceAnimations.get(element)?.cancel();
  const profile = motionProfile(), duration = type === 'menu' ? profile.menu : type === 'page' || type === 'category' ? profile.page : profile.panel;
  ghosts.get(owner(element))?.remove(); ghosts.delete(owner(element));
  if (!duration || !element.animate) return;
  const base = getComputedStyle(element).transform; const transform = (extra: string) => (base === 'none' ? '' : base + ' ') + extra;
  const frames: Keyframe[] = type === 'page' || type === 'category' ? [{ opacity: .4 }, { opacity: 1 }] : [
    { opacity: 0, transform: transform(type === 'side' ? 'translateX(16px)' : type === 'menu' ? 'translateY(6px) scale(.985)' : 'translateY(12px) scale(.985)') },
    { opacity: 1, transform: transform(type==='side'?'translateX(-1px)':'translateY(-1px) scale(1.002)'), offset: .72 }, { opacity: 1, transform: base },
  ];
  const animation=track(element.animate(frames, { duration, delay, easing: 'cubic-bezier(.2,.7,.2,1)', fill: 'backwards' }));surfaceAnimations.set(element,animation);return animation;
}
/** Removed surfaces leave a short visual copy only. No handlers, focus or semantics survive. */
export function exitSurface(element: HTMLElement, rect: DOMRect) {
  const profile = motionProfile(); if (!profile.exit || !element.animate || !rect.width || !rect.height || kind(element) === 'page' || kind(element) === 'category') return;
  const id = owner(element); ghosts.get(id)?.remove();
  const ghost = element.cloneNode(true) as HTMLElement;
  ghost.dataset.motionGhost = ''; ghost.inert = true; ghost.setAttribute('aria-hidden', 'true');
  for (const child of [ghost, ...ghost.querySelectorAll<HTMLElement>('*')]) {
    for (const attr of ['id','role','tabindex','aria-labelledby','aria-describedby','autofocus','data-motion-surface','data-motion-key']) child.removeAttribute(attr);
    if (child instanceof HTMLInputElement || child instanceof HTMLButtonElement || child instanceof HTMLSelectElement || child instanceof HTMLTextAreaElement) child.disabled = true;
    child.removeAttribute('contenteditable');
  }
  Object.assign(ghost.style, { position: 'fixed', top: rect.top+'px', left: rect.left+'px', width: rect.width+'px', height: rect.height+'px', maxWidth: 'none', maxHeight: 'none', margin: '0', transform: 'none', pointerEvents: 'none', zIndex: '1300' });
  document.body.append(ghost); ghosts.set(id, ghost);
  const animation = track(ghost.animate([{ opacity: .7 }, { opacity: 0 }], { duration: profile.exit, easing: 'ease-out' }));
  void animation.finished.catch(() => {}).finally(() => { ghost.remove(); if (ghosts.get(id) === ghost) ghosts.delete(id); });
}
export function installMotion() {
  const rects = new WeakMap<HTMLElement, DOMRect>(), seen = new WeakSet<HTMLElement>(), lists = new WeakMap<HTMLElement, string>();
  const active = new Set<HTMLElement>();
  const candidates = (node: Node) => node instanceof HTMLElement && !node.closest('[data-motion-ghost]') ? [ ...(node.matches(surfaces) ? [node] : []), ...node.querySelectorAll<HTMLElement>(surfaces) ] : [];
  const refresh = () => { for (const element of active) if (element.isConnected) rects.set(element, element.getBoundingClientRect()); else active.delete(element); };
  const reveal = (list: HTMLElement) => {
    if (list.closest('[hidden], [inert], [aria-hidden="true"]')) return;
    if (list.dataset.motionReady !== 'true' || list.dataset.motionList !== 'true') return;
    const key = list.dataset.motionKey ?? ''; if (lists.get(list) === key) return; lists.set(list,key);
    const profile = motionProfile(); if (!profile.stagger) return;
    [...list.querySelectorAll<HTMLElement>('.library-row,.sidebar-shortcut')].slice(0,6).forEach((row,index) => {
      if (row.animate) track(row.animate([{opacity:0,translate:'0 5px'},{opacity:1,translate:'0 0'}],{duration:200,delay:index*profile.stagger,easing:'ease-out',fill:'backwards'}));
    });
  };
  const add = (element: HTMLElement, replay = false) => { if (!seen.has(element) || replay) { seen.add(element); enterSurface(element); } active.add(element); rects.set(element,element.getBoundingClientRect()); if(element.matches('[data-motion-list]'))reveal(element); };
  const observer = new MutationObserver(records => {
    const removed = records.flatMap(record => [...record.removedNodes].flatMap(candidates));
    for (const element of removed) if (!element.isConnected && !removed.some(other=>other!==element&&other.contains(element))) { const rect=rects.get(element);if(rect)exitSurface(element,rect);active.delete(element); }
    for (const record of records) {
      for (const node of record.addedNodes) { for (const element of candidates(node)) if (element.isConnected) add(element); if(node instanceof HTMLElement&&!node.closest('[data-motion-ghost]')) { if(node.matches('[data-motion-list]'))reveal(node);node.querySelectorAll<HTMLElement>('[data-motion-list]').forEach(reveal); } }
      if (record.type==='attributes' && record.target instanceof HTMLElement) {
        const element=record.target;
        if (record.attributeName==='data-motion-key' && element.matches(surfaces)) add(element,true);
        if (record.attributeName==='hidden'||record.attributeName==='aria-hidden') { candidates(element).forEach(candidate=>add(candidate,true));element.querySelectorAll<HTMLElement>('[data-motion-list]').forEach(reveal); }
        if (element.matches('[data-motion-list]')) reveal(element);
      }
      if (record.target instanceof HTMLElement) { const list=record.target.closest<HTMLElement>('[data-motion-list]');if(list)reveal(list); }
    }
  });
  candidates(document.body).forEach(element=>add(element));
  observer.observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['data-motion-key','data-motion-ready','data-motion-list','hidden','aria-hidden']});
  // Capture geometry before an interaction can remove a surface; no sampling loop.
  document.addEventListener('pointerdown',refresh,true);document.addEventListener('keydown',refresh,true);window.addEventListener('resize',refresh);document.addEventListener('scroll',refresh,true);
  const reduced=window.matchMedia?.('(prefers-reduced-motion: reduce)');
  const stop=()=>{for(const animation of animations)animation.cancel();for(const ghost of ghosts.values())ghost.remove();ghosts.clear();};
  reduced?.addEventListener('change',stop);
  const preference=new MutationObserver(stop);preference.observe(document.documentElement,{attributes:true,attributeFilter:['data-animation']});
  return ()=>{observer.disconnect();preference.disconnect();document.removeEventListener('pointerdown',refresh,true);document.removeEventListener('keydown',refresh,true);window.removeEventListener('resize',refresh);document.removeEventListener('scroll',refresh,true);reduced?.removeEventListener('change',stop);stop();};
}
