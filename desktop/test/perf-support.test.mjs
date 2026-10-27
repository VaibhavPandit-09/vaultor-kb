import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture, hash, summary, comparison, markdown, isolatedEnvironment } from '../scripts/perf-support.mjs';

test('application environment cannot inherit personal database, credentials or configuration overrides',()=>{
  assert.deepEqual(isolatedEnvironment({Path:'tools',SystemRoot:'windows',TEMP:'temp',SPRING_APPLICATION_JSON:'private',DB_PATH:'personal',STORAGE_PATH:'personal',VAULTOR_OWNER_TOKEN:'secret',HOST_ACCESS_PATH:'personal',NODE_OPTIONS:'inject',JAVA_TOOL_OPTIONS:'inject',GITHUB_TOKEN:'secret'}),{Path:'tools',SystemRoot:'windows',TEMP:'temp'});
});

test('fixtures have deterministic byte bounds, distinct edit markers and source fidelity sentinels',()=>{
  for(const kib of [64,256,512,1024]){
    const raw=fixture(kib);
    assert.equal(Buffer.byteLength(raw),kib*1024-(kib===1024?4096:0));
    assert.equal(hash(raw),hash(fixture(kib)));
    for(const marker of ['Beginning','Middle','End'])assert.equal(raw.split(marker+' marker paragraph.').length,2);
    for(const syntax of ['\ufeff---\r\n','```ts','| :--- | ---: |','[ref]: ./unchanged.md "keep"','<!-- untouched -->','**bold**','_italic_'])assert.ok(raw.includes(syntax));
  }
});

test('nearest rank percentiles preserve unavailable metrics',()=>{
  assert.deepEqual(summary([]),{samples:0,p50:null,p95:null});
  assert.deepEqual(summary([5,1,4,2,3]),{samples:5,p50:3,p95:5});
});

test('historical comparisons gate compatibility and ignore normal absolute timing noise',()=>{
  const run=value=>({compatibility:'same',id:'prior',documents:[{kib:64,status:'editable',metrics:{typingFrameMs:{p95:value}}}]});
  assert.equal(comparison(run(80),{...run(30),compatibility:'different'}).compatible,false);
  assert.equal(comparison(run(19),run(10)).rows[0].warning,false);
  const regression=comparison(run(80),run(30)).rows[0];assert.equal(regression.warning,true);assert.ok(regression.change>100);
  assert.equal(comparison({...run(80),documents:[{kib:64,status:'expected-refusal'}]},run(30)).rows.length,0);
});

test('failure and safe-refusal reports never fabricate unavailable timings',()=>{
  const report=markdown({runtime:'test',environment:{commit:'abc',appVersion:'1'},mode:'smoke',id:'now',success:false,error:'timeout',documents:[{kib:1024,status:'expected-refusal',sourcePreserved:true}],cleanup:'removed'});
  assert.match(report,/HARNESS FAILURE/);assert.match(report,/unavailable/);assert.match(report,/Error: timeout/);assert.match(report,/expected-refusal/);
});
