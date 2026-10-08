// @vitest-environment jsdom
import {render,screen,fireEvent,waitFor,cleanup,act} from '@testing-library/react';
import {afterEach,it,expect,vi} from 'vitest';
import DesktopUpdates from './DesktopUpdates';
import {EscapeManagerProvider} from '../lib/escape/EscapeManagerProvider';
import type {DesktopBridge,UpdateStatus} from '../lib/desktop';
afterEach(()=>{cleanup();delete window.vaultorDesktop;});
const state:UpdateStatus={phase:'idle',feed:'',source:'github',currentVersion:'0.4.0',automaticInstall:true,progress:0,error:'',backupDirectory:'',recoveryAvailable:false,previousPackageAvailable:false};
async function mount(overrides:Partial<DesktopBridge>={}){
 let open!:()=>void; const check=vi.fn(async()=>({ok:true as const,value:{...state,phase:'available',availableVersion:'0.4.1'}}));
 window.vaultorDesktop={updatesStatus:vi.fn(async()=>({ok:true as const,value:state})),updatesCheck:check,onUpdatesOpen:(callback:()=>void)=>{open=callback;return()=>{};},...overrides} as DesktopBridge;
 const trigger=document.createElement('button');document.body.append(trigger);trigger.focus();
 render(<EscapeManagerProvider><DesktopUpdates/></EscapeManagerProvider>);await waitFor(()=>expect(open).toBeDefined());await act(async()=>open());return {check,trigger};
}
it('checks automatically on open and invokes one update action without exposing manual steps',async()=>{
 let finish!:(value:unknown)=>void;const apply=vi.fn(()=>new Promise(resolve=>finish=resolve));const {check}=await mount({updatesApply:apply as DesktopBridge['updatesApply']});
 expect(check).toHaveBeenCalledOnce();expect(screen.getByText('Vaultor 0.4.1 is available')).toBeTruthy();expect(screen.getByText('Advanced').closest('details')?.open).toBe(false);
 fireEvent.click(screen.getByText('Update and restart'));fireEvent.click(screen.getByText('Updating…'));expect(apply).toHaveBeenCalledOnce();await act(async()=>finish({ok:true as const,value:{...state,phase:'ready',candidateVersion:'0.4.1'}}));
});
it('retains an available update after failure and retries the same one-click action',async()=>{
 const apply=vi.fn().mockResolvedValueOnce({ok:false as const,error:{code:'OFFLINE',detail:'Download failed. Retry.'}}).mockResolvedValue({ok:true as const,value:{...state,phase:'ready',candidateVersion:'0.4.1'}});
 await mount({updatesApply:apply});fireEvent.click(screen.getByText('Update and restart'));await screen.findByText('Download failed. Retry.');fireEvent.click(screen.getByText('Update and restart'));await waitFor(()=>expect(apply).toHaveBeenCalledTimes(2));
});
it('keeps manual source/import/recovery under Advanced with retained input and duplicate prevention',async()=>{
 let finish!:(value:unknown)=>void;const configure=vi.fn(()=>new Promise(resolve=>finish=resolve));await mount({updatesConfigure:configure as DesktopBridge['updatesConfigure'],updatesImport:vi.fn(async()=>({ok:false as const,error:{code:'BAD',detail:'Signature rejected'}}))});
 fireEvent.click(screen.getByText('Advanced'));fireEvent.click(screen.getByText('Import update manually'));await screen.findByText('Signature rejected');const field=screen.getByLabelText('Update feed URL');fireEvent.change(field,{target:{value:'https://releases.test/update.json'}});fireEvent.submit(field.closest('form')!);fireEvent.submit(field.closest('form')!);expect(configure).toHaveBeenCalledOnce();expect(configure).toHaveBeenCalledWith('https://releases.test/update.json');await act(async()=>finish({ok:true as const,value:{...state,source:'custom',feed:'https://releases.test/update.json'}}));expect((field as HTMLInputElement).value).toBe('https://releases.test/update.json');
});
it('reports checks failing without offering another platform or promising automatic Mac replacement',async()=>{
 await mount({updatesCheck:vi.fn(async()=>({ok:false as const,error:{code:'RATE_LIMIT',detail:'Update check failed (403). Retry.'}}))});expect(screen.getByText('Retry check')).toBeTruthy();expect(screen.queryByText('Update and restart')).toBeNull();
 cleanup();delete window.vaultorDesktop;await mount({updatesCheck:vi.fn(async()=>({ok:true as const,value:{...state,automaticInstall:false,availableVersion:'0.4.1',phase:'available'}}))});expect(screen.getByText('Download and install')).toBeTruthy();expect(screen.getByText(/manual app replacement/)).toBeTruthy();
});
