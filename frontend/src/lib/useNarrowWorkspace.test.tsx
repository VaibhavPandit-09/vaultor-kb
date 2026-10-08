import {act,render,screen} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
import {useNarrowWorkspace} from './useNarrowWorkspace';
afterEach(()=>vi.unstubAllGlobals());
it('tracks viewport changes and detaches without writing preferences',()=>{
 let listener:()=>void=()=>{};const remove=vi.fn();const query={matches:false,addEventListener:vi.fn((_name:string,fn:()=>void)=>{listener=fn;}),removeEventListener:remove};vi.stubGlobal('matchMedia',vi.fn(()=>query));
 function View(){return <span>{useNarrowWorkspace()?'compact':'wide'}</span>;}
 const view=render(<View/>);expect(screen.getByText('wide')).toBeTruthy();act(()=>{query.matches=true;listener();});expect(screen.getByText('compact')).toBeTruthy();act(()=>{query.matches=false;listener();});expect(screen.getByText('wide')).toBeTruthy();view.unmount();expect(remove).toHaveBeenCalledWith('change',listener);
});
// @vitest-environment jsdom
