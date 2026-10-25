// @vitest-environment jsdom
import {cleanup,fireEvent,render,waitFor} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
import LinkedRecovery from './LinkedRecovery';
import {EscapeManagerProvider} from '../lib/escape/EscapeManagerProvider';
import type {LinkedWorkspace} from '../lib/linked/workspace';
afterEach(cleanup);
it('offline recovery discovers older scopes and exports their preserved artifacts in the reviewed scope',async()=>{
  const request=vi.fn(async(operation:string,p:Record<string,unknown>={})=>{if(operation==='previous-scopes')return [{id:'older',modified:1000,operations:1}];if(operation==='recovery')return p.recoveryScope?[{operation:'copy',name:'Guide.md',state:'DRAFT_RETAINED',version:1}]:[];if(operation==='inspect')return {state:'DRAFT_RETAINED',local:new TextEncoder().encode('Kept source'),base:null,visual:'{}',artifacts:['captured']};if(operation==='export')return {outcome:'saved'};if(operation==='release-recovery')return;throw Error('Unexpected '+operation);});
  const workspace={sources:async()=>{throw Error('HOST_UNAVAILABLE');},request} as unknown as LinkedWorkspace;
  const view=render(<EscapeManagerProvider><LinkedRecovery workspace={workspace} onClose={()=>{}}/></EscapeManagerProvider>);fireEvent.change(await view.findByLabelText('Recovery location'),{target:{value:'older'}});fireEvent.click(await view.findByRole('button',{name:'Guide.md · Protected draft'}));fireEvent.click(await view.findByRole('button',{name:'Export preserved original'}));await waitFor(()=>expect(request).toHaveBeenCalledWith('export',{operation:'copy',kind:'captured',recoveryScope:'older'}));await view.findByText('A separate preserved version was exported.');
});
