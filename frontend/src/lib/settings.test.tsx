// @vitest-environment jsdom
import {render,screen,fireEvent,waitFor,cleanup} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
import {SettingsProvider,useSettings} from './settings';
import api from './api';
import {mergeSettingsPatch,type SettingsPatch} from './settingsPatch';
vi.mock('./api',()=>({default:{get:vi.fn(),patch:vi.fn()}}));
afterEach(()=>{cleanup();vi.restoreAllMocks();localStorage.clear();vi.unstubAllGlobals();});
function Probe(){const s=useSettings();return <><span>{s.settings.local.theme}:{s.resolvedTheme}:{s.saveStatus}</span><button onClick={()=>s.updateLocalSetting('theme','dark')}>Dark</button><button onClick={()=>s.updateLocalSetting('theme','dark',{x:20,y:30})}>Reveal Dark</button><button onClick={()=>s.updateWorkspaceSetting('maxOpenNotes',3)}>Three</button><button onClick={()=>s.retrySave()}>Retry</button><button onClick={()=>s.updateLocalSetting('theme','oled')}>OLED</button><button onClick={()=>s.toggleTheme()}>Cycle</button><button onClick={()=>s.updateLocalSetting('uiTransparency',.65)}>Opacity65</button><span data-testid="transparency">{s.settings.local.uiTransparency}</span></>;}
it('defaults to OS, reacts to OS changes and keeps an explicit choice',async()=>{
  let listener!:()=>void;const media={matches:false,addEventListener:vi.fn((_name,fn)=>{listener=fn;}),removeEventListener:vi.fn()};
  vi.stubGlobal('matchMedia',()=>media);
  let doc:SettingsPatch={workspace:{maxOpenNotes:2},local:{},keybindings:{}};
  vi.mocked(api.get).mockImplementation(async()=>({data:doc}));vi.mocked(api.patch).mockImplementation(async(_url,patch)=>({data:doc=mergeSettingsPatch(doc,patch as SettingsPatch)}));
  render(<SettingsProvider><Probe/></SettingsProvider>);await waitFor(()=>expect(screen.getByText('os:light:saved')).toBeTruthy());
  media.matches=true;listener();await waitFor(()=>expect(document.documentElement.dataset.theme).toBe('dark'));
  fireEvent.click(screen.getByText('Dark'));await waitFor(()=>expect(screen.getByText('dark:dark:saved')).toBeTruthy());
  media.matches=false;listener();await waitFor(()=>expect(document.documentElement.dataset.theme).toBe('dark'));vi.unstubAllGlobals();
});
it('retries failed leaves without sending another devices full settings',async()=>{
  let doc:SettingsPatch={workspace:{maxOpenNotes:2},local:{other:{theme:'light'}},keybindings:{}};
  vi.mocked(api.get).mockImplementation(async()=>({data:doc}));vi.mocked(api.patch).mockRejectedValueOnce(new Error('Offline')).mockImplementation(async(_url,patch)=>({data:doc=mergeSettingsPatch(doc,patch as SettingsPatch)}));
  render(<SettingsProvider><Probe/></SettingsProvider>);await waitFor(()=>expect(api.get).toHaveBeenCalled());fireEvent.click(screen.getByText('Three'));
  await waitFor(()=>expect(screen.getByText(/:failed$/)).toBeTruthy());fireEvent.click(screen.getByText('Retry'));
  await waitFor(()=>expect(screen.getByText(/:saved$/)).toBeTruthy());expect(api.patch).toHaveBeenLastCalledWith('/settings',{workspace:{maxOpenNotes:3}},expect.objectContaining({connectionEpoch:expect.any(Number)}));expect(doc.local).toEqual({other:{theme:'light'}});
});

it('persists OLED, retains opacity, ignores OS changes and restores after reload',async()=>{
 let listener!:()=>void;const media={matches:false,addEventListener:vi.fn((_name,fn)=>{listener=fn;}),removeEventListener:vi.fn()};vi.stubGlobal('matchMedia',()=>media);
 let doc:SettingsPatch={local:{},workspace:{},keybindings:{}};
 vi.mocked(api.get).mockImplementation(async()=>({data:doc}));vi.mocked(api.patch).mockImplementation(async(_url,patch)=>({data:doc=mergeSettingsPatch(doc,patch as SettingsPatch)}));
 const view=render(<SettingsProvider><Probe/></SettingsProvider>);await waitFor(()=>expect(screen.getByText('os:light:saved')).toBeTruthy());
 fireEvent.click(screen.getByText('OLED'));await waitFor(()=>expect(screen.getByText('oled:oled:saved')).toBeTruthy());
 expect(document.documentElement.classList.contains('dark')).toBe(true);expect(document.documentElement.style.colorScheme).toBe('dark');expect(screen.getByTestId('transparency').textContent).toBe('0.85');
 media.matches=true;listener();expect(document.documentElement.dataset.theme).toBe('oled');
 view.unmount();render(<SettingsProvider><Probe/></SettingsProvider>);await waitFor(()=>expect(screen.getByText('oled:oled:saved')).toBeTruthy());
 fireEvent.click(screen.getByText('Cycle'));await waitFor(()=>expect(screen.getByText('os:dark:saved')).toBeTruthy());
 for(const theme of ['light','dark','oled','os']) {fireEvent.click(screen.getByText('Cycle'));await waitFor(()=>expect(screen.getByText(new RegExp('^'+theme+':.*:saved$'))).toBeTruthy());}
 expect(screen.getByTestId('transparency').textContent).toBe('0.85');
});

