import * as ResEdit from 'resedit';
import {readFile,writeFile} from 'node:fs/promises';
export async function brandWindows(executable,icon){
 const exe=ResEdit.NtExecutable.from(await readFile(executable),{ignoreCert:true});const resources=ResEdit.NtExecutableResource.from(exe);
 const ico=ResEdit.Data.IconFile.from(await readFile(icon));
 const groups=resources.entries.filter(e=>e.type===14);if(!groups.length)throw new Error('Executable has no icon group.');
 for(const group of groups)ResEdit.Resource.IconGroupEntry.replaceIconsForResource(resources.entries,group.id,group.lang,ico.icons.map(item=>item.data));
 resources.outputResource(exe);await writeFile(executable,Buffer.from(exe.generate()));
}
