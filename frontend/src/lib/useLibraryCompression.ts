import { frameResizeObserver } from './frameResizeObserver';
import { useEffect, type RefObject } from 'react';
export function syncLibraryControls(header:HTMLElement){
 const compact=header.dataset.compact==='true',open=header.dataset.tools==='true';
 for(const section of header.querySelectorAll<HTMLElement>('.library-filters,.library-summary,.library-working-context')){section.inert=compact&&!open;section.setAttribute('aria-hidden',String(compact&&!open));}
}

/** One bounded scroll signal. Never owns React, queries, editor or focus state. */
export function attachLibraryCompression(viewport: HTMLElement, header: HTMLElement, options: { pinHeaderFocus?: boolean; onProgress?: (progress: number) => void; observeSubtree?: boolean } = {}) {
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)');
  let frame = 0, releaseFrame = 0, pointerHeld = false, lastTime = 0;
  let titleMeasure:HTMLElement|undefined;
  let travel = 160;
  const measureTravel = () => {
    // A real scroll offset proves at least this much overflow. Once past the
    // compression range no full-document geometry read is needed.
    travel = viewport.scrollTop >= 160 ? 160 : Math.min(160, Math.max(0, viewport.scrollHeight - viewport.clientHeight));
  };
  measureTravel();
  const target = () => travel > 0 ? Math.min(1, Math.max(0, viewport.scrollTop / travel)) : 0;
  let progress = target();
  let compact=false;
  const write = () => {
    viewport.style.setProperty('--library-progress', String(progress));
    options.onProgress?.(progress);
    // Breadcrumbs withdraw in their own row before the title enters that lane.
    viewport.style.setProperty('--collection-path-progress', String(Math.min(1,progress/.35)));
    viewport.style.setProperty('--collection-title-progress', String(Math.max(0,(progress-.35)/.65)));
    const path=header.querySelector<HTMLElement>('.collection-breadcrumb');
    if(path){path.inert=progress>=.35;path.setAttribute('aria-hidden',String(progress>=.35));}

    // The second title line is already clipped before its ellipsis changes.
    viewport.style.setProperty('--library-title-lines', progress > .96 ? '1' : '2');
    compact=progress>(compact?.82:.96);header.dataset.compact=String(compact);syncLibraryControls(header);
  };
  const locked = () => pointerHeld || Boolean(header.querySelector('.collection-breadcrumb')?.contains(document.activeElement)) || (options.pinHeaderFocus && header.contains(document.activeElement)) || Boolean(header.querySelector('[aria-haspopup][aria-expanded="true"]'));
  const step = (time: number) => {
    frame = 0;
    if (locked()) { lastTime = 0; return; }
    const goal = target();
    const elapsed = lastTime ? Math.min(40, time - lastTime) : 16;
    lastTime = time;
    // Follow slow scrolling directly; soften a large wheel/trackpad jump.
    const response = document.documentElement.dataset.animation === 'smooth' ? 65 : 35;
    progress = reduced?.matches ? (goal > (progress >= .5 ? .15 : .35) ? 1 : 0) : progress + (goal - progress) * (1 - Math.exp(-elapsed / response));
    if (Math.abs(goal - progress) < .001 || reduced?.matches) progress = reduced?.matches ? progress : goal;
    write();
    if (!reduced?.matches && progress !== goal) frame = requestAnimationFrame(step);
    else lastTime = 0;
  };
  const schedule = () => { if (!frame) frame = requestAnimationFrame(step); };
  const down = () => { cancelAnimationFrame(releaseFrame); pointerHeld = true; cancelAnimationFrame(frame); frame = 0; lastTime = 0; };
  const release = () => {
    // pointerup precedes click. Hold the geometry through the click's handlers
    // and React commit; an opening popover then retains its anchor geometry.
    cancelAnimationFrame(releaseFrame);
    releaseFrame = requestAnimationFrame(() => {
      releaseFrame = requestAnimationFrame(() => { pointerHeld = false; schedule(); });
    });
  };
  const measureActions = () => {
    const actions = header.querySelector<HTMLElement>('.library-heading-actions');
    viewport.style.setProperty('--library-actions-width', `${actions?.getBoundingClientRect().width ?? 0}px`);
    const path=header.querySelector<HTMLElement>('.collection-breadcrumb');
    if(path){
      viewport.style.setProperty('--collection-path-space',`${path.getBoundingClientRect().height+8}px`);
      const title=header.querySelector<HTMLElement>('h1');
      if(title){
        if(!titleMeasure){titleMeasure=document.createElement('div');titleMeasure.setAttribute('aria-hidden','true');document.body.append(titleMeasure);}
        const font=getComputedStyle(title);
        titleMeasure.style.cssText=`position:fixed;left:-10000px;top:0;visibility:hidden;pointer-events:none;width:${title.clientWidth}px;font-family:${font.fontFamily};font-weight:${font.fontWeight};font-size:28px;line-height:1.25;overflow-wrap:anywhere;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow:hidden;max-height:70px;`;
        titleMeasure.textContent=title.textContent;
        viewport.style.setProperty('--collection-title-expanded',`${Math.max(35,Math.min(70,titleMeasure.getBoundingClientRect().height))}px`);
      }
    }

    schedule();
  };
  const measure = () => { measureTravel(); measureActions(); };
  // Read overflow with the browser's delivered layout, before animation-frame
  // header writes can dirty the entire document and force a synchronous layout.
  const observer = frameResizeObserver(measureActions, measureTravel);
  const observeContent = () => {
    observer.disconnect(); observer.observe(viewport);
    // Header shrink and bottom compensation cancel. Observe content changes,
    // not our animated header, so the available travel stays stable.
    for (const child of viewport.children) if (child !== header) observer.observe(child);
    const actions = header.querySelector('.library-heading-actions');
    if (actions) observer.observe(actions);
    const path=header.querySelector('.collection-breadcrumb');if(path)observer.observe(path);
    measure();
  };
  const content = new MutationObserver(observeContent);
  // Editor DOM mutations are not layout measurements. Its outer content box is
  // already observed above: ResizeObserver catches actual wrapping/height changes.
  // Keep subtree discovery for library rows, whose action/header nodes can change.
  content.observe(viewport, { childList: true, subtree: options.observeSubtree ?? true });
  const actions = header.querySelector<HTMLElement>('.library-heading-actions');
  if (actions) observer.observe(actions);
  if (reduced?.matches) progress = progress > .25 ? 1 : 0;
  write(); observeContent();
  const scroll = () => { measureTravel(); schedule(); };
  viewport.addEventListener('scroll', scroll, { passive: true });
  viewport.addEventListener('pointerdown', down, true);
  document.addEventListener('pointerup', release, true);
  document.addEventListener('pointercancel', release, true);
  document.addEventListener('keyup', schedule, true);
  header.addEventListener('focusout', schedule);
  window.addEventListener('blur', release);
  reduced?.addEventListener('change', schedule);
  return () => {
    cancelAnimationFrame(frame); cancelAnimationFrame(releaseFrame); observer.disconnect(); content.disconnect();
    viewport.removeEventListener('scroll', scroll);
    viewport.removeEventListener('pointerdown', down, true);
    document.removeEventListener('pointerup', release, true);
    document.removeEventListener('pointercancel', release, true);
    document.removeEventListener('keyup', schedule, true);
    header.removeEventListener('focusout', schedule);
    window.removeEventListener('blur', release);
    reduced?.removeEventListener('change', schedule);
    viewport.style.removeProperty('--library-progress');
    viewport.style.removeProperty('--library-title-lines');
    viewport.style.removeProperty('--library-actions-width');
    titleMeasure?.remove();
    for(const key of ['--collection-title-expanded','--collection-path-progress','--collection-title-progress','--collection-path-space'])viewport.style.removeProperty(key);
    const path=header.querySelector<HTMLElement>('.collection-breadcrumb');if(path){path.inert=false;path.removeAttribute('aria-hidden');}
    delete header.dataset.compact;syncLibraryControls(header);

  };
}

export function useLibraryCompression(viewport: RefObject<HTMLElement | null>, header: RefObject<HTMLElement | null>, active: boolean) {
  useEffect(() => {
    if (active && viewport.current && header.current) return attachLibraryCompression(viewport.current, header.current,{pinHeaderFocus:true});
  }, [active, viewport, header]);
}