it('device appearance survives changing to a workspace with different host preferences',async()=>{
 vi.mocked(api.get).mockResolvedValue({data:{local:{},workspace:{maxOpenNotes:2},keybindings:{}}});vi.mocked(api.patch).mockImplementation(async(_url,patch)=>({data:mergeSettingsPatch({local:{},workspace:{},keybindings:{}},patch as SettingsPatch)}));
 const view=render(<SettingsProvider><Probe/></SettingsProvider>);await waitFor(()=>expect(screen.getByText(/:saved$/)).toBeTruthy());fireEvent.click(screen.getByText('OLED'));await waitFor(()=>expect(screen.getByText('oled:oled:saved')).toBeTruthy());view.unmount();
 vi.mocked(api.get).mockResolvedValue({data:{local:{},workspace:{maxOpenNotes:4},keybindings:{}}});render(<SettingsProvider><Probe/></SettingsProvider>);expect(document.documentElement.dataset.theme).toBe('oled');await waitFor(()=>expect(screen.getByText('oled:oled:saved')).toBeTruthy());
});

it('applies the live opacity token in OLED and retains it through appearance changes',async()=>{
 vi.stubGlobal('matchMedia',()=>({matches:false,addEventListener:vi.fn(),removeEventListener:vi.fn()}));
 let doc:SettingsPatch={local:{},workspace:{},keybindings:{}};vi.mocked(api.get).mockImplementation(async()=>({data:doc}));vi.mocked(api.patch).mockImplementation(async(_url,patch)=>({data:doc=mergeSettingsPatch(doc,patch as SettingsPatch)}));
 render(<SettingsProvider><Probe/></SettingsProvider>);await waitFor(()=>expect(screen.getByText(/:saved$/)).toBeTruthy());
 fireEvent.click(screen.getByText('OLED'));fireEvent.click(screen.getByText('Opacity65'));
 await waitFor(()=>expect(screen.getByText('oled:oled:saved')).toBeTruthy());expect(document.documentElement.style.getPropertyValue('--ui-opacity')).toBe('0.65');
 fireEvent.click(screen.getByText('Dark'));await waitFor(()=>expect(screen.getByText('dark:dark:saved')).toBeTruthy());expect(document.documentElement.style.getPropertyValue('--ui-opacity')).toBe('0.65');
});

it('persists an explicit request immediately while capture is pending and retains its theme after a failed save',async()=>{
 vi.stubGlobal('matchMedia',()=>({matches:false,addEventListener:vi.fn(),removeEventListener:vi.fn()}));vi.spyOn(console,'error').mockImplementation(()=>{});
 vi.mocked(api.get).mockResolvedValue({data:{local:{},workspace:{},keybindings:{}}});vi.mocked(api.patch).mockRejectedValue(new Error('Offline'));
 const visibility=Object.getOwnPropertyDescriptor(document,'visibilityState');Object.defineProperty(document,'visibilityState',{configurable:true,value:'visible'});
 let update!:()=>void,ready!:()=>void;const wait=new Promise<void>(resolve=>{ready=resolve;});
 Object.defineProperty(document,'startViewTransition',{configurable:true,value:vi.fn((callback:()=>void)=>{update=callback;return {ready:wait,finished:new Promise(()=>{}),skipTransition:vi.fn()};})});
 Object.defineProperty(document.documentElement,'animate',{configurable:true,value:vi.fn(()=>({cancel:vi.fn()}))});
 try {
  render(<SettingsProvider><Probe/></SettingsProvider>);await waitFor(()=>expect(screen.getByText('os:light:saved')).toBeTruthy());fireEvent.click(screen.getByText('Reveal Dark'));
  expect(screen.getByText('dark:dark:saving')).toBeTruthy();expect(document.documentElement.dataset.theme).toBe('light');
  await waitFor(()=>expect(screen.getByText('dark:dark:failed')).toBeTruthy());expect(api.patch).toHaveBeenCalledWith('/settings',expect.objectContaining({local:expect.any(Object)}),expect.any(Object));
  update();ready();await Promise.resolve();expect(document.documentElement.dataset.theme).toBe('dark');expect(document.documentElement.style.colorScheme).toBe('dark');
 } finally {cleanup();delete (document as unknown as {startViewTransition?:unknown}).startViewTransition;delete (document.documentElement as unknown as {animate?:unknown}).animate;if(visibility)Object.defineProperty(document,'visibilityState',visibility);}
});
