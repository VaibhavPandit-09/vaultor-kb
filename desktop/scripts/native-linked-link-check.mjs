import assert from 'node:assert/strict';
import {dialog} from 'electron';
import {mkdir,mkdtemp,writeFile,readFile,chmod} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,basename} from 'node:path';
import {LinkedSearch} from '../src/linked/search.mjs';

/** One disposable folder, actual link DOM/CSS and native resolution; no graph prerequisite. */
export async function runLinkedLinkCheck(window,directory){
 assert.equal(process.platform,'win32');assert.ok(basename(directory).startsWith('vaultor-chrome-native-'));
 const wc=window.webContents,evaluate=code=>wc.executeJavaScript(code),delay=ms=>new Promise(r=>setTimeout(r,ms));
 const wait=async(code,label)=>{for(let n=0;n<300;n++){if(await evaluate(code).catch(()=>false))return;await delay(100);}throw Error(label+': '+await evaluate('document.body.innerText'));};
 const active=`document.querySelector('[data-note-pane][data-focused="true"]')`;
 const root=join(await mkdtemp(join(tmpdir(),'vaultor-linked-links-')),'Docs');await mkdir(join(root,'Backend'),{recursive:true});
 const sources={'Index.md':'\ufeff# Index\r\n\r\nSee [Architecture](./Architecture.md).\r\nSee [API](./Backend/API.md#endpoint-details).\r\n[Encoded](./Space%20name.md#part)\r\n[Web](https://example.test/docs)\r\n[Reference][arch] and [[Architecture|Alias]].\r\n\r\n[arch]: ./Architecture.md\r\n','Architecture.md':'# Architecture\n','Backend/API.md':'# API\n\n## Endpoint Details\n\nEndpoint body.\n','Space name.md':'# Encoded\n\n## Part\n','ReadOnly.md':'# Read only\n\n[Inline](./Architecture.md) [Reference][arch]\n\n[arch]: ./Architecture.md\n'};
 for(const [path,source] of Object.entries(sources))await writeFile(join(root,path),source);await chmod(join(root,'ReadOnly.md'),0o444);
 const originalPicker=dialog.showOpenDialog,originalTick=LinkedSearch.prototype.tick;
 dialog.showOpenDialog=async()=>({canceled:false,filePaths:[root]});LinkedSearch.prototype.tick=async function(request){this.registry.check(request);};
 const external=[];wc.setWindowOpenHandler(({url})=>{external.push(url);return {action:'deny'};});
 const openIndex=async()=>{await evaluate(`[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Index.md').click()`);await wait(`${active}?.querySelector('.tiptap h1')?.textContent==='Index'`,'Index editor');};
 const clickLink=async label=>{const point=await evaluate(`(()=>{const a=[...${active}.querySelectorAll('a.markdown-link')].find(a=>a.textContent===${JSON.stringify(label)});a.scrollIntoView({block:'center'});const r=a.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);wc.sendInputEvent({type:'mouseDown',...point,button:'left',clickCount:1,modifiers:[]});wc.sendInputEvent({type:'mouseUp',...point,button:'left',clickCount:1,modifiers:[]});};
 try{
  window.setSize(1320,850);window.show();window.focus();await evaluate(`document.querySelector('[aria-label="Link folder"]').click()`);
  await wait(`[...document.querySelectorAll('button')].some(b=>b.getAttribute('aria-expanded')==='false'&&b.textContent.includes('Docs'))`,'Source grant');
  await evaluate(`[...document.querySelectorAll('button')].find(b=>b.getAttribute('aria-expanded')==='false'&&b.textContent.includes('Docs')).click()`);await wait(`[...document.querySelectorAll('button')].some(b=>b.textContent.trim()==='Index.md')`,'Root entries');await openIndex();
  const themes=await evaluate(`(async()=>{const out=[];for(const theme of ['light','dark','oled']){document.documentElement.dataset.theme=theme;document.documentElement.classList.toggle('dark',theme!=='light');await new Promise(resolve=>setTimeout(resolve,300));const a=${active}.querySelector('a.markdown-link'),s=getComputedStyle(a),plain=getComputedStyle(a.parentElement);const canvas=document.createElement('canvas');canvas.width=canvas.height=1;const c=canvas.getContext('2d',{willReadFrequently:true});const luminance=color=>{c.clearRect(0,0,1,1);c.fillStyle=color;c.fillRect(0,0,1,1);const rgb=[...c.getImageData(0,0,1,1).data].slice(0,3).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;});return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722;};const x=luminance(s.color),y=luminance(getComputedStyle(document.documentElement).getPropertyValue('--surface-1'));out.push({theme,color:s.color,plain:plain.color,underline:s.textDecorationLine,contrast:(Math.max(x,y)+.05)/(Math.min(x,y)+.05),tabIndex:a.tabIndex});}return out;})()`);
  for(const theme of themes){assert.notEqual(theme.color,theme.plain);assert.equal(theme.underline,'underline');assert.equal(theme.tabIndex,0);assert.ok(theme.contrast>=4.5,JSON.stringify(theme));}
  await writeFile(join(directory,'linked-link-rendering.png'),(await wc.capturePage()).toPNG());
  await clickLink('Architecture');await wait(`${active}?.querySelector('.tiptap h1')?.textContent==='Architecture'`,'Single click unseen root target without graph');await openIndex();
  await clickLink('API');await wait(`${active}?.querySelector('.tiptap h1')?.textContent==='API'`,'Single click unopened nested target');await openIndex();
  await clickLink('Encoded');await wait(`${active}?.querySelector('.tiptap h1')?.textContent==='Encoded'`,'Encoded path/fragment');await openIndex();
  await clickLink('Web');await wait(`true`,'External dispatch');await delay(150);assert.deepEqual(external,['https://example.test/docs']);
  await evaluate(`${active}.querySelector('.tiptap').focus()`);wc.sendInputEvent({type:'keyDown',keyCode:'Tab'});wc.sendInputEvent({type:'keyUp',keyCode:'Tab'});await wait(`document.activeElement?.matches('a.markdown-link')`,'Keyboard Tab to link');
  assert.equal(await evaluate(`getComputedStyle(document.activeElement).outlineStyle`),'solid');wc.sendInputEvent({type:'keyDown',keyCode:'Enter'});wc.sendInputEvent({type:'keyUp',keyCode:'Enter'});await wait(`${active}?.querySelector('.tiptap h1')?.textContent==='Architecture'`,'Keyboard Enter activation');
  await evaluate(`[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='ReadOnly.md').click()`);await wait(`${active}?.querySelector('[aria-label="Read-only Markdown preview"] a.markdown-link')`,'Formatted read-only links');
  await clickLink('Reference');await wait(`${active}?.querySelector('.tiptap h1')?.textContent==='Architecture'`,'Read-only reference-style navigation');
  for(const [path,source] of Object.entries(sources))assert.deepEqual(await readFile(join(root,path)),Buffer.from(source));
  await writeFile(join(directory,'linked-link-results.json'),JSON.stringify({themes,graphIndexDisabled:true,sourceBytesUnchanged:true,externalDispatch:external}));console.log('Linked link acceptance passed: real anchors/CSS in light/dark/OLED, Single click, nested/encoded/fragments, Tab/Enter, external HTTPS and read-only reference links; graph indexing disabled and source bytes unchanged.');
 }finally{dialog.showOpenDialog=originalPicker;LinkedSearch.prototype.tick=originalTick;await chmod(join(root,'ReadOnly.md'),0o644);}
}
