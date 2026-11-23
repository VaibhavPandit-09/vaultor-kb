import {useState,type PointerEvent} from 'react';
import {usePointerDrag} from './usePointerDrag';
const clear=()=>document.querySelectorAll<HTMLElement>('[data-next-session-drop]').forEach(e=>{delete e.dataset.nextSessionDrop;delete e.dataset.dropState;delete e.dataset.dropIntent;});
/** WebView2 native file drops consume HTML drag events. Keep session-ID semantics over shared pointer transport. */
export function useSessionArrangement({onReorder,onArrange}:{onReorder?:(id:string,before:string|null)=>void;onArrange?:(id:string,target:string)=>void}){
 const [arranging,setArranging]=useState(false);
 const target=(x:number,y:number)=>document.elementFromPoint(x,y)?.closest<HTMLElement>('[data-session-id],[data-session-pane],[data-session-end]');
 const gesture=usePointerDrag<{id:string;title:string}>({
  label:data=>data.title,
  start:()=>setArranging(true),
  move:(data,point)=>{clear();const hit=target(point.x,point.y),same=hit?.dataset.sessionId===data.id||hit?.dataset.sessionPane===data.id;const label=!hit?'Choose an Open Notes row or pane':same?'This session is already here':hit.dataset.sessionPane?'Swap note positions':'Reorder Open Notes';gesture.feedback(label,!hit||same);if(hit){hit.dataset.nextSessionDrop=same?'invalid':hit.dataset.sessionPane?'swap':'before';hit.dataset.dropState=same?'invalid':'valid';hit.dataset.dropIntent=label;}},
  drop:(data,point)=>{const hit=target(point.x,point.y);if(!hit||hit.dataset.sessionId===data.id||hit.dataset.sessionPane===data.id)return;if(hit.dataset.sessionPane)onArrange?.(data.id,hit.dataset.sessionPane);else onReorder?.(data.id,hit.dataset.sessionId??null);},
  end:()=>{setArranging(false);clear();},
 });
 const beginArrange=(id:string,event:PointerEvent<HTMLElement>)=>gesture.begin(event,{id,title:event.currentTarget.getAttribute('aria-label')??'Arrange note'});
 return {beginArrange,arranging};
}
