import { createHash } from 'node:crypto';

export const protocol = 'vaultor-native-perf-v1';
export const hash = value => createHash('sha256').update(value).digest('hex');
export const percentile = (values, p) => values.length ? [...values].sort((a,b)=>a-b)[Math.ceil(values.length*p)-1] : null;
export const summary = values => ({ samples: values.length, p50: percentile(values,.5), p95: percentile(values,.95) });

export function isolatedEnvironment(base) {
  const allowed=new Set('ALLUSERSPROFILE APPDATA COMSPEC HOMEDRIVE HOMEPATH LOCALAPPDATA NUMBER_OF_PROCESSORS OS PATH PATHEXT PROCESSOR_ARCHITECTURE PROCESSOR_IDENTIFIER PROCESSOR_LEVEL PROCESSOR_REVISION PROGRAMDATA PROGRAMFILES PROGRAMFILES(X86) PROGRAMW6432 PUBLIC SESSIONNAME SYSTEMDRIVE SYSTEMROOT TEMP TMP USERDOMAIN USERNAME USERPROFILE WINDIR'.split(' '));
  return Object.fromEntries(Object.entries(base).filter(([key])=>allowed.has(key.toUpperCase())));
}

// Same prose-heavy shape as native-large-markdown-check.mjs, with exact byte
// sizes, mixed CRLF/LF, BOM, protected syntax and stable edit markers.
export function fixture(kib) {
  const head='\ufeff---\r\ntitle: preserve\r\n---\r\n\r\nBeginning marker paragraph.\r\n\r\n';
  const chunk='## Technical section\r\n\r\nOrdinary documentation with **bold**, _italic_, `inline code` and [a link](https://example.com/docs). '+ 'Technical words for testing. '.repeat(60)+'\r\n\r\n- first list item\r\n- second list item\r\n\r\n```ts\r\nconst revision = 1;\r\n```\r\n\r\n| Action | Result |\r\n| :--- | ---: |\r\n| Save | explicit |\r\n\r\n';
  const tail='End marker paragraph.\r\n\r\n[label][ref]\r\n\r\n[ref]: ./unchanged.md "keep"\r\n\r\n<!-- untouched -->\r\n';
  // 1 MiB reserves 4 KiB for edits, as the existing qualification does.
  const target=kib*1024-(kib===1024?4096:0);
  const count=Math.floor((target-Buffer.byteLength(head+tail+'Middle marker paragraph.\r\n\r\n')-100)/Buffer.byteLength(chunk));
  let raw=head+chunk.repeat(Math.floor(count/2))+'Middle marker paragraph.\r\n\r\n'+chunk.repeat(Math.ceil(count/2));
  raw+='Padding '+ 'p'.repeat(target-Buffer.byteLength(raw+tail+'Padding \n\n'))+'\n\n'+tail;
  return raw;
}

export function comparison(current, previous) {
  if(!previous) return { compatible:false, reason:'No previous successful run.' };
  if(current.compatibility!==previous.compatibility) return { compatible:false, reason:'Fixture, workload, instrumentation, build toolchain or environment differs.' };
  const rows=[];
  for(const doc of current.documents) {
    const old=previous.documents.find(x=>x.kib===doc.kib);
    if(!old || old.status!==doc.status) continue;
    for(const [metric,value] of Object.entries(doc.metrics??{})) {
      const before=old.metrics?.[metric]?.p95, after=value.p95;
      if(before==null||after==null)continue;
      const change=before ? (after-before)/before*100 : null;
      rows.push({kib:doc.kib,metric,previous:before,current:after,change,
        warning:metric!=='rendererHeapMiB'&&after-before>20&&change>20});
    }
  }
  return { compatible:true, previous:previous.id, rows };
}

export function markdown(result) {
  const f=n=>n==null?'unavailable':n.toFixed(1);
  const lines=['# Vaultor Performance Report','',`Runtime: ${result.runtime}`,`Commit: ${result.environment.commit} · App: ${result.environment.appVersion} · Mode: ${result.mode}`,`Status: ${result.success?'completed':'HARNESS FAILURE'} · ${result.id}`,'', '| Document | Open p95 | Usable p95 | Typing p50 / p95 | Worker p95 | Save p95 | Source |','| --- | ---: | ---: | ---: | ---: | ---: | --- |'];
  for(const d of result.documents) { const m=d.metrics??{}; lines.push(`| ${d.kib} KiB (${d.status}) | ${f(m.openMs?.p95)} | ${f(m.usableMs?.p95)} | ${f(m.typingFrameMs?.p50)} / ${f(m.typingFrameMs?.p95)} | ${f(m.workerValidationMs?.p95)} | ${f(m.saveMs?.p95)} | ${d.sourcePreserved?'passed':'unmeasured'} |`); }
  lines.push('','Times are ms. Typing is keydown → next animation-frame callback, not paint/presentation latency. Open is click → mounted editor; usable additionally requires a successful edit, worker acknowledgement and a frame.');
  for(const [name,c] of Object.entries(result.comparisons??{})) {
    lines.push('',`Comparison (${name}): ${c.compatible?c.previous:c.reason}`);
    if(c.compatible) {
      lines.push('| Document / p95 metric | Previous | Current | Change |','| --- | ---: | ---: | ---: |');
      for(const r of c.rows.filter(r=>['openMs','usableMs','typingFrameMs','workerValidationMs','saveMs'].includes(r.metric)))lines.push(`| ${r.kib} / ${r.metric} | ${f(r.previous)} | ${f(r.current)} | ${r.change==null?'n/a':r.change.toFixed(0)+'%'}${r.warning?' WARNING':''} |`);
    }
  }
  if(result.documents.some(d=>d.metrics?.typingFrameMs?.p95>50)) lines.push('','Performance warning: typing-to-frame p95 exceeds 50 ms.');
  if(result.error) lines.push('',`Error: ${result.error}`);
  lines.push('',`Cleanup: ${result.cleanup??'not completed'}. No unexpected crashes: ${result.success?'passed':'not established'}.`,'','Raw operation samples, transaction dispatch, selection, undo/redo, long tasks, memory and unavailable-metric reasons are in the timestamped JSON.');
  return lines.join('\n')+'\n';
}
