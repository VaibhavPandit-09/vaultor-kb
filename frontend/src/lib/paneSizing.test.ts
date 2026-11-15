import {expect,it} from 'vitest';
import {paneWeights,restorePaneWeights,movePaneBoundary} from './paneSizing';
it('preserves surviving slot proportions and allocates a usable third pane',()=>{
 expect(paneWeights(['a','b'],{a:.6,b:.4})).toEqual([.6,.4]);
 const three=paneWeights(['a','b','c'],{a:.7,b:.3});expect(three.reduce((a,b)=>a+b,0)).toBeCloseTo(1);expect(Math.min(...three)).toBeGreaterThanOrEqual(.25);
 expect(paneWeights(['a','c'],{a:.3,b:.3,c:.4})).toEqual([.3/.7,.4/.7]);
});
it('resizes only adjacent slots with minimum widths and preserves the third',()=>{
 const initial=[1/3,1/3,1/3];const next=movePaneBoundary(initial,0,.8,1200);expect(next[2]).toBe(initial[2]);expect(next[0]+next[1]).toBeCloseTo(2/3);expect(next[1]).toBeGreaterThanOrEqual(.25);
 const other=movePaneBoundary(initial,1,-.8,1200);expect(other[0]).toBe(initial[0]);expect(other[1]).toBeGreaterThanOrEqual(.25);
});
it('reads legacy two-pane ratios and restores three weights without retaining unknown slots',()=>{
 expect(restorePaneWeights(['a','b'],undefined,65)).toEqual({a:.65,b:.35});expect(restorePaneWeights(['a','b','c'],[.3,.4,.3])).toEqual({a:.3,b:.4,c:.3});expect(restorePaneWeights(['c'],['invalid'])).toEqual({c:1});
});
