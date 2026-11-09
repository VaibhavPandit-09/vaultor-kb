export type Destination={kind:'library'}|{kind:'notes';ids:string[]};
export type DesktopHistory={entries:Destination[];index:number};
export const initialHistory:DesktopHistory={entries:[{kind:'library'}],index:0};
export function visit(history:DesktopHistory,next:Destination):DesktopHistory{
 if(JSON.stringify(history.entries[history.index])===JSON.stringify(next))return history;
 const entries=[...history.entries.slice(0,history.index+1),next].slice(-32);return {entries,index:entries.length-1};
}
export function step(history:DesktopHistory,direction:number):DesktopHistory{return {...history,index:Math.max(0,Math.min(history.entries.length-1,history.index+direction))};}
