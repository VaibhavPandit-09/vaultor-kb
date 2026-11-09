import {useCallback,useLayoutEffect,useRef} from 'react';
/** Stable row callbacks read committed UI state without invalidating every memoized row. */
export function useStableEvent<A extends unknown[],R>(action:(...args:A)=>R){
 const latest=useRef(action);useLayoutEffect(()=>{latest.current=action;},[action]);
 return useCallback((...args:A)=>latest.current(...args),[]);
}
