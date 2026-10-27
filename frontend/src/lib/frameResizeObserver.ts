/** Coalesce writes after delivery. Optional delivery-phase read must not mutate DOM. */
export function frameResizeObserver(update:()=>void, read?:()=>void) {
 let frame=0;
 const observer=new ResizeObserver(()=>{read?.();if(!frame)frame=requestAnimationFrame(()=>{frame=0;update();});});
 return {observe:(target:Element)=>observer.observe(target),disconnect:()=>{observer.disconnect();cancelAnimationFrame(frame);frame=0;}};
}
