import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import * as R from 'resedit';
import {brandWindows} from '../scripts/brand-windows.mjs';
test('Windows branding replaces executable icon data with the canonical Vaultor ICO',async()=>{
 const source=new URL('../node_modules/electron/dist/electron.exe',import.meta.url);
 if(process.platform!=='win32')return;
 const dir=await mkdtemp(join(tmpdir(),'vaultor-brand-test-')),target=join(dir,'Vaultor.exe'),icon=new URL('../assets/vaultor.ico',import.meta.url);
 await writeFile(target,await readFile(source));await brandWindows(target,icon);
 const expected=R.Data.IconFile.from(await readFile(icon)).icons.map(i=>Buffer.from(i.data.isRaw()?i.data.bin:i.data.generate()));
 const resource=R.NtExecutableResource.from(R.NtExecutable.from(await readFile(target)));
 for(const group of R.Resource.IconGroupEntry.fromEntries(resource.entries)){
  const actual=group.getIconItemsFromEntries(resource.entries).map(i=>Buffer.from(i.isRaw()?i.bin:i.generate()));assert.deepEqual(actual,expected);
 }
});
