import type {BrowseState} from './desktopState';
export type Destination={kind:'library'}|{kind:'notes';ids:string[]}|{kind:'browse';browse:BrowseState};
export type DesktopHistory={entries:Destination[];index:number};
export const initialHistory:DesktopHistory={entries:[{kind:'library'}],index:0};
export function visit(history:DesktopHistory,next:Destination):DesktopHistory{
 if(JSON.stringify(history.entries[history.index])===JSON.stringify(next))return history;
 const entries=[...history.entries.slice(0,history.index+1),next].slice(-32);return {entries,index:entries.length-1};
}
export function step(history:DesktopHistory,direction:number):DesktopHistory{return {...history,index:Math.max(0,Math.min(history.entries.length-1,history.index+direction))};}
export type PaneView={key:string;id:string};
/** Logical documents may have two views. Surviving views keep their own identity when a sibling closes. */
export function reconcilePaneViews(old:PaneView[],ids:string[]):PaneView[]{
 if(old.length===ids.length&&old.every((view,index)=>view.id===ids[index]))return old;
 const reserved=ids.map((id,index)=>old[index]?.id===id?old[index]:undefined);
 const used=new Set(reserved.filter((view):view is PaneView=>!!view).map(view=>view.key));
 return ids.map((id,index)=>{if(reserved[index])return reserved[index];const existing=old.find(view=>view.id===id&&!used.has(view.key));if(existing){used.add(existing.key);return existing;}return {id,key:crypto.randomUUID()};});
}
