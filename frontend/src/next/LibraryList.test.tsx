// @vitest-environment jsdom
import {cleanup,fireEvent,render,screen} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
import {ResourceRow} from './LibraryList';
afterEach(cleanup);
it('adapts the original row surface without merging selection, opening and organization authority',()=>{
 const activate=vi.fn(),pick=vi.fn(),menu=vi.fn(),pin=vi.fn(),open=vi.fn();
 const props={item:{id:'note',title:'Research',revision:1,updatedAt:'2026-11-11',kind:'note' as const},detail:{id:'note',pinned:true,tags:[{id:'tag',name:'Ideas',color:'#123456'}],collections:[{id:'collection',name:'Work'}]},selected:true,opened:true,focused:true,activate,pick,menu,pin,open,focus:vi.fn()};
 const result=render(<ResourceRow {...props}/>);
 expect(result.container.querySelector('.library-row .library-resource small')?.textContent).toBe('Note · Work · Ideas');
 fireEvent.click(screen.getByRole('checkbox'));expect(pick).toHaveBeenCalledWith('note',expect.anything(),true);expect(activate).not.toHaveBeenCalled();
 fireEvent.contextMenu(screen.getByRole('row'));expect(menu).toHaveBeenCalledWith('note',expect.anything());expect(pick).toHaveBeenCalledTimes(1);
 fireEvent.click(screen.getByRole('button',{name:'Unpin Research'}));expect(pin).toHaveBeenCalledWith('note');
 fireEvent.click(screen.getByRole('button',{name:'Research'}));expect(activate).toHaveBeenCalledWith('note',expect.anything());
 fireEvent.click(screen.getByRole('button',{name:'Open Research beside'}));expect(open).toHaveBeenCalledWith('note',true);
});
