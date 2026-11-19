// @vitest-environment jsdom
import {act,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {expect,it,vi} from 'vitest';
import {EscapeManagerProvider} from '../lib/escape/EscapeManagerProvider';
import FilePreview from './FilePreview';
import {FileView} from './MediaView';

const {media,original}=vi.hoisted(()=>({media:vi.fn(),original:vi.fn()}));
vi.mock('./media',()=>({media,original,native:vi.fn()}));

it('preserves the viewer across placement changes and gives Escape to the preview',async()=>{
  media.mockResolvedValue({name:'notes.txt',bytes:6});
  original.mockResolvedValue({buffer:new TextEncoder().encode('sample').buffer});
  const close=vi.fn();
  const mounted=render(<EscapeManagerProvider><FilePreview id="file" title="Text" placement="side" opacity={.8} close={close}/></EscapeManagerProvider>);
  const content=await screen.findByText('sample');
  expect(screen.getByRole('region',{name:'Text'})).toBeTruthy();
  expect(document.activeElement).toBe(screen.getByRole('button',{name:'Close file preview'}));
  fireEvent.click(screen.getByRole('button',{name:'Expand file preview'}));
  expect(screen.getByRole('dialog',{name:'Text'})).toBeTruthy();
  expect(screen.getByText('sample')).toBe(content);
  fireEvent.keyDown(document,{key:'Escape'});
  await waitFor(()=>expect(close).toHaveBeenCalledOnce());
  mounted.unmount();
});

it('ignores a prior file receipt after the preview changes identity',async()=>{
  let finishOld!:(result:{name:string;bytes:number})=>void;
  media.mockImplementation((request:{id:string})=>request.id==='old'
    ?new Promise(resolve=>{finishOld=resolve;})
    :Promise.resolve({name:'current.txt',bytes:4}));
  original.mockResolvedValue({buffer:new TextEncoder().encode('current preview').buffer});
  const mounted=render(<FileView id="old" workspace="root"/>);
  mounted.rerender(<FileView id="new" workspace="root"/>);
  await screen.findByText('current preview');
  await act(async()=>{finishOld({name:'stale.txt',bytes:4});});
  expect(screen.queryByText(/stale\.txt/)).toBeNull();
  expect(original).toHaveBeenLastCalledWith('new','root');
  mounted.unmount();
});
