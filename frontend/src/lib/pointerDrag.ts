export type DragPoint={x:number;y:number;shiftKey:boolean};
export type DragEnd='drop'|'click'|'escape'|'cancel'|'blur'|'replaced'|'dispose';
export type PointerStart={button:number;pointerId:number;isPrimary?:boolean;clientX:number;clientY:number;shiftKey:boolean;currentTarget:HTMLElement;target:EventTarget|null;preventDefault:()=>void;stopPropagation:()=>void};
export type PointerDragOptions<T>={label:(data:T)=>string;start?:(data:T)=>void;move:(data:T,point:DragPoint)=>void;drop:(data:T,point:DragPoint)=>void;end?:(data:T,reason:DragEnd)=>void};
let cancelOwner:(()=>void)|undefined;

/** Pointer transport for WebView2 internal gestures. External OLE/file drops remain native. */
export class PointerDrag<T>{
 private gesture?:{data:T;id:number;source:HTMLElement;capture:HTMLElement;origin:DragPoint;point:DragPoint;active:boolean};
 private frame=0;
 private preview?:HTMLElement;
 private titles=new Map<HTMLElement,string>();
 private releaseClick?:()=>void;
 private options:()=>PointerDragOptions<T>;
 constructor(options:()=>PointerDragOptions<T>){this.options=options;}
 configure=(options:()=>PointerDragOptions<T>)=>{this.options=options;};
 private ownerCancel=()=>this.cancel('replaced');
 begin=(event:PointerStart,data:T)=>{
  if(event.button!==0||event.isPrimary===false)return;
  cancelOwner?.();this.releaseClick?.();cancelOwner=this.ownerCancel;
  const source=event.target instanceof Element?event.target.closest<HTMLElement>('button,[tabindex]')??event.currentTarget:event.currentTarget;
  const point={x:event.clientX,y:event.clientY,shiftKey:event.shiftKey};
  this.gesture={data,id:event.pointerId,source,capture:event.currentTarget.closest<HTMLElement>('[data-pointer-drag-owner]')??document.documentElement,origin:point,point,active:false};
  // Admission is synchronous: native selected-text/image drag must not win the OS threshold.
  event.preventDefault();event.stopPropagation();
  const selection=window.getSelection(),ownsSelection=!!selection?.anchorNode&&event.currentTarget.contains(selection.anchorNode);
  source.focus({preventScroll:true});if(ownsSelection)selection?.removeAllRanges();
  document.addEventListener('pointermove',this.move,{capture:true,passive:false});
  document.addEventListener('pointerup',this.up,true);document.addEventListener('pointercancel',this.pointerCancel,true);
  document.addEventListener('lostpointercapture',this.lost,true);document.addEventListener('dragstart',this.nativeDrag,true);
  document.addEventListener('keydown',this.modifier,true);document.addEventListener('keyup',this.modifier,true);
  window.addEventListener('blur',this.blur);document.addEventListener('visibilitychange',this.visibility);
 };
 private nativeDrag=(event:DragEvent)=>{if(this.gesture){event.preventDefault();event.stopPropagation();}};
 private modifier=(event:KeyboardEvent)=>{if(this.gesture)this.gesture.point.shiftKey=event.shiftKey;};
 private move=(event:PointerEvent)=>{
  const g=this.gesture;if(!g||event.pointerId!==g.id)return;
  if(!(event.buttons&1)){this.cancel('cancel');return;}
  g.point={x:event.clientX,y:event.clientY,shiftKey:event.shiftKey};
  if(!g.active){
   if(Math.hypot(g.point.x-g.origin.x,g.point.y-g.origin.y)<6)return;
   g.active=true;try{g.capture.setPointerCapture?.(g.id);}catch{/* Document listeners still own the gesture. */}
   this.preview=document.createElement('div');this.preview.className='resource-drag-preview pointer-drag-preview';this.preview.setAttribute('aria-hidden','true');this.preview.style.pointerEvents='none';this.preview.style.zIndex='5001';const title=document.createElement('span');title.textContent=this.options().label(g.data);const intent=document.createElement('small');intent.className='pointer-drag-intent';this.preview.append(title,intent);document.body.append(this.preview);
   this.options().start?.(g.data);this.tick();
  }
  event.preventDefault();event.stopPropagation();this.update();
 };
 feedback=(label:string,invalid=false)=>{const intent=this.preview?.querySelector('small');if(intent&&intent.textContent!==label)intent.textContent=label;if(this.preview)this.preview.dataset.state=invalid?'invalid':'valid';};
 private mute=(node:Element|null)=>{for(let el=node?.closest<HTMLElement>('[title]');el;el=el.parentElement?.closest<HTMLElement>('[title]')){if(!this.titles.has(el)){this.titles.set(el,el.title);el.removeAttribute('title');}}};
 private update=()=>{
  const g=this.gesture;if(!g?.active)return;
  const {x,y}=g.point;if(this.preview){this.preview.style.left=x+16+'px';this.preview.style.top=y+18+'px';}
  const hit=document.elementFromPoint(x,y);this.mute(g.source);this.mute(hit);
  this.options().move(g.data,g.point);
 };
 private tick=()=>{
  const g=this.gesture;if(!g?.active)return;
  const hit=document.elementFromPoint(g.point.x,g.point.y);
  for(let node=hit instanceof HTMLElement?hit:null;node;node=node.parentElement){
   if(node.scrollHeight>node.clientHeight&&getComputedStyle(node).overflowY==='auto'){
    const r=node.getBoundingClientRect(),edge=28;
    if(g.point.y<r.top+edge)node.scrollTop-=Math.ceil((r.top+edge-g.point.y)/3);
    else if(g.point.y>r.bottom-edge)node.scrollTop+=Math.ceil((g.point.y-r.bottom+edge)/3);
    break;
   }
  }
  this.update();this.frame=requestAnimationFrame(this.tick);
 };
 private up=(event:PointerEvent)=>{
  const g=this.gesture;if(!g||event.pointerId!==g.id)return;
  if(!g.active){this.finish('click');return;}
  event.preventDefault();event.stopPropagation();this.guardClick(g.id);
  try{this.options().drop(g.data,{x:event.clientX,y:event.clientY,shiftKey:event.shiftKey});}finally{this.finish('drop');}
 };
 private pointerCancel=(event:PointerEvent)=>{if(event.pointerId===this.gesture?.id)this.cancel('cancel');};
 private lost=(event:PointerEvent)=>{if(event.pointerId===this.gesture?.id&&event.target===this.gesture.capture)this.cancel('cancel');};
 private blur=()=>this.cancel('blur');
 private visibility=()=>{if(document.hidden)this.cancel('blur');};
 private guardClick=(pointerId:number)=>{
  this.releaseClick?.();let timer:ReturnType<typeof setTimeout>|undefined;
  const clear=()=>{clearTimeout(timer);document.removeEventListener('click',block,true);document.removeEventListener('pointerdown',clear,true);document.removeEventListener('pointerup',released,true);this.releaseClick=undefined;};
  const block=(event:MouseEvent)=>{if(event.detail!==0){event.preventDefault();event.stopImmediatePropagation();clear();}};
  const released=(event:PointerEvent)=>{if(event.pointerId===pointerId)timer=setTimeout(clear,0);};
  document.addEventListener('click',block,true);document.addEventListener('pointerdown',clear,true);document.addEventListener('pointerup',released,true);
  this.releaseClick=clear;
  // The current pointerup is already in flight; compatibility click follows in this task.
  if(!this.gesture)timer=setTimeout(clear,0);
 };
 cancel=(reason:DragEnd='cancel')=>{
  const g=this.gesture;if(g?.active&&reason!=='blur'&&reason!=='dispose'&&reason!=='replaced')this.guardClick(g.id);
  this.finish(reason);
  if(reason==='blur'||reason==='dispose'||reason==='replaced')this.releaseClick?.();
  if(g?.active&&['escape','cancel'].includes(reason)&&g.source.isConnected&&document.hasFocus())g.source.focus({preventScroll:true});
 };
 private finish=(reason:DragEnd)=>{
  const g=this.gesture;this.gesture=undefined;if(cancelOwner===this.ownerCancel)cancelOwner=undefined;
  cancelAnimationFrame(this.frame);this.preview?.remove();this.preview=undefined;
  document.removeEventListener('pointermove',this.move,true);document.removeEventListener('pointerup',this.up,true);document.removeEventListener('pointercancel',this.pointerCancel,true);document.removeEventListener('lostpointercapture',this.lost,true);document.removeEventListener('dragstart',this.nativeDrag,true);document.removeEventListener('keydown',this.modifier,true);document.removeEventListener('keyup',this.modifier,true);window.removeEventListener('blur',this.blur);document.removeEventListener('visibilitychange',this.visibility);
  if(g)try{if(g.capture.hasPointerCapture?.(g.id))g.capture.releasePointerCapture(g.id);}catch{/* Window may have lost native capture already. */}
  for(const [node,title] of this.titles)if(node.isConnected&&!node.hasAttribute('title'))node.title=title;this.titles.clear();
  if(g)this.options().end?.(g.data,reason);
 };
 dispose=()=>{this.cancel('dispose');this.releaseClick?.();};
}
