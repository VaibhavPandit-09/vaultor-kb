import assert from 'node:assert/strict';
import {BrowserWindow} from 'electron';
import {randomUUID} from 'node:crypto';
import {writeFile} from 'node:fs/promises';
import {join} from 'node:path';
export async function runWorkspaceSmoke(window,directory,owned){
 const evaluate=code=>window.webContents.executeJavaScript(code);
 const wait=async(code,target=window)=>{for(let i=0;i<200;i++){if(await target.webContents.executeJavaScript(code).catch(()=>false))return;await new Promise(r=>setTimeout(r,100));}throw Error('Workspace UI did not settle: '+code+' :: '+await target.webContents.executeJavaScript('document.body.innerText')); };
 async function owner(path,method='GET',body){const r=await fetch(owned.address+'/api'+path,{method,headers:{'X-Vaultor-Owner':owned.accessKey,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});assert.ok(r.ok);return r.json();}
 const id=randomUUID();await owner('/owner/workspaces/'+id,'PUT',{name:'Research workspace'});
 window.showInactive();await evaluate("document.querySelector('.desktop-connection-button').click()");await wait("document.body.innerText.includes('Research workspace')");
 await writeFile(join(directory,'workspaces-desktop.png'),(await window.webContents.capturePage()).toPNG());
 await evaluate("[...document.querySelectorAll('[role=dialog] button')].find(b=>b.textContent.includes('Research workspace')).click()");await wait("document.querySelector('.desktop-connection-button')?.textContent==='Research workspace'");
 const current=await evaluate("window.vaultorDesktop.bootstrap().then(r=>r.value.profiles.find(p=>p.id===r.value.active).selectedWorkspaceId)");assert.equal(current,id);
 await evaluate("location.reload()");await wait("document.querySelector('.desktop-connection-button')?.textContent==='Research workspace'");
 const ticket=await owner('/owner/browser-ticket','POST');
 const browser=new BrowserWindow({show:false,width:960,height:760,webPreferences:{partition:'w2-browser-check',contextIsolation:true,sandbox:true}});
 try{
  await browser.loadURL(owned.address+'/access#ticket='+ticket.ticket);
  await wait("document.body.innerText.includes('Owner browser connected.')",browser);await browser.loadURL(owned.address+'/');await wait("Boolean(document.querySelector('.library-view'))",browser);
  await browser.webContents.executeJavaScript("document.querySelector('.desktop-connection-button').click()");await wait("document.body.innerText.includes('Research workspace')",browser);
  browser.showInactive();await writeFile(join(directory,'workspaces-browser.png'),(await browser.webContents.capturePage()).toPNG());
  await browser.webContents.executeJavaScript("[...document.querySelectorAll('[role=dialog] button')].find(b=>b.textContent.includes('Research workspace')).click()");await wait("document.querySelector('.desktop-connection-button')?.textContent==='Research workspace'",browser);
  await browser.webContents.executeJavaScript("location.reload()");await wait("document.querySelector('.desktop-connection-button')?.textContent==='Research workspace'",browser);
  browser.setSize(440,760);await browser.webContents.executeJavaScript("document.querySelector('.desktop-connection-button').click()");await wait("Boolean(document.querySelector('[role=dialog]'))",browser);
  assert.ok(await browser.webContents.executeJavaScript("(()=>{const p=document.querySelector('[role=dialog] section');return p.scrollWidth<=p.clientWidth&&p.getBoundingClientRect().right<=innerWidth;})()"));await writeFile(join(directory,'workspaces-narrow.png'),(await browser.webContents.capturePage()).toPNG());
 }finally{browser.destroy();}
 console.log('Disposable native/browser workspace selection, refresh restoration and narrow layout passed.');
}
