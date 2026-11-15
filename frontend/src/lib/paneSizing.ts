/** Slot weights are metadata only; resource/session identity never enters sizing. */
export function paneWeights(ids:string[],sizes:Record<string,number>):number[]{
 const known=ids.map(id=>sizes[id]).filter(n=>Number.isFinite(n)&&n>0);
 const fallback=known.length?known.reduce((a,b)=>a+b,0)/known.length:1;
 const raw=ids.map(id=>Number.isFinite(sizes[id])&&sizes[id]>0?sizes[id]:fallback);
 const sum=raw.reduce((a,b)=>a+b,0),normal=raw.map(n=>n/sum),minimum=ids.length===3?.25:ids.length===2?.3:1;
 const deficit=normal.reduce((total,n)=>total+Math.max(0,minimum-n),0),excess=normal.reduce((total,n)=>total+Math.max(0,n-minimum),0);
 return normal.map(n=>n<=minimum?minimum:n-(excess?deficit*(n-minimum)/excess:0));
}
export function restorePaneWeights(ids:string[],weights:unknown,ratio=50):Record<string,number>{
 const raw=Array.isArray(weights)&&weights.length===ids.length&&weights.every(n=>typeof n==='number'&&Number.isFinite(n)&&n>0)?weights:ids.length===2?[ratio,100-ratio]:ids.map(()=>1);
 const sum=raw.reduce((a,b)=>a+b,0);return Object.fromEntries(ids.map((id,i)=>[id,raw[i]/sum]));
}
export function movePaneBoundary(weights:number[],index:number,delta:number,available:number){
 const next=[...weights],pair=weights[index]+weights[index+1];
 const minimum=Math.min(pair/2,Math.max(weights.length===2?.3:.25,280/Math.max(1,available)));
 next[index]=Math.max(minimum,Math.min(pair-minimum,weights[index]+delta));next[index+1]=pair-next[index];return next;
}
