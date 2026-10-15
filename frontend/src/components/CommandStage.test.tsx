// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import CommandStage from './CommandStage';
import { enterCommandStage } from '../lib/motion';
vi.mock('../lib/motion',()=>({enterCommandStage:vi.fn()}));
afterEach(()=>{cleanup();vi.resetAllMocks();});
it('retains body allocation while search is pending and cancels reversed stage motion',()=>{
 const cancel=vi.fn();vi.mocked(enterCommandStage).mockReturnValue({cancel} as unknown as Animation);
 const view=render(<CommandStage stage="search" depth={0}>Results</CommandStage>);
 const body=view.container.firstElementChild as HTMLElement,content=body.firstElementChild!;
 Object.defineProperty(content,'scrollHeight',{configurable:true,value:420});
 view.rerender(<CommandStage stage="search" depth={0}>New results</CommandStage>);expect(body.style.getPropertyValue('--palette-body-height')).toBe('420px');
 Object.defineProperty(content,'scrollHeight',{value:30});
 view.rerender(<CommandStage stage="search" depth={0} pending>Searching</CommandStage>);expect(body.style.getPropertyValue('--palette-body-height')).toBe('420px');expect(enterCommandStage).not.toHaveBeenCalled();
 view.rerender(<CommandStage stage="actions" depth={1}>Actions</CommandStage>);expect(enterCommandStage).toHaveBeenLastCalledWith(content,1);
 view.rerender(<CommandStage stage="search" depth={0}>Results</CommandStage>);expect(cancel).toHaveBeenCalledOnce();expect(enterCommandStage).toHaveBeenLastCalledWith(content,-1);expect(body.firstElementChild).toBe(content);
 view.unmount();expect(cancel).toHaveBeenCalledTimes(2);
});
