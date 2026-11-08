import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),config=require('../electron-builder.cjs');
test('packaged chrome qualification includes its actual native script dependencies',async()=>{
 const checked=new Set(),visit=async name=>{if(checked.has(name))return;checked.add(name);assert.ok(config.files.includes('scripts/'+name),'Not shipped: '+name);const source=await readFile(new URL('../scripts/'+name,import.meta.url),'utf8');for(const match of source.matchAll(/(?:import\(|from\s+)['"]\.\/(native-[^'"]+\.mjs)['"]/g))await visit(match[1]);};
 await visit('native-chrome-smoke.mjs');assert.ok(checked.has('native-release-integrity-check.mjs'));assert.ok(checked.has('native-d4-check.mjs'));
});
