// @vitest-environment jsdom
import {render,screen,fireEvent,waitFor,cleanup} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
import {SettingsProvider,useSettings} from './settings';
import api from './api';
import {mergeSettingsPatch,type SettingsPatch} from './settingsPatch';
vi.mock('./api',()=>({default:{get:vi.fn(),patch:vi.fn()}}));
afterEach(()=>{cleanup();vi.restoreAllMocks();localStorage.clear();vi.unstubAllGlobals();});
function Probe(){const s=useSettings();return <><span>{s.settings.local.theme}:{s.resolvedTheme}:{s.saveStatus}</span><button onClick={()=>s.updateLocalSetting('theme','dark')}>Dark</button><button onClick={()=>s.updateWorkspaceSetting('maxOpenNotes',3)}>Three</button><button onClick={()=>s.retrySave()}>Retry</button><button onClick={()=>s.updateLocalSetting('theme','oled')}>OLED</button><button onClick={()=>s.toggleTheme()}>Cycle</button><span data-testid="transparency">{s.settings.local.uiTransparency}</span></>;}
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
  await waitFor(()=>expect(screen.getByText(/:saved$/)).toBeTruthy());expect(api.patch).toHaveBeenLastCalledWith('/settings',{workspace:{maxOpenNotes:3}});expect(doc.local).toEqual({other:{theme:'light'}});
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
