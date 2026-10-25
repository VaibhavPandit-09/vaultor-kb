// @vitest-environment jsdom
import {act,cleanup,render,waitFor} from '@testing-library/react';
import {afterEach,expect,it} from 'vitest';
import LinkedReadonly from './LinkedReadonly';
import type {LinkedWorkspace} from '../../lib/linked/workspace';
import type {Opened} from '../../lib/linked/types';
afterEach(cleanup);
it('a stale large-source page cannot overwrite a freshly rebound read-only view',async()=>{
  let finish!:(value:Uint8Array)=>void;const workspace={previewMounted:()=>()=>{},subscribe:()=>()=>{},getSnapshot:()=>0,previewStatus:new Map(),request:async()=>new Promise<Uint8Array>(resolve=>{finish=resolve;})} as unknown as LinkedWorkspace;
  const old:Opened={id:'source',source:'root',binding:'old',name:'Large.md',relative:'Large.md',identity:'inode',revision:'old',size:300000,bytes:new Uint8Array(),readonlyReason:'LARGE_DOCUMENT'};
  const view=render(<LinkedReadonly workspace={workspace} opened={old}/>);await waitFor(()=>expect(finish).toBeTruthy());view.rerender(<LinkedReadonly workspace={workspace} opened={{...old,binding:'fresh',size:11,bytes:new TextEncoder().encode('Fresh source'),readonlyReason:'SPECIAL_FILE'}}/>);await view.findByText('Fresh source');await act(async()=>{finish(new TextEncoder().encode('Stale page'));});expect(view.queryByText('Stale page')).toBeNull();expect(view.getByText('Fresh source')).toBeTruthy();expect(view.queryByRole('button',{name:'Save'})).toBeNull();
});
