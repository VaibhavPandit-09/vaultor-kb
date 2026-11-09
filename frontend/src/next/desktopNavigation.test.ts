import {expect,it} from 'vitest';
import {initialHistory,step,visit} from './desktopNavigation';
it('traverses bounded view history and replaces abandoned forward routes',()=>{
 let history=visit(initialHistory,{kind:'notes',ids:['a']});history=visit(history,{kind:'library'});
 history=step(history,-1);expect(history.entries[history.index]).toEqual({kind:'notes',ids:['a']});
 history=visit(history,{kind:'notes',ids:['b','b']});expect(history.entries).toHaveLength(3);expect(step(history,1).index).toBe(2);
 for(let i=0;i<50;i++)history=visit(history,{kind:'notes',ids:[String(i)]});expect(history.entries).toHaveLength(32);expect(history.index).toBe(31);expect(step(history,-100).index).toBe(0);
 expect(visit(history,history.entries[31])).toBe(history);
});
