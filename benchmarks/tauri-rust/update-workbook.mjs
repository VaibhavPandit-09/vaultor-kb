import fs from 'node:fs/promises';
import { join, basename } from 'node:path';
import { FileBlob, SpreadsheetFile, Workbook } from '@oai/artifact-tool';
const root = process.argv[2], path = join(root, 'vaultor_tauri_rust_benchmark_tracker.xlsx');
const csvText = await fs.readFile(join(root, 'benchmark_runs.csv'), 'utf8');
const source = await Workbook.fromCSV(csvText, { sheetName: 'CSV' });
const values = source.worksheets.getItemAt(0).getUsedRange().values.filter(r => r[0]);
const [headers, ...rows] = values;
const failures = new Set(rows.filter(r => ['run_failure','run_invalidated'].includes(r[11])).map(r => r[16]));
const normalized = rows.map(row => row.map((value, index) => index === 12 && value !== '' && value !== null ? Number(value) : index === 10 ? Number(value) : index === 14 ? (['true','Y'].includes(String(value)) && !failures.has(row[16]) ? 'Y' : 'N') : value));
const wb = await SpreadsheetFile.importXlsx(await FileBlob.load(path));
const raw = wb.worksheets.getItem('Raw Runs');
raw.getRange(`A5:R${Math.max(1004,rows.length+4)}`).clear({ applyTo: 'contents' });
raw.getRange('A4:R4').values = [headers];
if(rows.length) raw.getRange(`A5:R${rows.length+4}`).values = normalized;
if(rows.length) raw.getRange(`M5:M${rows.length+4}`).setNumberFormat('0.0');
raw.getRange('A2').values = [['Generated from benchmark_runs.csv; corrections/failures retained and marked N. Do not edit measurements here.']];
const dashboard = wb.worksheets.getItem('Dashboard');
const latest = normalized.findLast(r => r[14] === 'Y' && r[9]);
dashboard.getRange('B5:B9').values = [['electron-java'],['tauri-rust'],[latest?.[5] ?? 'unmeasured'],['idle'],[latest?.[9] ?? 'unmeasured']];
dashboard.getRange('A10:B10').values = [['Instrument','m1-cdp-v2']];
const metrics = ['process_tree_working_set','process_tree_private_bytes','sampled_peak_working_set','startup_usable','note_open','input_to_raf','scroll_frame_interval','frames_over_budget_pct','cpu_one_core_percent','save_receipt','installer_mib','java_working_set'];
dashboard.getRange('A12:A23').values = metrics.map(m => [m]);
dashboard.getRange('A12:A23').format.columnWidth = 34;
dashboard.getRange('B9').format.columnWidth = 30;
dashboard.getRange('B9').format.wrapText = true;
dashboard.getRange('A1:H2').format.font.color = '#14333A';
dashboard.getRange('A26:H28').format.font.color = '#14333A';
const end = Math.max(1004, rows.length + 4);
// Preserve template calculations while extending their source bounds.
const range = col=>`'Raw Runs'!$${col}$5:$${col}$${end}`;
for(let i=12;i<=23;i++) {
  const criteria = architecture=>`${range('D')},$B$${architecture},${range('F')},$B$7,${range('I')},$B$8,${range('J')},$B$9,${range('L')},$A${i},${range('O')},"Y",${range('P')},$B$10,${range('E')},"969d5f3c328901c8db27e0f65cb0e1ff3a478562"`;
  const count = a=>`COUNTIFS(${criteria(a)})`;
  dashboard.getRange(`C${i}:G${i}`).formulas = [[`=IF(${count(5)}=0,"",SUMIFS(${range('M')},${criteria(5)})/${count(5)})`,`=IF(${count(6)}=0,"",SUMIFS(${range('M')},${criteria(6)})/${count(6)})`,'',`=${count(5)}`,`=${count(6)}`]];
}
dashboard.getRange('E12:E23').formulas = metrics.map((_,i)=>[`=IF(COUNT(C${i+12}:D${i+12})<2,"",IF(C${i+12}=0,"",D${i+12}/C${i+12}-1))`]);
const protocol = wb.worksheets.getItem('Protocol');
const m2Runs=normalized.filter(r=>r[2]==='m2-managed-notes-v1'&&r[14]==='Y');
if(m2Runs.length){
  let comparison;try{comparison=wb.worksheets.getItem('M1 vs M2');}catch{comparison=wb.worksheets.add('M1 vs M2');}
  const baseline=normalized.findLast(r=>r[2]==='m1-managed-notes-v2'&&r[8]==='settled-idle-5min'&&r[14]==='Y');
  const candidate=m2Runs.at(-1);
  comparison.showGridLines=false;
  comparison.getRange('A2:H2').merge();comparison.getRange('A2').values=[['Vaultor Next · M1 vs M2']];
  comparison.getRange('A4:B8').values=[['M1 source',baseline?.[4]??'unmeasured'],['M2 source',candidate[4]],['Scenario','settled-idle-5min'],['Dataset',candidate[9]],['Device',candidate[5]]];
  comparison.getRange('A10:H10').values=[['Metric','Unit','M1 mean','M2 mean','Change','M1 n','M2 n','Direction']];
  const compareMetrics=[['cpu_one_core_percent','%'],['process_tree_working_set','MiB'],['process_tree_private_bytes','MiB'],['startup_usable','ms'],['note_open','ms'],['input_to_raf','ms'],['scroll_frame_interval','ms']];
  comparison.getRange('A11:B17').values=compareMetrics;
  for(let row=11;row<=17;row++){
    const criteria=(source,experiment)=>`${range('D')},"tauri-rust",${range('E')},$B$${source},${range('C')},"${experiment}",${range('F')},$B$8,${range('I')},$B$6,${range('J')},$B$7,${range('L')},$A${row},${range('O')},"Y",${range('P')},"m1-cdp-v2"`;
    const count=(s,e)=>`COUNTIFS(${criteria(s,e)})`;
    const left=count(4,'m1-managed-notes-v2'),right=count(5,'m2-managed-notes-v1');
    comparison.getRange(`C${row}:H${row}`).formulas=[[`=IF(${left}=0,"",SUMIFS(${range('M')},${criteria(4,'m1-managed-notes-v2')})/${left})`,`=IF(${right}=0,"",SUMIFS(${range('M')},${criteria(5,'m2-managed-notes-v1')})/${right})`,`=IF(COUNT(C${row}:D${row})<2,"",IF(C${row}=0,"",D${row}/C${row}-1))`,`=${left}`,`=${right}`,'']];
    comparison.getRange(`H${row}`).values=[['lower']];
  }
  comparison.getRange('A19:H20').merge();comparison.getRange('A19').values=[['Five-minute idle follows 30 seconds settling, one 64 KiB note and 100 resources. Change Scenario to managed-note-64k for editing proxies. M2 adds durable draft work; new large-Library/recovery workloads are separate. Small samples; no full-product claim.']];
  comparison.getRange('A2:H20').format.font={name:'Arial',size:10,color:'#14333A'};
  comparison.getRange('A2').format.font.size=14;
  comparison.getRange('A4:A17').format.columnWidth=33;comparison.getRange('B4:B17').format.columnWidth=28;comparison.getRange('C10:H17').format.columnWidth=13;
  comparison.getRange('B4:B8').format.wrapText=true;comparison.getRange('A4:H8').format.rowHeight=34;
  comparison.getRange('A19:H20').format.wrapText=true;comparison.getRange('A19:H20').format.rowHeight=28;
  comparison.getRange('A10:H10').format={fill:'#006B75',font:{name:'Arial',size:10,color:'#FFFFFF',bold:true},rowHeight:25};
  comparison.getRange('C11:D17').setNumberFormat('0.00');comparison.getRange('E11:E17').setNumberFormat('0.0%');
}
protocol.getRange('B4').values = [['CSV is canonical and append-only. update-workbook.ps1 refreshes Raw Runs and applies appended invalidations.']];
protocol.getRange('B13').values = [['M1 is experimental and unpublished. Legacy development databases are disposable; no migration or installer is required. Future release qualification needs separate authorization.']];
const parity = wb.worksheets.getItem('Parity Gates');
parity.getRange('A9:F9').values = [['SQLite foundation','New isolated schema, ownership, atomic note saves and restart durability','Critical','M1 focused checks','docs/plans/VAULTOR-NEXT.md','New schema; no legacy migrations.']];
parity.getRange('D5:F5').values = [['M1 vertical slice','benchmarks/tauri-rust/summaries/','Create/edit/save/reopen; full parity pending.']];
parity.getRange('D7:F7').values = [['Deferred','docs/plans/VAULTOR-NEXT.md','Unsent crash drafts deferred.']];
const scenarios = wb.worksheets.getItem('Scenarios');
scenarios.getRange('A16:E21').values = [
 ['first-profile','Startup','New isolated profile; warm OS cache possible','No app process','Not true cold boot'],
 ['restart','Startup','Same fixture; app-specific session restoration','Prior process exited','Disclose restored-editor differences'],
 ['managed-note-64k','Editing','100-note collection; two populated structured documents; twelve text inputs','Production UI and domain','Read saved bytes after restart; rAF proxies'],
 ['idle','Memory','Short settled period after workload or restart','No pending saves','Not five-minute idle; power uncontrolled'],
 ['workload','Memory','Sampled tree peak over setup/open/edit/scroll','500 ms CIM sampler','Shared pages counted in working set'],
 ['qualification','Correctness','Failures/corrections remain visible','Disposable data','Failed run metrics excluded from Dashboard']];
