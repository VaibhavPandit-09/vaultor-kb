// @vitest-environment jsdom
import {render,screen,fireEvent,waitFor} from '@testing-library/react';
import {expect,it,vi} from 'vitest';
import type {Editor} from '@tiptap/core';
import type {ImportTarget} from '../lib/importTarget';
import {EscapeManagerProvider} from '../lib/escape/EscapeManagerProvider';
import EditorImagePicker from './EditorImagePicker';

const {attach,commit}=vi.hoisted(()=>({attach:vi.fn(),commit:vi.fn()}));
vi.mock('./client',()=>({command:vi.fn(async()=>({path:'fixture',items:[],next:null,total:0}))}));
vi.mock('./media',()=>({attachImages:attach,commitImages:commit}));

it('retries the failed file without preparing the successful one again and inserts in original order',async()=>{
  const first=new File(['first'],'first.png',{type:'image/png'});
  const second=new File(['second'],'second.png',{type:'image/png'});
  const editor={isDestroyed:false} as Editor;
  const target={assertValid:vi.fn()} as unknown as ImportTarget;
  attach.mockResolvedValueOnce([{id:'first',name:first.name}])
    .mockRejectedValueOnce(new Error('Invalid image'))
    .mockResolvedValueOnce([{id:'second',name:second.name}]);
  const committed:unknown[]=[];
  commit.mockImplementation(async(_editor,load)=>committed.push(...await load()));
  const closed=vi.fn();
  const view=render(<EscapeManagerProvider><EditorImagePicker editor={editor} request={{target,files:[first,second]}} close={closed}/></EscapeManagerProvider>);
  fireEvent.click(screen.getByRole('button',{name:'Prepare images'}));
  await screen.findByText('second.png · Failed');
  expect(screen.getByText('first.png · Ready')).toBeTruthy();
  fireEvent.click(screen.getByRole('button',{name:'Retry'}));
  await screen.findByText('second.png · Ready');
  expect(attach.mock.calls.map(([files])=>files[0].name)).toEqual([first.name,second.name,second.name]);
  fireEvent.click(screen.getByRole('button',{name:'Insert ready images'}));
  await waitFor(()=>expect(closed).toHaveBeenCalledOnce());
  expect(committed).toEqual([{id:'first',name:first.name},{id:'second',name:second.name}]);
  view.unmount();
});
