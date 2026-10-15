import { motionProfile } from './motion';
export type ThemeOrigin={x:number;y:number};
type Theme='light'|'dark'|'oled';
export function themeOriginAt(element?:HTMLElement|null):ThemeOrigin|undefined {
 if(!element)return;const rect=element.getBoundingClientRect();
 return {x:rect.left+rect.width/2,y:rect.top+rect.height/2};
}

/** Snapshot visuals only. Settings, DOM identity and persistence never await this controller. */
export function createThemeTransitionController(doc:Document=document){
 const root=doc.documentElement;
 let last:Theme|undefined,active:{theme:Theme;commit:()=>void;transition?:ViewTransition;animation?:Animation;cleanup:()=>void;timer:number}|undefined;
 const commit=(theme:Theme)=>{
  root.dataset.theme=theme;root.style.colorScheme=theme==='light'?'light':'dark';root.classList.toggle('dark',theme!=='light');root.classList.toggle('light',theme==='light');
  // Complete color tweens before the new snapshot; leave geometry/caret/media motion alone.
  for(const animation of doc.getAnimations?.()??[]){
   if('transitionProperty' in animation&&/^(color|background-color|border(-top|-right|-bottom|-left)?-color|outline-color|text-decoration-color|column-rule-color|box-shadow|text-shadow|fill|stroke)$/.test(String(animation.transitionProperty)))try{animation.finish();}catch{/* A canceled CSS transition needs no completion. */}
  }
 };
 const clearVisual=()=>{delete root.dataset.themeReveal;root.style.removeProperty('--theme-reveal-x');root.style.removeProperty('--theme-reveal-y');};
 const interrupt=()=>{
  const current=active;if(!current)return;
  current.commit();active=undefined;clearTimeout(current.timer);current.cleanup();current.animation?.cancel();
  try{current.transition?.skipTransition();}catch{/* The transition may already have finished. */}
  clearVisual();
 };
 function apply(theme:Theme,origin?:ThemeOrigin){
  if(last===theme&&(active||root.dataset.theme===theme))return;
  const initial=last===undefined;last=theme;interrupt();
  const reduced=window.matchMedia?.('(prefers-reduced-motion: reduce)');
  if(initial||!origin||reduced?.matches||doc.visibilityState==='hidden'||doc.fullscreenElement||!doc.startViewTransition||!root.animate){commit(theme);return;}
  const x=Math.max(0,Math.min(window.innerWidth,origin.x)),y=Math.max(0,Math.min(window.innerHeight,origin.y));
  const radius=Math.hypot(Math.max(x,window.innerWidth-x),Math.max(y,window.innerHeight-y));
  let committed=false;
  const current={theme,commit:()=>{commit(theme);committed=true;},cleanup:()=>{},timer:0,transition:undefined as ViewTransition|undefined,animation:undefined as Animation|undefined};
  active=current;root.style.setProperty('--theme-reveal-x',`${x}px`);root.style.setProperty('--theme-reveal-y',`${y}px`);root.dataset.themeReveal='';
  const changed=new MutationObserver(()=>{if(active===current)interrupt();});
  changed.observe(root,{attributes:true,attributeFilter:['data-animation']});
  const events=['pointerdown','keydown','scroll','visibilitychange','fullscreenchange'] as const;
  events.forEach(event=>doc.addEventListener(event,interrupt,true));window.addEventListener('resize',interrupt);reduced?.addEventListener('change',interrupt);
  current.cleanup=()=>{changed.disconnect();events.forEach(event=>doc.removeEventListener(event,interrupt,true));window.removeEventListener('resize',interrupt);reduced?.removeEventListener('change',interrupt);};
  // Bound capture failures; a skipped/late update callback must never restore an obsolete theme.
  current.timer=window.setTimeout(()=>{if(active===current)interrupt();},150);
  try{
   current.transition=doc.startViewTransition(()=>{if(active===current){current.commit();}});
   void current.transition.ready.then(()=>{
    if(active!==current)return;
    clearTimeout(current.timer);
    // CSS owns the mask so it recomputes as the typed radius animates. A mask in
    // the keyframes resolves var() once and stays transparent until the final snap.
    const feather=48;
    current.animation=root.animate([
     {'--theme-reveal-radius':'0px'},
     {'--theme-reveal-radius':`${radius+feather}px`},
    ],{duration:motionProfile().theme,easing:'cubic-bezier(.25,.1,.25,1)',fill:'both',pseudoElement:'::view-transition-new(root)'});
   }).catch(()=>{if(active===current)interrupt();});
   void current.transition.finished.catch(()=>{}).finally(()=>{if(active===current){if(!committed)current.commit();active=undefined;clearTimeout(current.timer);current.cleanup();clearVisual();}});
  }catch{interrupt();}
 }
 return {apply,dispose:interrupt};
}
