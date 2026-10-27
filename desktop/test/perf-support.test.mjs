import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture, hash, summary, comparison, markdown, isolatedEnvironment } from '../scripts/perf-support.mjs';
import { structuralCases, structureMatrix } from '../scripts/perf-structures.mjs';

test('structural matrix is compact, deterministic and retains distinct structural targets',()=>{
  const full=structuralCases(),smoke=structuralCases({smoke:true});
  assert.equal(full.length,7);
  assert.equal(full.filter(f=>f.admission==='editable').length,5);
  assert.deepEqual(full.map(f=>f.kib),[1024,256,512,256,1024,512,1025]);
  for(const f of full){
    assert.equal(hash(f.text),hash(structuralCases({caseName:f.id})[0].text));
    assert.equal(Buffer.byteLength(f.text),f.kib*1024-(f.kib===1024?4096:0));
    for(const t of f.targets)assert.equal(f.text.split(t.needle).length,2);
    assert.ok(f.complexity.longestLineUnits<16384);
    assert.equal(smoke.find(s=>s.id===f.id).kib,f.admission==='editable'?64:f.kib);
  }
  for(const type of ['tableCell','codeBlock','listItem'])assert.ok(full.find(f=>f.type==='mixed').targets.some(t=>t.kind===type));
  assert.throws(()=>structuralCases({caseName:'unknown'}));
  assert.deepEqual(structureMatrix.map(f=>f.kib),[1024,256,512,256,1024,512,1025]);
});

test('comparisons cannot match different structures at the same size or mix suites',()=>{
  const doc=caseId=>({caseId,kib:256,status:'editable',metrics:{typingFrameMs:{p95:20}}});
  const run=documents=>({suite:'structures',compatibility:'same',id:'prior',documents});
  assert.equal(comparison(run([doc('dense-256')]),run([doc('tables-256')])).rows.length,0);
  assert.equal(comparison(run([doc('dense-256')]),run([doc('dense-256')])).rows.length,1);
  assert.equal(comparison(run([]),{...run([]),suite:'sizes'}).compatible,false);
});

test('bounded structural prefixes retain matrix order, full sizes and strict case validation',()=>{
  assert.deepEqual(structuralCases({caseName:'prose,tables'}).map(f=>f.caseId),['prose-1024','tables-256']);
  assert.deepEqual(structuralCases({smoke:true,caseName:'prose,tables'}).map(f=>f.caseId),['prose-64','tables-64']);
  assert.throws(()=>structuralCases({caseName:'prose,unknown'}));
  assert.throws(()=>structuralCases({caseName:'prose,'}));
});

test('application environment cannot inherit personal database, credentials or configuration overrides',()=>{
  assert.deepEqual(isolatedEnvironment({Path:'tools',SystemRoot:'windows',TEMP:'temp',SPRING_APPLICATION_JSON:'private',DB_PATH:'personal',STORAGE_PATH:'personal',VAULTOR_OWNER_TOKEN:'secret',HOST_ACCESS_PATH:'personal',NODE_OPTIONS:'inject',JAVA_TOOL_OPTIONS:'inject',GITHUB_TOKEN:'secret'}),{Path:'tools',SystemRoot:'windows',TEMP:'temp'});
});

test('fixtures have deterministic byte bounds, distinct edit markers and source fidelity sentinels',()=>{
  const pinned={64:'548693f5977560f8070a57f9fbe016d5c1b87afd65ee262d611f64f0b990f673',256:'bc5b7e9169a9d3582c5467ce4bb3f847c7e0630444f60c7f7a5fc42a0aadac92',512:'4988413e6ae02bdcd278304be7b811aff040fcb14152ef1d4d68739c05c1d63f',1024:'3ca75cba5e265b91347152d4971d61fdbd2b10d2a6a7f8a64d0f44d1b91fca65'};
  for(const kib of [64,256,512,1024]){
    const raw=fixture(kib);
    assert.equal(Buffer.byteLength(raw),kib*1024-(kib===1024?4096:0));
    assert.equal(hash(raw),hash(fixture(kib)));
    assert.equal(hash(raw),pinned[kib],'Original size-only fixture bytes changed');
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