const metricSheet = wb.worksheets.getItem('Metrics');
metricSheet.getRange('A18:E29').values = metrics.map(m => [m,m.includes('percent')||m.endsWith('_pct')?'%':m.includes('set')||m.includes('bytes')||m.includes('mib')?'MiB':'ms','lower','M1 instrument; see repository benchmark README','Missing values remain blank']);
wb.recalculate();
console.log((await wb.inspect({kind:'table',range:'Dashboard!A11:H23',include:'values',tableMaxRows:13,tableMaxCols:8,maxChars:2400})).ndjson);
console.log((await wb.inspect({kind:'match',searchTerm:'#REF!|#DIV/0!|#VALUE!|#NAME\\?|#NUM!',options:{useRegex:true,maxResults:10},maxChars:1000})).ndjson);
const preview = await wb.render({sheetName:'Dashboard',range:'A4:H23',scale:1});
await fs.writeFile(join(root,'raw/workbook-after.png'),new Uint8Array(await preview.arrayBuffer()));
for(const [sheetName,range] of [['Raw Runs','K4:O12'],['Protocol','A3:B14'],['Parity Gates','A4:F10'],['Scenarios','A16:E21'],['Metrics','A18:E24']]) {
  const image=await wb.render({sheetName,range,scale:1});
  await fs.writeFile(join(root,'raw',`workbook-${sheetName.replaceAll(' ','-')}.png`),new Uint8Array(await image.arrayBuffer()));
}
if(m2Runs.length){const image=await wb.render({sheetName:'M1 vs M2',range:'A2:H20',scale:1});await fs.writeFile(join(root,'raw/workbook-M2.png'),new Uint8Array(await image.arrayBuffer()));console.log((await wb.inspect({kind:'table',range:'M1 vs M2!A10:H17',tableMaxRows:8,tableMaxCols:8,maxChars:1600})).ndjson);}
await (await SpreadsheetFile.exportXlsx(wb)).save(path);
await fs.mkdir(join(root,'summaries'),{recursive:true});
for(const file of await fs.readdir(join(root,'raw'))) {
  if(!file.endsWith('.json'))continue;
  if(!rows.some(row=>String(row[16]).endsWith('/'+file)))continue;
  const report = JSON.parse(await fs.readFile(join(root,'raw',file),'utf8'));
  if(!report.architecture)continue;
  const {architecture,commit,dirty,executableSha256,timestamp,system,dataset,samples,checks,limitations,success,error,runtime,viewport,node,appVersion,instrument} = report;
  const groups=new Map();
  for(const sample of samples??[]) {const key=[sample.scenario,sample.iteration,sample.metric].join('/');if(!groups.has(key))groups.set(key,[]);groups.get(key).push(sample);}
  const measurements=[...groups.values()].map(group=>{const first=group[0],values=group.map(s=>s.value).sort((a,b)=>a-b);return {scenario:first.scenario,iteration:first.iteration,metric:first.metric,unit:first.unit,n:values.length,min:values[0],median:(values[Math.floor((values.length-1)/2)]+values[Math.floor(values.length/2)])/2,p95:values[Math.ceil(values.length*.95)-1],max:values.at(-1)};});
  await fs.writeFile(join(root,'summaries',basename(file)),JSON.stringify({architecture,commit,dirty,executableSha256,timestamp,system,dataset,measurements,checks,limitations,success,error,runtime,viewport,node,appVersion,instrument},null,2)+'\n');
}
console.log(`Refreshed workbook from ${rows.length} canonical records; ${failures.size} invalidated runs.`);
