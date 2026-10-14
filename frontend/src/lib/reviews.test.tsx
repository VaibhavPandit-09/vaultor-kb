// @vitest-environment jsdom
import {useState} from 'react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import api from './api';
import ReviewInbox from '../components/ReviewInbox';
import {EscapeManagerProvider} from './escape/EscapeManagerProvider';
import {changeReview,fetchReviewPage,reviewIntent,sendReview,type ReviewItem,type ReviewPage} from './reviews';
vi.mock('./api',()=>({default:{get:vi.fn(),put:vi.fn(),patch:vi.fn()}}));
vi.mock('./platform',()=>({getConnection:()=>({epoch:7})}));
vi.mock('./connection',()=>({getAcceptedCapabilities:()=>({reviews:1})}));
const item:ReviewItem={id:'review',resourceId:'note',targetTitle:'Target',targetType:'note',comment:'<script>bad()</script>',quote:'Old quote',context:'Old context',locator:{kind:'block',path:'0'},author:'Phone',createdAt:'2026-10-14T00:00:00Z',updatedAt:'2026-10-14T00:00:00Z',status:'open',revision:'opaque',availability:'available',attachment:'changed'};
const page:ReviewPage={items:[item],page:0,size:50,totalItems:1,totalPages:1,counts:{open:1,resolved:0,dismissed:0},generation:'generation'};
beforeEach(()=>{vi.mocked(api.get).mockResolvedValue({data:page});});
afterEach(()=>{cleanup();vi.resetAllMocks();});
it('retains caller UUID, body and source epoch across uncertain creation retries',async()=>{
  const intent=reviewIntent('generation','note','Concern','base');vi.mocked(api.put).mockRejectedValueOnce(new Error('Lost reply')).mockResolvedValueOnce({data:item});
  await expect(sendReview(intent)).rejects.toThrow('Lost reply');await sendReview(intent);
  expect(api.put).toHaveBeenNthCalledWith(1,'/reviews/'+intent.id,intent.body,{connectionEpoch:7});expect(vi.mocked(api.put).mock.calls[1]).toEqual(vi.mocked(api.put).mock.calls[0]);
});
it('sends conditional status without changing original resources',async()=>{
  vi.mocked(api.patch).mockResolvedValue({data:{...item,status:'resolved'}});await changeReview(item,'resolved','generation',7);
  expect(api.patch).toHaveBeenCalledWith('/reviews/review/status',{generation:'generation',status:'resolved'},{headers:{'If-Match':'"opaque"'},connectionEpoch:7});
});
it('uses bounded explicit workspace epoch, target and status queries',async()=>{
  const controller=new AbortController();await fetchReviewPage(JSON.stringify([7,'note','dismissed',2]),controller.signal);
  expect(api.get).toHaveBeenCalledWith('/reviews',{params:{resourceId:'note',status:'dismissed',page:2,size:50},signal:controller.signal,connectionEpoch:7,backgroundDiagnostic:true});
});
it('escapes evidence, exposes changed attachments and preserves rows on conflict',async()=>{
  vi.mocked(api.patch).mockRejectedValue({response:{status:412,data:{detail:'Changed on another device'}}});render(<EscapeManagerProvider><ReviewInbox resource={null} onClose={()=>{}} onOpen={vi.fn()}/></EscapeManagerProvider>);
  await screen.findByText(item.comment);expect(document.querySelector('script')).toBeNull();expect(screen.getByText(/Original evidence · changed/)).toBeTruthy();
  fireEvent.click(screen.getByText('Resolve'));await screen.findByText(/Changed on another device/);expect(screen.getByText(item.comment)).toBeTruthy();expect(api.patch).toHaveBeenCalledTimes(1);
});
it('discards obsolete filter responses and refuses navigation to unavailable targets',async()=>{
  let finish!:(v:unknown)=>void;vi.mocked(api.get).mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;})).mockResolvedValue({data:{...page,items:[{...item,status:'resolved',availability:'missing'}]}});
  render(<EscapeManagerProvider><ReviewInbox resource={null} onClose={()=>{}} onOpen={vi.fn()}/></EscapeManagerProvider>);fireEvent.change(screen.getByRole('combobox'),{target:{value:'resolved'}});await screen.findByText('Target missing. Evidence is retained.');
  finish({data:{...page,items:[{...item,targetTitle:'Stale'}]}});await waitFor(()=>expect(screen.queryByText('Stale')).toBeNull());expect(screen.getByRole<HTMLButtonElement>('button',{name:'Target'}).disabled).toBe(true);
});
it('contains focus and restores the trigger immediately after centralized Escape',async()=>{
  function Harness(){const[open,setOpen]=useState(false);return <EscapeManagerProvider><button onClick={()=>setOpen(true)}>Open reviews</button>{open&&<ReviewInbox resource={null} onClose={()=>setOpen(false)} onOpen={vi.fn()}/>}</EscapeManagerProvider>;}
  render(<Harness/>);const trigger=screen.getByText('Open reviews');trigger.focus();fireEvent.click(trigger);await waitFor(()=>expect(document.activeElement).toBe(screen.getByRole('combobox')));trigger.focus();expect(document.activeElement).toBe(screen.getByRole('combobox'));
  fireEvent.keyDown(window,{key:'Escape'});await waitFor(()=>expect(screen.queryByRole('dialog')).toBeNull());await waitFor(()=>expect(document.activeElement).toBe(trigger));
});
