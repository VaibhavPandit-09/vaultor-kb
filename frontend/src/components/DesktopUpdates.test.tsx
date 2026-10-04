// @vitest-environment jsdom
import {render,screen,fireEvent,waitFor,cleanup} from '@testing-library/react';
import {afterEach,it,expect,vi} from 'vitest';
import DesktopUpdates from './DesktopUpdates';
import {EscapeManagerProvider} from '../lib/escape/EscapeManagerProvider';
import type {DesktopBridge,UpdateStatus} from '../lib/desktop';
afterEach(()=>{cleanup();delete window.vaultorDesktop;});
it('opens on demand, retains update failure/input, submits source and prevents duplicate actions',async()=>{
 let open!:()=>void;const state:UpdateStatus={phase:'idle',feed:'',currentVersion:'0.2.0',progress:0,error:'',backupDirectory:'',recoveryAvailable:false,previousPackageAvailable:false};
 let finish!:(value:unknown)=>void;const configure=vi.fn(()=>new Promise(resolve=>{finish=resolve;}));
 window.vaultorDesktop={updatesStatus:vi.fn(async()=>({ok:true,value:state})),onUpdatesOpen:(callback:()=>void)=>{open=callback;return()=>{};},updatesConfigure:configure,updatesImport:vi.fn(async()=>({ok:false,error:{code:'BAD_PACKAGE',detail:'Signature rejected'}}))} as unknown as DesktopBridge;
 render(<EscapeManagerProvider><DesktopUpdates/></EscapeManagerProvider>);await waitFor(()=>expect(open).toBeDefined());open();await screen.findByText('Vaultor updates');fireEvent.click(screen.getByText('Import update'));await screen.findByText('Signature rejected');
 fireEvent.click(screen.getByText('Update source and recovery'));const field=screen.getByLabelText('Update feed URL');fireEvent.change(field,{target:{value:'https://releases.test/update.json'}});fireEvent.submit(field.closest('form')!);fireEvent.submit(field.closest('form')!);expect(configure).toHaveBeenCalledTimes(1);expect(configure).toHaveBeenCalledWith('https://releases.test/update.json');finish({ok:true,value:{...state,feed:'https://releases.test/update.json'}});await waitFor(()=>expect((screen.getByText('Check for updates').closest('button') as HTMLButtonElement).disabled).toBe(false));
});
