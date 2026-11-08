export type DragPhase='idle'|'discovering'|'hovering'|'navigating'|'ready'|'positioning'|'dropping'|'error';
export type DragFeedback={phase:DragPhase;label:string;owner?:string};
type Candidate={owner:string;x:number;y:number;action:(valid:()=>boolean)=>void|Promise<void>;fired:boolean;label:string;readyLabel:string};
/** One hover lease inside the shared gesture: cancellation also revokes delayed navigation. */
export class DragHoverLease {
 private current:Candidate|null=null;
 private timer:ReturnType<typeof setTimeout>|null=null;
 private publish:(state:DragFeedback)=>void;
 constructor(publish:(state:DragFeedback)=>void){this.publish=publish;}
 enter(owner:string,x:number,y:number,label:string,action:(valid:()=>boolean)=>void|Promise<void>,readyLabel='Choose a destination'){
  if(this.current?.owner!==owner){this.clear();this.current={owner,x,y,label,action,fired:false,readyLabel};this.publish({phase:'hovering',label,owner});}
  const candidate=this.current!;candidate.action=action;
  if(candidate.fired)return;
  if(Math.hypot(candidate.x-x,candidate.y-y)>6){if(this.timer)clearTimeout(this.timer);this.timer=null;candidate.x=x;candidate.y=y;}
  if(this.timer)return;
  this.timer=setTimeout(()=>{this.timer=null;candidate.fired=true;const valid=()=>this.current===candidate;
   this.publish({phase:'navigating',label,owner});
   void Promise.resolve().then(()=>valid()?candidate.action(valid):undefined).then(()=>{if(valid())this.publish({phase:'ready',label:candidate.readyLabel,owner});}).catch(error=>{if(valid())this.publish({phase:'error',label:error instanceof Error?error.message:'Destination could not be opened',owner});});
  },900);
 }
 leave(owner:string){if(this.current?.owner===owner){this.clear();this.publish({phase:'discovering',label:'Choose a destination'});}}
 clear(){if(this.timer)clearTimeout(this.timer);this.timer=null;this.current=null;}
}
