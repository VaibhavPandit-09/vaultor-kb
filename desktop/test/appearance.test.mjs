import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {deviceAppearance,windowBackground} from '../src/appearance.mjs';
test('native appearance persists normalized device theme and resolves OS without changing it',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'vaultor-theme-test-')),appearance=await deviceAppearance(directory);assert.equal(appearance.theme,'os');await appearance.set('oled');assert.equal((await deviceAppearance(directory)).theme,'oled');assert.equal(windowBackground('oled',false),'#000000');assert.equal(windowBackground('os',true),'#020617');assert.equal(windowBackground('os',false),'#f6f7f9');await appearance.set('invalid');assert.equal(JSON.parse(await readFile(join(directory,'appearance.json'),'utf8')).theme,'os');await writeFile(join(directory,'appearance.json'),'broken');assert.equal((await deviceAppearance(directory)).theme,'os');
});
test('parser-blocking bootstrap sets first-paint classes, scheme and background for every theme and corrupt/blocked cache',()=>{
 const script=readFileSync(new URL('../../frontend/public/theme-bootstrap.js',import.meta.url),'utf8');
 for(const preference of ['light','dark','oled','os','invalid','corrupt','blocked'])for(const osDark of [true,false]){
  const root={dataset:{},classList:{toggle(name,value){this[name]=value;}},style:{}};
  vm.runInNewContext(script,{document:{documentElement:root},localStorage:{getItem(){if(preference==='blocked')throw Error('blocked');return preference==='corrupt'?'bad json':JSON.stringify({theme:preference});}},window:{matchMedia:()=>({matches:osDark})}});
  const expected=['light','dark','oled'].includes(preference)?preference:osDark?'dark':'light';assert.equal(root.dataset.theme,expected);assert.equal(root.style.colorScheme,expected==='light'?'light':'dark');assert.equal(root.classList.dark,expected!=='light');assert.match(root.style.backgroundColor,expected==='oled'?/#000000/:expected==='dark'?/#020617/:/#f6f7f9/);
 }
 const html=readFileSync(new URL('../../frontend/index.html',import.meta.url),'utf8');assert.ok(html.indexOf('/theme-bootstrap.js')<html.indexOf('<body>'));assert.ok(!html.includes('script async'));
});
