// @vitest-environment jsdom
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
import CollectionManagement from './CollectionManagement';
import {EscapeManagerProvider} from '../lib/escape/EscapeManagerProvider';
import api from '../lib/api';
vi.mock('../lib/api',()=>({default:{put:vi.fn(),delete:vi.fn()}}));
vi.mock('../lib/settings',()=>({useSettings:()=>({settings:{local:{uiTransparency:0}}})}));
afterEach(()=>{cleanup();vi.resetAllMocks();});
it('submits rename, retains failures, and lets Escape close the dialog',async()=>{
 vi.mocked(api.put).mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({data:{id:'one',name:'Renamed'}});
 const close=vi.fn(),changed=vi.fn();render(<EscapeManagerProvider><CollectionManagement collection={{id:'one',name:'Original',count:0,favorite:false}} onClose={close} onChanged={changed}/></EscapeManagerProvider>);
 const input=screen.getByLabelText('Collection name');expect(document.activeElement).toBe(input);fireEvent.change(input,{target:{value:'Renamed'}});
 fireEvent.compositionStart(input);fireEvent.submit(input.closest('form')!);expect(api.put).not.toHaveBeenCalled();fireEvent.compositionEnd(input);
 fireEvent.submit(input.closest('form')!);await screen.findByRole('alert');expect((input as HTMLInputElement).value).toBe('Renamed');expect(close).not.toHaveBeenCalled();fireEvent.submit(input.closest('form')!);
 await waitFor(()=>expect(changed).toHaveBeenCalledOnce());expect(api.delete).not.toHaveBeenCalled();expect(close).toHaveBeenCalledOnce();fireEvent.keyDown(input,{key:'Escape'});expect(close).toHaveBeenCalledTimes(2);
});
