import assert from 'node:assert/strict';import {readFile,writeFile} from 'node:fs/promises';import {join} from 'node:path';
export async function runUpdateSmoke(window,directory,updates){
 const evaluate=code=>window.webContents.executeJavaScript(code);
 const wait=async code=>{for(let i=0;i<300;i++){if(await evaluate(code).catch(()=>false))return;await new Promise(r=>setTimeout(r,100));}throw new Error('Update check did not settle: '+code);};
 // Exercise real public release discovery with the original trust, no workspace credentials.
 updates.currentVersion='0.3.2';updates.state.currentVersion='0.3.2';await updates.check();const target=updates.available.envelope.manifest.appVersion;assert.ok(target); 
 const before=await evaluate("window.vaultorDesktop.updatesStatus()");assert.equal(before.value.source,'github');
 window.webContents.send('desktop:updates-open');await wait(`document.querySelector('[role=dialog]')?.innerText.includes(${JSON.stringify(target+' is available')})`);await wait("document.querySelector('[role=dialog]')?.innerText.includes('Download and install')||document.querySelector('[role=dialog]')?.innerText.includes('Update and restart')");
 assert.equal(await evaluate("document.querySelector('[role=dialog] details').open"),false);
 assert.ok(await evaluate("document.querySelector('[role=dialog]').innerText.includes('Download and install')||document.querySelector('[role=dialog]').innerText.includes('Update and restart')"));
 // No installation from the unpacked app. Verify actual download/staging in disposable data.
 await updates.stageLatest();assert.equal(updates.candidate.envelope.manifest.appVersion,target);await updates.verifyFile(updates.candidate.file,updates.candidate.envelope);
 window.showInactive();await wait("!document.querySelector('[role=dialog]')?.innerText.includes('Downloading')");
 await new Promise(r=>setTimeout(r,320));await writeFile(join(directory,'updates-oneclick.png'),(await window.webContents.capturePage()).toPNG());
 await evaluate("document.querySelector('[role=dialog] summary').click()");await new Promise(r=>setTimeout(r,100));await writeFile(join(directory,'updates-advanced.png'),(await window.webContents.capturePage()).toPNG());
 const retained=JSON.parse(await readFile(join(updates.directory,'packages.json'),'utf8'));assert.equal(retained.length,1);
 console.log('Disposable packaged Updates check passed: real GitHub discovery/download/original signature, platform pair, default source, compact actions/Advanced and retained staging.');
}
