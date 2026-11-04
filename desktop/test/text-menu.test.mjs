import { test } from 'node:test';
import assert from 'node:assert/strict';
import { textMenuTemplate } from '../src/text-menu.mjs';
test('ordinary surfaces do not receive browser navigation or privileged file actions', () => {
  assert.deepEqual(textMenuTemplate({ isEditable:false, selectionText:'' }), []);
  assert.deepEqual(textMenuTemplate({ isEditable:false, selectionText:'selected', editFlags:{canCopy:true} }), [{role:'copy',enabled:true}]);
});
test('native editing respects Electron capability flags', () => {
  const template = textMenuTemplate({isEditable:true,selectionText:'',editFlags:{canUndo:false,canRedo:false,canCut:false,canCopy:false,canPaste:true,canSelectAll:true}});
  assert.equal(template.find(item=>item.role==='paste').enabled,true);
  assert.equal(template.find(item=>item.role==='cut').enabled,false);
  assert.equal(template.find(item=>item.role==='undo').enabled,false);
  assert.deepEqual(template.filter(item=>item.role).map(item=>item.role),['undo','redo','cut','copy','paste','selectAll']);
});
