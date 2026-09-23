// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import api from './api';
import { browseResources, type ResourcePage } from './resourceBrowse';
import { notifyResourceChange } from './resourceEvents';
import { useResourcePage } from './useResourcePage';
import { useOrganizationPage } from './organization';
import { RecencyRecorder } from './recencyRecorder';
vi.mock('./api',()=>({default:{get:vi.fn()}}));
vi.mock('./resourceBrowse',()=>({browseResources:vi.fn()}));
const page:ResourcePage={items:[{id:'one',title:'Note',type:'note',tags:[],createdAt:'2026-09-23',updatedAt:'2026-09-23'}],page:0,size:12,totalItems:1,totalPages:1};
function Lists() {
  const recent=useResourcePage({size:12,sort:'recent'}),favorites=useResourcePage({size:12,sort:'title',favorites:true});
  const collections=useOrganizationPage('collection'),tags=useOrganizationPage('tag');
  return <>{[recent,favorites,collections,tags].map((result,index)=><section key={index} data-testid={'group-'+index}>
    {result.loading?<span>Loading {index}</span>:<div data-testid={'rows-'+index}>{result.data?.items.map(item=><span key={item.id}>{'title' in item?item.title:item.name}</span>)}</div>}
    {result.error&&<button onClick={result.retry}>Retry {index}</button>}
  </section>)}</>;
}
afterEach(()=>{cleanup();vi.resetAllMocks();vi.useRealTimers();});
async function mount() {
  vi.mocked(browseResources).mockResolvedValue(page);
  vi.mocked(api.get).mockResolvedValue({data:{items:[{id:'org',name:'Topic',count:1}],page:0,totalPages:1,totalItems:1}});
  render(<Lists/>);
  await screen.findByTestId('rows-3');await screen.findByTestId('rows-0');
}
it('rapid activation retains mounted rows/scroll and refreshes only Recent after settling',async()=>{
  await mount();
  const row=screen.getByTestId('rows-0'),group=screen.getByTestId('group-0');group.scrollTop=90;
  vi.mocked(browseResources).mockClear();vi.mocked(api.get).mockClear();vi.useFakeTimers();
  for(const id of ['a','b','c']) {
    act(()=>notifyResourceChange({kind:'opened',id,phase:'pending'}));
    await act(async()=>{await vi.advanceTimersByTimeAsync(80);});
    expect(screen.getByTestId('rows-0')).toBe(row);expect(group.scrollTop).toBe(90);
  }
  expect(browseResources).not.toHaveBeenCalled();expect(api.get).not.toHaveBeenCalled();
  act(()=>notifyResourceChange({kind:'opened',id:'c',phase:'settled'}));
  await act(async()=>{await vi.advanceTimersByTimeAsync(150);});
  expect(browseResources).toHaveBeenCalledTimes(1);
  expect(browseResources).toHaveBeenCalledWith({size:12,sort:'recent'},expect.any(AbortSignal));
  expect(api.get).not.toHaveBeenCalled();expect(screen.getByTestId('rows-0')).toBe(row);expect(group.scrollTop).toBe(90);
});
it('failed background reads retain rows and retry locally; pins do not fetch tags or collections',async()=>{
  await mount();const row=screen.getByTestId('rows-1');vi.mocked(api.get).mockClear();
  vi.mocked(browseResources).mockRejectedValue(new Error('Offline'));
  act(()=>notifyResourceChange({kind:'pins',entity:'resource',id:'one'}));
  await screen.findByText('Retry 1');expect(screen.getByTestId('rows-1')).toBe(row);expect(screen.queryByText('Loading 1')).toBeNull();
  expect(api.get).not.toHaveBeenCalled();vi.mocked(browseResources).mockResolvedValue(page);fireEvent.click(screen.getByText('Retry 1'));
  await waitFor(()=>expect(screen.queryByText('Retry 1')).toBeNull());
});
it('invalidates an older in-flight Recent response when another note activates',async()=>{
  await mount();let finish!:(value:ResourcePage)=>void;
  vi.mocked(browseResources).mockImplementation((query)=>query?.sort==='recent'?new Promise(resolve=>{finish=resolve;}):Promise.resolve(page));
  act(()=>notifyResourceChange({kind:'metadata',ids:['one']}));
  await waitFor(()=>expect(finish).toBeTypeOf('function'));
  act(()=>notifyResourceChange({kind:'opened',id:'two',phase:'pending'}));
  await act(async()=>finish({...page,items:[{...page.items[0],title:'Stale'}]}));
  expect(screen.queryByText('Stale')).toBeNull();
});
it('coalesces writes, serializes subsequent opens and exposes retry without rejecting',async()=>{
  vi.useFakeTimers();let finish!:()=>void;
  const write=vi.fn().mockImplementationOnce(()=>new Promise<void>(resolve=>{finish=resolve;})).mockRejectedValueOnce(new Error('Offline')).mockResolvedValue(undefined);
  const changed=vi.fn(),recorder=new RecencyRecorder(write,changed);
  recorder.open('a');recorder.open('b');await vi.advanceTimersByTimeAsync(300);
  expect(write).toHaveBeenCalledTimes(1);expect(write.mock.calls[0][0]).toBe('b');
  recorder.open('c');await vi.advanceTimersByTimeAsync(300);expect(write).toHaveBeenCalledTimes(1);
  finish();await vi.advanceTimersByTimeAsync(0);
  expect(write.mock.calls[1][0]).toBe('c');expect(changed).toHaveBeenLastCalledWith('Could not update Recent.');
  recorder.retry();await vi.advanceTimersByTimeAsync(300);expect(changed).toHaveBeenLastCalledWith('');
  recorder.open('d');recorder.reset();await vi.advanceTimersByTimeAsync(300);expect(write).toHaveBeenCalledTimes(3);
});
it('logs background failures without dispatching the global error banner',async()=>{
  const {reportError,getLocalDiagnostics}=await import('./diagnostics');
  const log=vi.spyOn(console,'error').mockImplementation(()=>{}),listener=vi.fn();window.addEventListener('vaultor:error',listener);
  try {
    const error=reportError('recency',new Error('Offline'),'request-1',false);
    expect(listener).not.toHaveBeenCalled();expect(getLocalDiagnostics().at(-1)?.id).toBe(error.id);
    reportError('save',new Error('Failed'),'request-2');expect(listener).toHaveBeenCalledTimes(1);
  } finally {window.removeEventListener('vaultor:error',listener);log.mockRestore();}
});
