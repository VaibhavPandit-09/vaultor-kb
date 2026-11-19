import {useEffect,useLayoutEffect,useState} from 'react';
import {PointerDrag,type PointerDragOptions} from '../lib/pointerDrag';
import {useEscapeLayer} from '../lib/escape/escape';

/** Same gesture transport for Next resources/collections and Open Notes arrangement. */
export function usePointerDrag<T>(options:PointerDragOptions<T>,scope?:string){
 const [active,setActive]=useState(false);
 const [drag]=useState(()=>new PointerDrag<T>(()=>options));
 useLayoutEffect(()=>{drag.configure(()=>({...options,start:data=>{setActive(true);options.start?.(data);},end:(data,reason)=>{setActive(false);options.end?.(data,reason);}}));},[drag,options]);
 useEffect(()=>()=>drag.dispose(),[drag,scope]);
 useEscapeLayer({active,priority:450,close:()=>drag.cancel('escape'),restoreFocusOnEscape:false});
 return drag;
}
