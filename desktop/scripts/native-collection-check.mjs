import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { join, basename } from 'node:path';
import { randomUUID } from 'node:crypto';
import { nativeTheme } from 'electron';

export async function runCollectionCheck(window,directory,owned) {
 assert.ok(basename(directory).startsWith('vaultor-chrome-native-'));
 const wc=window.webContents, evaluate=code=>wc.executeJavaScript(code);
 const delay=ms=>new Promise(r=>setTimeout(r,ms));
 const wait=async(code,label)=>{for(let i=0;i<500;i++){if(await evaluate(code).catch(()=>false))return;await delay(100);}throw Error(label+': '+await evaluate('document.body.innerText'));};
 const click=label=>evaluate(`(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(label)}&&!b.disabled&&!b.closest('[hidden]'));if(!b)throw Error('Missing button '+${JSON.stringify(label)});b.click()})()`);
 const request=async(path,method='GET',body)=>{const r=await fetch(owned.address+'/api'+path,{method,headers:{'X-Vaultor-Owner':owned.accessKey,'X-Vaultor-Protocol':'3',...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});assert.ok(r.ok,path+' '+r.status);return r.status===204?null:r.json();};
 let parentId;const nodes=[];
 for(const name of ['docs','android','releases']){const item=await request('/collections/creations/'+randomUUID(),'PUT',{name,parentId,resourceIds:[]});nodes.push(item);parentId=item.id;}
 for(let n=0;n<100;n++)await request('/resources','POST',{title:'Release note '+n,content:{type:'doc',content:[]},collectionId:parentId});
 await request('/collections/creations/'+randomUUID(),'PUT',{name:'Immediate child',parentId,resourceIds:[]});
 window.setMinimumSize(440,500);window.setSize(1320,900);window.showInactive();nativeTheme.themeSource='dark';
 await click('Collections');await wait("document.querySelector('[aria-label=\"Search collections\"]')",'Directory');
 await evaluate(`(()=>{const i=document.querySelector('[aria-label="Search collections"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(i,'releases');i.dispatchEvent(new Event('input',{bubbles:true}));})()`);
 await wait("[...document.querySelectorAll('.library-resource strong')].some(s=>s.textContent==='releases')",'Search nested collection');await evaluate("[...document.querySelectorAll('.library-resource strong')].find(s=>s.textContent==='releases').closest('button').click()");
 await wait("document.querySelector('.collection-transform h1')?.textContent==='releases'&&document.querySelector('.collection-transform .library-row')",'Collection');
 const scroll=async top=>{await evaluate(`document.querySelector('.collection-transform').scrollTop=${top}`);await delay(400);};
 const capture=async name=>writeFile(join(directory,name),(await wc.capturePage()).toPNG());
 await scroll(240);await capture(process.env.VAULTOR_COLLECTION_BEFORE==='1'?'collection-before.png':'collection-compact.png');
 if(process.env.VAULTOR_COLLECTION_BEFORE==='1'){console.log('Captured baseline collection header: '+directory);return;}
 await wait("document.querySelector('[aria-label=\"Collection path\"]')",'Path disclosure');
 const samples=await evaluate(`new Promise(resolve=>{const v=document.querySelector('.collection-transform'),samples=[];let frame=0;const tick=()=>{const title=v.querySelector('h1').getBoundingClientRect(),nav=v.querySelector('.collection-breadcrumb'),p=Number(getComputedStyle(v).getPropertyValue('--library-progress'));samples.push({p,titleTop:title.top,titleBottom:title.bottom,navBottom:nav.getBoundingClientRect().bottom,navVisible:getComputedStyle(nav).visibility!=='hidden'&&Number(getComputedStyle(nav).opacity)>.02,overflow:v.scrollWidth>v.clientWidth});if(frame%9===0)v.scrollTop=[0,80,240,20,110,0][Math.floor(frame/9)%6];if(++frame<180)requestAnimationFrame(tick);else resolve(samples);};requestAnimationFrame(tick);})`);
 assert.ok(samples.length===180);assert.ok(samples.every(s=>!s.overflow&&(!s.navVisible||s.titleTop>=s.navBottom-1)),JSON.stringify(samples.filter(s=>s.overflow||(s.navVisible&&s.titleTop<s.navBottom-1)).slice(0,4)));
 await scroll(0);await capture('collection-expanded.png');await scroll(80);await capture('collection-intermediate.png');
 await scroll(240);await evaluate("document.querySelector('[aria-label=\"Collection path\"]').click()");await wait("document.querySelector('[role=dialog][aria-label=\"Collection path\"]')",'Ancestors');
 assert.ok(await evaluate("document.querySelector('[role=dialog][aria-label=\"Collection path\"]').textContent.includes('android')"));await wc.sendInputEvent({type:'keyDown',keyCode:'Escape'});await wc.sendInputEvent({type:'keyUp',keyCode:'Escape'});
 window.setSize(680,760);await delay(300);await scroll(240);await capture('collection-narrow.png');
 assert.ok(await evaluate("document.querySelector('.collection-transform').scrollWidth<=document.querySelector('.collection-transform').clientWidth"));
 await wc.debugger.attach('1.3');try{await wc.debugger.sendCommand('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});await scroll(0);await scroll(240);assert.equal(await evaluate("Number(getComputedStyle(document.querySelector('.collection-transform')).getPropertyValue('--library-progress'))"),1);await capture('collection-reduced.png');}finally{await wc.debugger.sendCommand('Emulation.setEmulatedMedia',{features:[]});wc.debugger.detach();}

 await click('Collections');await wait("document.querySelector('[aria-label=\"Search collections\"]')",'Directory return');
 await evaluate(`(()=>{const i=document.querySelector('[aria-label="Search collections"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(i,'');i.dispatchEvent(new Event('input',{bubbles:true}));})()`);
 await wait("document.querySelector('[aria-label=\"Collections\"] [aria-pressed=\"true\"]')?.textContent==='All'&&document.querySelectorAll('[aria-label=\"Collection directory\"] [data-collection-open]').length===4",'All descendants visible');await capture('collections-all.png');
 await click('Hierarchy');await wait("document.querySelectorAll('[aria-label=\"Collection directory\"] [data-collection-open]').length===1",'Roots only');
 await evaluate("document.querySelector('[data-collection-open]').focus()");wc.sendInputEvent({type:'keyDown',keyCode:'Right'});wc.sendInputEvent({type:'keyUp',keyCode:'Right'});
 await wait("document.querySelectorAll('[aria-label=\"Collection directory\"] [data-collection-open]').length===2",'Keyboard expansion');await capture('collections-hierarchy.png');
 for(let n=0;n<50;n++){const settings=await request('/settings');if(Object.values(settings.local).some(local=>local.collectionView==='hierarchy'))break;await delay(100);if(n===49)throw Error('View preference did not persist');}
 wc.reload();await wait("document.querySelector('[aria-label=\"Collections\"] [aria-pressed=\"true\"]')?.textContent==='Hierarchy'",'Preference after reload');
 // Grow the same selected branch to a deep, long path; resource identity stays fixed.
 let ancestor;for(let n=0;n<9;n++){const c=await request('/collections/creations/'+randomUUID(),'PUT',{name:'Long parent collection '+n+' with documentation context',parentId:ancestor,resourceIds:[]});ancestor=c.id;}
 await request('/collections/'+nodes[0].id+'/parent','PUT',{parentId:ancestor});
 const longTitle='A long release collection name that needs two lines in narrower desktop windows';await request('/collections/'+parentId,'PUT',{name:longTitle});
 await click('All');await wait("[...document.querySelectorAll('[data-collection-open]')].some(b=>b.textContent.includes('A long release collection'))",'Deep directory');
 await evaluate("[...document.querySelectorAll('[data-collection-open]')].find(b=>b.textContent.includes('A long release collection')).click()");await wait("document.querySelector('.collection-transform h1')?.textContent.startsWith('A long release')",'Long collection');
 for(const width of [1320,680,440]){window.setSize(width,760);await delay(200);for(const top of [0,40,80,240,20,0]){await scroll(top);assert.ok(await evaluate("(()=>{const v=document.querySelector('.collection-transform'),n=v.querySelector('.collection-breadcrumb'),t=v.querySelector('h1');return v.scrollWidth<=v.clientWidth&&(getComputedStyle(n).visibility==='hidden'||Number(getComputedStyle(n).opacity)<.02||t.getBoundingClientRect().top>=n.getBoundingClientRect().bottom-1);})()"),'Deep geometry '+width+'/'+top);}await capture('collection-deep-'+width+'.png');}
 nativeTheme.themeSource='light';await wait("document.documentElement.dataset.theme==='light'",'Light theme');await scroll(240);await capture('collection-deep-light-compact.png');
 await writeFile(join(directory,'collection-motion-samples.json'),JSON.stringify(samples));
 console.log('Collection native geometry passed: 180 motion frames, reversals, path access, narrow and reduced motion. Evidence: '+directory);
}
