import {expect,it} from 'vitest';
import {settingsDiff,combineSettingsPatches,mergeSettingsPatch} from './settingsPatch';
it('sends only changed leaves and preserves other device settings',()=>{
  const before={workspace:{maxOpenNotes:2,autosaveDelay:0},local:{a:{theme:'os'},b:{theme:'dark'}}};
  const next={...before,workspace:{...before.workspace,maxOpenNotes:3}};
  const patch=settingsDiff(before,next);expect(patch).toEqual({workspace:{maxOpenNotes:3}});
  expect(mergeSettingsPatch({...before,workspace:{maxOpenNotes:2,autosaveDelay:321}},patch)).toEqual({...next,workspace:{maxOpenNotes:3,autosaveDelay:321}});
});
it('retains failed removals when combining a retry with a newer edit',()=>{
  const removal=settingsDiff({keybindings:{toggleSidebar:{windows:'Mod+X'}}},{keybindings:{}});
  const combined=combineSettingsPatches(removal,{local:{a:{theme:'os'}}});
  expect(combined).toEqual({keybindings:{toggleSidebar:null},local:{a:{theme:'os'}}});
});
