/** Coalesce resize-driven writes after browser observation delivery. No polling. */
export function frameResizeObserver(update:()=>void) {
 let frame=0;
 const observer=new ResizeObserver(()=>{if(!frame)frame=requestAnimationFrame(()=>{frame=0;update();});});
 return {observe:(target:Element)=>observer.observe(target),disconnect:()=>{observer.disconnect();cancelAnimationFrame(frame);frame=0;}};
}
