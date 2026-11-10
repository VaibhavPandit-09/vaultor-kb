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
dashboard.getRange('A26').values=[['Historical pooled-source aggregates. Use the exact-source M1/M2, M2/M3 and M3/M4 tabs for milestone comparisons; missing metrics remain blank.']];
const protocol = wb.worksheets.getItem('Protocol');
const m2Runs=normalized.filter(r=>r[2]==='m2-managed-notes-v1'&&r[14]==='Y');
if(m2Runs.length){
  let comparison;try{comparison=wb.worksheets.getItem('M1 vs M2');}catch{comparison=wb.worksheets.add('M1 vs M2');}
  const baseline=normalized.findLast(r=>r[2]==='m1-managed-notes-v2'&&r[8]==='settled-idle-5min'&&r[14]==='Y');
  const candidate=m2Runs.findLast(r=>r[8]==='settled-idle-5min')??m2Runs.at(-1);
  comparison.showGridLines=false;
  comparison.getRange('A2:H2').unmerge();comparison.getRange('A2:H2').merge();comparison.getRange('A2').values=[['Vaultor Next · M1 vs M2']];
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
  comparison.getRange('A19:H20').unmerge();comparison.getRange('A19:H20').merge();comparison.getRange('A19').values=[['Five-minute idle follows 30 seconds settling, one 64 KiB note and 100 resources. Change Scenario to managed-note-64k for editing proxies. M2 adds durable draft work; new large-Library/recovery workloads are separate. Small samples; no full-product claim.']];
  comparison.getRange('A2:H20').format.font={name:'Arial',size:10,color:'#14333A'};
  comparison.getRange('A2').format.font.size=14;
  comparison.getRange('A4:A17').format.columnWidth=33;comparison.getRange('B4:B17').format.columnWidth=28;comparison.getRange('C10:H17').format.columnWidth=13;
  comparison.getRange('B4:B8').format.wrapText=true;comparison.getRange('A4:H8').format.rowHeight=34;
  comparison.getRange('A19:H20').format.wrapText=true;comparison.getRange('A19:H20').format.rowHeight=28;
  comparison.getRange('A10:H10').format={fill:'#006B75',font:{name:'Arial',size:10,color:'#FFFFFF',bold:true},rowHeight:25};
  comparison.getRange('C11:D17').setNumberFormat('0.00');comparison.getRange('E11:E17').setNumberFormat('0.0%');
}
const m3Runs=normalized.filter(r=>r[2]==='m3-managed-notes-v1'&&r[14]==='Y');
if(m3Runs.length){
  let comparison;try{comparison=wb.worksheets.getItem('M2 vs M3');}catch{comparison=wb.worksheets.add('M2 vs M3');}
  const baseline=normalized.findLast(r=>r[2]==='m2-managed-notes-v1'&&r[8]==='settled-idle-5min'&&r[14]==='Y');
  const candidate=m3Runs.findLast(r=>r[8]==='settled-idle-5min')??m3Runs.at(-1);
  comparison.showGridLines=false;
  comparison.getRange('A2:H2').unmerge();comparison.getRange('A2:H2').merge();comparison.getRange('A2').values=[['Vaultor Next · M2 vs M3']];
  comparison.getRange('A4:B8').values=[['M2 source',baseline?.[4]??'unmeasured'],['M3 source',candidate[4]],['Scenario','settled-idle-5min'],['Dataset',candidate[9]],['Device',candidate[5]]];
  comparison.getRange('A10:H10').values=[['Metric','Unit','M2 mean','M3 mean','Change','M2 n','M3 n','Direction']];
  const compareMetrics=[['cpu_one_core_percent','%'],['process_tree_working_set','MiB'],['process_tree_private_bytes','MiB'],['startup_usable','ms'],['note_open','ms'],['input_to_raf','ms'],['scroll_frame_interval','ms']];
  comparison.getRange('A11:B17').values=compareMetrics;
  for(let row=11;row<=17;row++){
    const criteria=(source,experiment)=>`${range('D')},"tauri-rust",${range('E')},$B$${source},${range('C')},"${experiment}",${range('F')},$B$8,${range('I')},$B$6,${range('J')},$B$7,${range('L')},$A${row},${range('O')},"Y",${range('P')},"m1-cdp-v2"`;
    const count=(s,e)=>`COUNTIFS(${criteria(s,e)})`;
    const left=count(4,'m2-managed-notes-v1'),right=count(5,'m3-managed-notes-v1');
    comparison.getRange(`C${row}:H${row}`).formulas=[[`=IF(${left}=0,"",SUMIFS(${range('M')},${criteria(4,'m2-managed-notes-v1')})/${left})`,`=IF(${right}=0,"",SUMIFS(${range('M')},${criteria(5,'m3-managed-notes-v1')})/${right})`,`=IF(COUNT(C${row}:D${row})<2,"",IF(C${row}=0,"",D${row}/C${row}-1))`,`=${left}`,`=${right}`,'']];
    comparison.getRange(`H${row}`).values=[['lower']];
  }
  comparison.getRange('A19:H20').unmerge();comparison.getRange('A19:H20').merge();comparison.getRange('A19').values=[['Five-minute idle follows 30 seconds settling, one 64 KiB note and 100 resources. Change Scenario to managed-note-64k for editing proxies. M3 adds selection and transactional organization. New bulk and mixed-churn scenarios are separate. Small samples; no full-product claim.']];
  comparison.getRange('A2:H20').format.font={name:'Arial',size:10,color:'#14333A'};
  comparison.getRange('A2').format.font.size=14;
  comparison.getRange('A4:A17').format.columnWidth=33;comparison.getRange('B4:B17').format.columnWidth=28;comparison.getRange('C10:H17').format.columnWidth=13;
  comparison.getRange('B4:B8').format.wrapText=true;comparison.getRange('A4:H8').format.rowHeight=34;
  comparison.getRange('A19:H20').format.wrapText=true;comparison.getRange('A19:H20').format.rowHeight=28;
  comparison.getRange('A10:H10').format={fill:'#006B75',font:{name:'Arial',size:10,color:'#FFFFFF',bold:true},rowHeight:25};
  comparison.getRange('C11:D17').setNumberFormat('0.00');comparison.getRange('E11:E17').setNumberFormat('0.0%');
}
const m4Runs=normalized.filter(r=>r[2]==='m4-managed-notes-v1'&&r[14]==='Y');
if(m4Runs.length){
  let comparison;try{comparison=wb.worksheets.getItem('M3 vs M4');}catch{comparison=wb.worksheets.add('M3 vs M4');}
  const baseline=normalized.findLast(r=>r[2]==='m3-managed-notes-v1'&&r[8]==='settled-idle-5min'&&r[14]==='Y');
  const candidate=m4Runs.findLast(r=>r[8]==='settled-idle-5min')??m4Runs.at(-1);
  comparison.showGridLines=false;
  comparison.getRange('A2:H2').unmerge();comparison.getRange('A2:H2').merge();comparison.getRange('A2').values=[['Vaultor Next · M3 vs M4']];
  comparison.getRange('A4:B8').values=[['M3 source',baseline?.[4]??'unmeasured'],['M4 source',candidate[4]],['Scenario','settled-idle-5min'],['Dataset',candidate[9]],['Device',candidate[5]]];
  comparison.getRange('A10:H10').values=[['Metric','Unit','M3 mean','M4 mean','Change','M3 n','M4 n','Direction']];
  const compareMetrics=[['cpu_one_core_percent','%'],['process_tree_working_set','MiB'],['process_tree_private_bytes','MiB'],['startup_usable','ms'],['note_open','ms'],['input_to_raf','ms'],['scroll_frame_interval','ms']];
  comparison.getRange('A11:B17').values=compareMetrics;
  for(let row=11;row<=17;row++){
    const criteria=(source,experiment)=>`${range('D')},"tauri-rust",${range('E')},$B$${source},${range('C')},"${experiment}",${range('F')},$B$8,${range('I')},$B$6,${range('J')},$B$7,${range('L')},$A${row},${range('O')},"Y",${range('P')},"m1-cdp-v2"`;
    const count=(s,e)=>`COUNTIFS(${criteria(s,e)})`;
    const left=count(4,'m3-managed-notes-v1'),right=count(5,'m4-managed-notes-v1');
    comparison.getRange(`C${row}:H${row}`).formulas=[[`=IF(${left}=0,"",SUMIFS(${range('M')},${criteria(4,'m3-managed-notes-v1')})/${left})`,`=IF(${right}=0,"",SUMIFS(${range('M')},${criteria(5,'m4-managed-notes-v1')})/${right})`,`=IF(COUNT(C${row}:D${row})<2,"",IF(C${row}=0,"",D${row}/C${row}-1))`,`=${left}`,`=${right}`,'']];
    comparison.getRange(`H${row}`).values=[['lower']];
  }
  comparison.getRange('A19:H20').unmerge();comparison.getRange('A19:H20').merge();comparison.getRange('A19').values=[['Five-minute idle follows 30 seconds settling, one 64 KiB note and 100 resources. Change Scenario to managed-note-64k for editing proxies. M4 adds committed FTS5 search and removes row-wide opening updates. Search and new churn scenarios are separate. Small samples; no full-product claim.']];
  comparison.getRange('A2:H20').format.font={name:'Arial',size:10,color:'#14333A'};
  comparison.getRange('A2').format.font.size=14;
  comparison.getRange('A4:A17').format.columnWidth=33;comparison.getRange('B4:B17').format.columnWidth=28;comparison.getRange('C10:H17').format.columnWidth=13;
  comparison.getRange('B4:B8').format.wrapText=true;comparison.getRange('A4:H8').format.rowHeight=34;
  comparison.getRange('A19:H20').format.wrapText=true;comparison.getRange('A19:H20').format.rowHeight=28;
  comparison.getRange('A10:H10').format={fill:'#006B75',font:{name:'Arial',size:10,color:'#FFFFFF',bold:true},rowHeight:25};
  comparison.getRange('C11:D17').setNumberFormat('0.00');comparison.getRange('E11:E17').setNumberFormat('0.0%');
}
const m5Runs=normalized.filter(r=>r[2]==='m5-managed-notes-v1'&&r[14]==='Y');
if(m5Runs.length){
  let comparison;try{comparison=wb.worksheets.getItem('M4 vs M5');}catch{comparison=wb.worksheets.add('M4 vs M5');}
  const baseline=normalized.findLast(r=>r[2]==='m4-managed-notes-v1'&&r[8]==='settled-idle-5min'&&r[14]==='Y');
  const candidate=m5Runs.findLast(r=>r[8]==='settled-idle-5min')??m5Runs.at(-1);
  comparison.showGridLines=false;
  comparison.getRange('A2:H2').unmerge();comparison.getRange('A2:H2').merge();comparison.getRange('A2').values=[['Vaultor Next · M4 vs M5']];
  comparison.getRange('A4:B8').values=[['M4 source',baseline?.[4]??'unmeasured'],['M5 source',candidate[4]],['Scenario','settled-idle-5min'],['Dataset',candidate[9]],['Device',candidate[5]]];
  comparison.getRange('A10:H10').values=[['Metric','Unit','M4 mean','M5 mean','Change','M4 n','M5 n','Direction']];
  const compareMetrics=[['cpu_one_core_percent','%'],['process_tree_working_set','MiB'],['process_tree_private_bytes','MiB'],['startup_usable','ms'],['note_open','ms'],['input_to_raf','ms'],['scroll_frame_interval','ms']];
  comparison.getRange('A11:B17').values=compareMetrics;
  for(let row=11;row<=17;row++){
    const criteria=(source,experiment)=>`${range('D')},"tauri-rust",${range('E')},$B$${source},${range('C')},"${experiment}",${range('F')},$B$8,${range('I')},$B$6,${range('J')},$B$7,${range('L')},$A${row},${range('O')},"Y",${range('P')},"m1-cdp-v2"`;
    const count=(s,e)=>`COUNTIFS(${criteria(s,e)})`;
    const left=count(4,'m4-managed-notes-v1'),right=count(5,'m5-managed-notes-v1');
    comparison.getRange(`C${row}:H${row}`).formulas=[[`=IF(${left}=0,"",SUMIFS(${range('M')},${criteria(4,'m4-managed-notes-v1')})/${left})`,`=IF(${right}=0,"",SUMIFS(${range('M')},${criteria(5,'m5-managed-notes-v1')})/${right})`,`=IF(COUNT(C${row}:D${row})<2,"",IF(C${row}=0,"",D${row}/C${row}-1))`,`=${left}`,`=${right}`,'']];
    comparison.getRange(`H${row}`).values=[['lower']];
  }
  comparison.getRange('A19:H20').unmerge();comparison.getRange('A19:H20').merge();comparison.getRange('A19').values=[['Five-minute idle follows 30 seconds settling, one 64 KiB note and 100 resources. Change Scenario to managed-note-64k for editing proxies. M5 adds linked sources; this comparison keeps the common managed-note fixture. Linked workloads and accessibility-attached churn are separate. Small samples; no full-product claim.']];
  comparison.getRange('A2:H20').format.font={name:'Arial',size:10,color:'#14333A'};
  comparison.getRange('A2').format.font.size=14;
  comparison.getRange('A4:A17').format.columnWidth=33;comparison.getRange('B4:B17').format.columnWidth=28;comparison.getRange('C10:H17').format.columnWidth=13;
  comparison.getRange('B4:B8').format.wrapText=true;comparison.getRange('A4:H8').format.rowHeight=34;
  comparison.getRange('A19:H20').format.wrapText=true;comparison.getRange('A19:H20').format.rowHeight=28;
  comparison.getRange('A10:H10').format={fill:'#006B75',font:{name:'Arial',size:10,color:'#FFFFFF',bold:true},rowHeight:25};
  comparison.getRange('C11:D17').setNumberFormat('0.00');comparison.getRange('E11:E17').setNumberFormat('0.0%');
}
const m6Runs=normalized.filter(r=>r[2]==='m6-managed-notes-v1'&&r[14]==='Y');
if(m6Runs.length){
  let comparison;try{comparison=wb.worksheets.getItem('M5 vs M6');}catch{comparison=wb.worksheets.add('M5 vs M6');}
  const baseline=normalized.findLast(r=>r[2]==='m5-managed-notes-v1'&&r[8]==='settled-idle-5min'&&r[14]==='Y');
  const candidate=m6Runs.findLast(r=>r[8]==='settled-idle-5min')??m6Runs.at(-1);
  comparison.showGridLines=false;
  comparison.getRange('A2:H2').unmerge();comparison.getRange('A2:H2').merge();comparison.getRange('A2').values=[['Vaultor Next · M5 vs M6']];
  comparison.getRange('A4:B8').values=[['M5 source',baseline?.[4]??'unmeasured'],['M6 source',candidate[4]],['Scenario','settled-idle-5min'],['Dataset',candidate[9]],['Device',candidate[5]]];
  comparison.getRange('A10:H10').values=[['Metric','Unit','M5 mean','M6 mean','Change','M5 n','M6 n','Direction']];
  const compareMetrics=[['cpu_one_core_percent','%'],['process_tree_working_set','MiB'],['process_tree_private_bytes','MiB'],['startup_usable','ms'],['note_open','ms'],['input_to_raf','ms'],['scroll_frame_interval','ms']];
  comparison.getRange('A11:B17').values=compareMetrics;
  for(let row=11;row<=17;row++){
    const criteria=(source,experiment)=>`${range('D')},"tauri-rust",${range('E')},$B$${source},${range('C')},"${experiment}",${range('F')},$B$8,${range('I')},$B$6,${range('J')},$B$7,${range('L')},$A${row},${range('O')},"Y",${range('P')},"m1-cdp-v2"`;
    const count=(s,e)=>`COUNTIFS(${criteria(s,e)})`;
    const left=count(4,'m5-managed-notes-v1'),right=count(5,'m6-managed-notes-v1');
    comparison.getRange(`C${row}:H${row}`).formulas=[[`=IF(${left}=0,"",SUMIFS(${range('M')},${criteria(4,'m5-managed-notes-v1')})/${left})`,`=IF(${right}=0,"",SUMIFS(${range('M')},${criteria(5,'m6-managed-notes-v1')})/${right})`,`=IF(COUNT(C${row}:D${row})<2,"",IF(C${row}=0,"",D${row}/C${row}-1))`,`=${left}`,`=${right}`,'']];
    comparison.getRange(`H${row}`).values=[['lower']];
  }
  comparison.getRange('A19:H20').unmerge();comparison.getRange('A19:H20').merge();comparison.getRange('A19').values=[['Five-minute idle follows 30 seconds settling, one 64 KiB note and 100 resources. Change Scenario to managed-note-64k for editing proxies. M6 reconstructs desktop UI; commands/mounted readiness and completed transitions differ. Isolated WebView profile caches differ from M5; startup is not directly equivalent. Churn workloads are separate. Small samples; no full-product claim.']];
  comparison.getRange('E14').formulas=[['=IF($B$6="first-profile","",IF(COUNT(C14:D14)<2,"",IF(C14=0,"",D14/C14-1)))']];
  comparison.getRange('H14').values=[['profile differs']];
  comparison.getRange('A2:H20').format.font={name:'Arial',size:10,color:'#14333A'};
  comparison.getRange('A2').format.font.size=14;
  comparison.getRange('A4:A17').format.columnWidth=33;comparison.getRange('B4:B17').format.columnWidth=28;comparison.getRange('C10:H17').format.columnWidth=13;
  comparison.getRange('B4:B8').format.wrapText=true;comparison.getRange('A4:H8').format.rowHeight=34;
  comparison.getRange('A19:H20').format.wrapText=true;comparison.getRange('A19:H20').format.rowHeight=28;
  comparison.getRange('A10:H10').format={fill:'#006B75',font:{name:'Arial',size:10,color:'#FFFFFF',bold:true},rowHeight:25};
  comparison.getRange('C11:D17').setNumberFormat('0.00');comparison.getRange('E11:E17').setNumberFormat('0.0%');
}
const m7Runs=normalized.filter(r=>r[2]==='m7-managed-notes-v1'&&r[14]==='Y');
if(m7Runs.length){
  let comparison;try{comparison=wb.worksheets.getItem('M6 vs M7');}catch{comparison=wb.worksheets.add('M6 vs M7');}
  const baseline=normalized.findLast(r=>r[2]==='m6-managed-notes-v1'&&r[8]==='settled-idle-5min'&&r[14]==='Y');
  const candidate=m7Runs.findLast(r=>r[8]==='settled-idle-5min')??m7Runs.at(-1);
  comparison.showGridLines=false;
  comparison.getRange('A2:H2').unmerge();comparison.getRange('A2:H2').merge();comparison.getRange('A2').values=[['Vaultor Next · M6 vs M7']];
  comparison.getRange('A4:B8').values=[['M6 source',baseline?.[4]??'unmeasured'],['M7 source',candidate[4]],['Scenario','settled-idle-5min'],['Dataset',candidate[9]],['Device',candidate[5]]];
  comparison.getRange('A10:H10').values=[['Metric','Unit','M6 mean','M7 mean','Change','M6 n','M7 n','Direction']];
  const compareMetrics=[['cpu_one_core_percent','%'],['process_tree_working_set','MiB'],['process_tree_private_bytes','MiB'],['startup_usable','ms'],['note_open','ms'],['input_to_raf','ms'],['scroll_frame_interval','ms']];
  comparison.getRange('A11:B17').values=compareMetrics;
  for(let row=11;row<=17;row++){
    const criteria=(source,experiment)=>`${range('D')},"tauri-rust",${range('E')},$B$${source},${range('C')},"${experiment}",${range('F')},$B$8,${range('I')},$B$6,${range('J')},$B$7,${range('L')},$A${row},${range('O')},"Y",${range('P')},"m1-cdp-v2"`;
    const count=(s,e)=>`COUNTIFS(${criteria(s,e)})`;
    const left=count(4,'m6-managed-notes-v1'),right=count(5,'m7-managed-notes-v1');
    comparison.getRange(`C${row}:H${row}`).formulas=[[`=IF(${left}=0,"",SUMIFS(${range('M')},${criteria(4,'m6-managed-notes-v1')})/${left})`,`=IF(${right}=0,"",SUMIFS(${range('M')},${criteria(5,'m7-managed-notes-v1')})/${right})`,`=IF(COUNT(C${row}:D${row})<2,"",IF(C${row}=0,"",D${row}/C${row}-1))`,`=${left}`,`=${right}`,'']];
    comparison.getRange(`H${row}`).values=[['lower']];
  }
  comparison.getRange('A19:H20').unmerge();comparison.getRange('A19:H20').merge();comparison.getRange('A19').values=[['Common 100-note / 64 KiB fixture. Five-minute idle follows 30 seconds settling; change Scenario to managed-note-64k for editing proxies. M6/M7 use isolated WebView profiles. Transfer workloads, live post-transfer retention and native-picker inspection are separate. Small uncontrolled samples; no whole-product performance claim.']];
  comparison.getRange('A2:H20').format.font={name:'Arial',size:10,color:'#14333A'};
  comparison.getRange('A2').format.font.size=14;
  comparison.getRange('A4:A17').format.columnWidth=33;comparison.getRange('B4:B17').format.columnWidth=28;comparison.getRange('C10:H17').format.columnWidth=13;
  comparison.getRange('B4:B8').format.wrapText=true;comparison.getRange('A4:H8').format.rowHeight=34;comparison.getRange('A7:H7').format.rowHeight=52;
  comparison.getRange('A19:H20').format.wrapText=true;comparison.getRange('A19:H20').format.rowHeight=28;
  comparison.getRange('A10:H10').format={fill:'#006B75',font:{name:'Arial',size:10,color:'#FFFFFF',bold:true},rowHeight:25};
  comparison.getRange('C11:D17').setNumberFormat('0.00');comparison.getRange('E11:E17').setNumberFormat('0.0%');
}
const m8Runs=normalized.filter(r=>r[2]==='m8-managed-notes-v1'&&r[14]==='Y');
if(m8Runs.length){
  let comparison;try{comparison=wb.worksheets.getItem('M7 vs M8');}catch{comparison=wb.worksheets.add('M7 vs M8');}
  const baseline=normalized.findLast(r=>r[2]==='m7-managed-notes-v1'&&r[8]==='settled-idle-5min'&&r[14]==='Y');
  const candidate=m8Runs.findLast(r=>r[8]==='settled-idle-5min')??m8Runs.at(-1);
  comparison.showGridLines=false;
  comparison.getRange('A2:H2').unmerge();comparison.getRange('A2:H2').merge();comparison.getRange('A2').values=[['Vaultor Next · M7 vs M8']];
  comparison.getRange('A4:B8').values=[['M7 source',baseline?.[4]??'unmeasured'],['M8 source',candidate[4]],['Scenario','settled-idle-5min'],['Dataset',candidate[9]],['Device',candidate[5]]];
  comparison.getRange('A10:H10').values=[['Metric','Unit','M7 mean','M8 mean','Change','M7 n','M8 n','Direction']];
  const compareMetrics=[['cpu_one_core_percent','%'],['process_tree_working_set','MiB'],['process_tree_private_bytes','MiB'],['startup_usable','ms'],['note_open','ms'],['input_to_raf','ms'],['scroll_frame_interval','ms']];
  comparison.getRange('A11:B17').values=compareMetrics;
  for(let row=11;row<=17;row++){
    const criteria=(source,experiment)=>`${range('D')},"tauri-rust",${range('E')},$B$${source},${range('C')},"${experiment}",${range('F')},$B$8,${range('I')},$B$6,${range('J')},$B$7,${range('L')},$A${row},${range('O')},"Y",${range('P')},"m1-cdp-v2"`;
    const count=(s,e)=>`COUNTIFS(${criteria(s,e)})`;
    const left=count(4,'m7-managed-notes-v1'),right=count(5,'m8-managed-notes-v1');
    comparison.getRange(`C${row}:H${row}`).formulas=[[`=IF(${left}=0,"",SUMIFS(${range('M')},${criteria(4,'m7-managed-notes-v1')})/${left})`,`=IF(${right}=0,"",SUMIFS(${range('M')},${criteria(5,'m8-managed-notes-v1')})/${right})`,`=IF(COUNT(C${row}:D${row})<2,"",IF(C${row}=0,"",D${row}/C${row}-1))`,`=${left}`,`=${right}`,'']];
    comparison.getRange(`H${row}`).values=[['lower']];
  }
  comparison.getRange('A19:H20').unmerge();comparison.getRange('A19:H20').merge();comparison.getRange('A19').values=[['Common 100-note / 64 KiB fixture. Five-minute idle follows 30 seconds settling; change Scenario to managed-note-64k for editing proxies. M7/M8 use isolated WebView profiles. Organization workloads and post-operation retention are separate. Small uncontrolled samples; no whole-product performance claim.']];
  comparison.getRange('A2:H20').format.font={name:'Arial',size:10,color:'#14333A'};
  comparison.getRange('A2').format.font.size=14;
  comparison.getRange('A4:A17').format.columnWidth=33;comparison.getRange('B4:B17').format.columnWidth=28;comparison.getRange('C10:H17').format.columnWidth=13;
  comparison.getRange('B4:B8').format.wrapText=true;comparison.getRange('A4:H8').format.rowHeight=34;comparison.getRange('A7:H7').format.rowHeight=52;
  comparison.getRange('A19:H20').format.wrapText=true;comparison.getRange('A19:H20').format.rowHeight=28;
  comparison.getRange('A10:H10').format={fill:'#006B75',font:{name:'Arial',size:10,color:'#FFFFFF',bold:true},rowHeight:25};
  comparison.getRange('C11:D17').setNumberFormat('0.00');comparison.getRange('E11:E17').setNumberFormat('0.0%');
}
const m9Runs=normalized.filter(r=>r[2]==='m9-managed-notes-v1'&&r[14]==='Y');
if(m9Runs.length){
  let comparison;try{comparison=wb.worksheets.getItem('M8 vs M9');}catch{comparison=wb.worksheets.add('M8 vs M9');}
  const baseline=normalized.findLast(r=>r[2]==='m8-managed-notes-v1'&&r[8]==='settled-idle-5min'&&r[14]==='Y');
  const candidate=m9Runs.findLast(r=>r[8]==='settled-idle-5min')??m9Runs.at(-1);
  comparison.showGridLines=false;
  comparison.getRange('A2:H2').unmerge();comparison.getRange('A2:H2').merge();comparison.getRange('A2').values=[['Vaultor Next · M8 vs M9']];
  comparison.getRange('A4:B8').values=[['M8 source',baseline?.[4]??'unmeasured'],['M9 source',candidate[4]],['Scenario','settled-idle-5min'],['Dataset',candidate[9]],['Device',candidate[5]]];
  comparison.getRange('A10:H10').values=[['Metric','Unit','M8 mean','M9 mean','Change','M8 n','M9 n','Direction']];
  const compareMetrics=[['cpu_one_core_percent','%'],['process_tree_working_set','MiB'],['process_tree_private_bytes','MiB'],['startup_usable','ms'],['note_open','ms'],['input_to_raf','ms'],['scroll_frame_interval','ms']];
  comparison.getRange('A11:B17').values=compareMetrics;
  for(let row=11;row<=17;row++){
    const criteria=(source,experiment)=>`${range('D')},"tauri-rust",${range('E')},$B$${source},${range('C')},"${experiment}",${range('F')},$B$8,${range('I')},$B$6,${range('J')},$B$7,${range('L')},$A${row},${range('O')},"Y",${range('P')},"m1-cdp-v2"`;
    const count=(s,e)=>`COUNTIFS(${criteria(s,e)})`;
    const left=count(4,'m8-managed-notes-v1'),right=count(5,'m9-managed-notes-v1');
    comparison.getRange(`C${row}:H${row}`).formulas=[[`=IF(${left}=0,"",SUMIFS(${range('M')},${criteria(4,'m8-managed-notes-v1')})/${left})`,`=IF(${right}=0,"",SUMIFS(${range('M')},${criteria(5,'m9-managed-notes-v1')})/${right})`,`=IF(COUNT(C${row}:D${row})<2,"",IF(C${row}=0,"",D${row}/C${row}-1))`,`=${left}`,`=${right}`,'']];
    comparison.getRange(`H${row}`).values=[['lower']];
  }
  comparison.getRange('A19:H20').unmerge();comparison.getRange('A19:H20').merge();comparison.getRange('A19').values=[['Common 100-note / 64 KiB fixture. Five-minute idle follows 30 seconds settling; change Scenario to managed-note-64k for editing proxies. M8/M9 use isolated WebView profiles. Editor/media workloads and post-operation retention are separate. Small uncontrolled samples; no whole-product performance claim.']];
  comparison.getRange('A2:H20').format.font={name:'Arial',size:10,color:'#14333A'};
  comparison.getRange('A2').format.font.size=14;
  comparison.getRange('A4:A17').format.columnWidth=33;comparison.getRange('B4:B17').format.columnWidth=28;comparison.getRange('C10:H17').format.columnWidth=13;
  comparison.getRange('B4:B8').format.wrapText=true;comparison.getRange('A4:H8').format.rowHeight=34;comparison.getRange('A7:H7').format.rowHeight=52;
  comparison.getRange('A19:H20').format.wrapText=true;comparison.getRange('A19:H20').format.rowHeight=28;
  comparison.getRange('A10:H10').format={fill:'#006B75',font:{name:'Arial',size:10,color:'#FFFFFF',bold:true},rowHeight:25};
  comparison.getRange('C11:D17').setNumberFormat('0.00');comparison.getRange('E11:E17').setNumberFormat('0.0%');
}
protocol.getRange('B4').values = [['CSV is canonical and append-only. update-workbook.ps1 refreshes Raw Runs and applies appended invalidations.']];
protocol.getRange('B13').values = [['Vaultor Next M1–M9 is experimental and unpublished. Legacy development databases are disposable; no migration or installer is required. Future release qualification needs separate authorization.']];
const parity = wb.worksheets.getItem('Parity Gates');
parity.getRange('A9:F9').values = [['SQLite foundation','New isolated schema, ownership, atomic note saves and restart durability','Critical','M1 focused checks','docs/plans/VAULTOR-NEXT.md','New schema; no legacy migrations.']];
parity.getRange('D5:F5').values = [['M1 vertical slice','benchmarks/tauri-rust/summaries/','Create/edit/save/reopen; full parity pending.']];
parity.getRange('D7:F7').values = [['Deferred','docs/plans/VAULTOR-NEXT.md','Unsent crash drafts deferred.']];
if(m2Runs.length){
  parity.getRange('D4:F4').values=[['M2 sampled','benchmarks/tauri-rust/summaries/','Pane/theme samples; full visual parity pending.']];
  parity.getRange('D5:F5').values=[['M2 focused checks','benchmarks/tauri-rust/summaries/','Create/edit/save/reopen and shared panes.']];
  parity.getRange('D7:F7').values=[['M2 focused checks','docs/plans/VAULTOR-NEXT.md','Durable receipts survive crash; unsent edits excluded.']];
  parity.getRange('D11:F11').values=[['Partial M2','docs/plans/VAULTOR-NEXT.md','Hierarchy/memberships ready; Trash deferred.']];
  parity.getRange('D18:F18').values=[['M2 bundled','docs/help/next-foundation.md','Experimental Help checked; published app unchanged.']];
}
if(m3Runs.length){
  parity.getRange('D4:F4').values=[['M3 scoped parity','docs/plans/VAULTOR-NEXT.md','Selection, menus, destinations, panes and themes; full M6 parity pending.']];
  parity.getRange('D11:F11').values=[['M3 transactional bulk','docs/plans/VAULTOR-NEXT.md','Add/move/remove 1–100 identities; other memberships retained; Trash deferred.']];
  parity.getRange('D18:F18').values=[['M3 bundled','docs/help/next-foundation.md','Page-scoped mouse/keyboard selection and shared organization Help.']];
}
const scenarios = wb.worksheets.getItem('Scenarios');
if(m3Runs.length)scenarios.getRange('A23:E26').values=[
 ['selection-100','Interaction','Native Ctrl+A from empty selection through rendered receipt','100 mounted rows','rAF is not physical presentation'],
 ['bulk-add/move/remove','Organization','5/20/100 adds; 100 move/remove through UI receipt','Transactional identity membership','Setup and destination search outside latency'],
 ['library-5000-m3','Navigation','Three Next transitions in 5,000-note fixture','Page-scoped selection resets','New M3 workload; do not compare to M2 as equivalent'],
 ['churn-5000-m3','Retention','Three bounded mixed rounds then 30+60 seconds idle','No forced GC; full process tree','Snapshot trend cannot establish leak freedom']];
scenarios.getRange('A16:E21').values = [
 ['first-profile','Startup','New isolated profile; warm OS cache possible','No app process','Not true cold boot'],
 ['restart','Startup','Same fixture; app-specific session restoration','Prior process exited','Disclose restored-editor differences'],
 ['managed-note-64k','Editing','100-note collection; two populated structured documents; twelve text inputs','Production UI and domain','Read saved bytes after restart; rAF proxies'],
 ['idle','Memory','Short settled period after workload or restart','No pending saves','Not five-minute idle; power uncontrolled'],
 ['workload','Memory','Sampled tree peak over setup/open/edit/scroll','500 ms CIM sampler','Shared pages counted in working set'],
 ['qualification','Correctness','Failures/corrections remain visible','Disposable data','Failed run metrics excluded from Dashboard']];
if(m4Runs.length){
 parity.getRange('D4:F4').values=[['M4 scoped Windows inspection','docs/plans/VAULTOR-NEXT.md','Compact search/options plus existing menus/panes/themes; full M6/M7 parity pending.']];
 parity.getRange('D18:F18').values=[['M4 bundled','docs/help/next-foundation.md','Saved-text search, ordering, scope, cursor refresh and keyboard Help.']];
 scenarios.getRange('A28:E32').values=[['search-title-100','Search','Bench note 099;1 result','3 invoke samples;1 visible sample','Visible readiness includes220ms debounce'],['search-title-1000','Search','Search note;899 results','100 mounted summaries','Not a full-document frontend scan'],['search-content-5000','Search','nebula;489 results;collection Paragraph2','3 invoke samples;1 visible sample','Command includes IPC/SQL/serialization'],['search-rapid-5000','Search','Three replacements;latest Search note wins','Native input and rendered ready state','Mocked delayed replies additionally verify stale-result refusal'],['search-churn-5000','Retention','Two rounds,10 opens/panes/queries/pages,30+60s idle','No forcedGC','Different from M3 churn; no direct comparison']];
}
if(m5Runs.length){
 parity.getRange('D6:F6').values=[['M5 scoped Windows','docs/plans/VAULTOR-NEXT.md','Explicit source-preserving Save, conflicts, interrupted evidence;local NTFS/subset limits.']];
 parity.getRange('D7:F7').values=[['M2/M5 focused checks','docs/plans/VAULTOR-NEXT.md','Managed and linked durable drafts;uncertain source publication never replayed.']];
 parity.getRange('D8:F8').values=[['M1/M5 focused checks','docs/plans/VAULTOR-NEXT.md','Exclusive workspace ownership;linked source roots cannot overlap workspace storage.']];
 parity.getRange('D10:F10').values=[['M1–M5 focused checks','docs/plans/VAULTOR-NEXT.md','One Rust authority;no Java or permanent HTTP/helper backend.']];
 parity.getRange('D4:F4').values=[['M5 scoped Windows inspection','docs/plans/VAULTOR-NEXT.md','Linked tree/editor/review and existing themes/panes; full refinement pending.']];
 parity.getRange('D18:F18').values=[['M5 bundled','docs/help/next-foundation.md','Explicit linked Save, supported syntax/storage, conflict and recovery limits.']];
 scenarios.getRange('A34:E38').values=[['linked-open-small/moderate/1mb-readonly','Linked reading','303 /154701 /1048576 bytes;UTF8','3 command samples,1–2 visible samples','Command versus native pointer+motion readiness boundaries differ'],['linked-save-small','Publication','Shared-pane edit;CRLF/BOM/frontmatter/reference preservation','Explicit Ctrl+S through verified receipt','No external autosave;candidate/capture safety tested separately'],['linked-m5-memory','Retention','Two mixed rounds then30+60s idle','Process-private resident/commit and summed working set','Accessibility attached;not equivalent to M4 managed-only idle'],['linked-m5-process-roles','Memory breakdown','Host/browser/renderer/GPU/utility','PerfProc private resident and CIM commit','Shared resident estimate is WS minus privateWS,not unique physical RAM'],['linked-pane-motion','Animation','Native pane transition rAF intervals','Supplemental presentation source','Not compositor or subjective whole-product parity']];
}
if(m5Runs.length){scenarios.getRange('A34:E38').format.wrapText=true;scenarios.getRange('A34:E38').format.rowHeight=64;for(const row of [4,6,7,8,10,18]){parity.getRange(`A${row}:F${row}`).format.wrapText=true;parity.getRange(`A${row}:F${row}`).format.rowHeight=58;}wb.worksheets.getItem('M4 vs M5').getRange('A7:H7').format.rowHeight=52;}
if(m6Runs.length){
 parity.getRange('D4:F4').values=[['M6 scoped Windows','docs/plans/VAULTOR-NEXT.md','Full Library/workspace shell, companion navigation, OLED/chrome and structural motion; remaining gaps in inventory.']];
 parity.getRange('D18:F18').values=[['M6 bundled','docs/help/next-foundation.md','History, panes, companion views, OLED and integrated window controls.']];
 scenarios.getRange('A40:E44').values=[['desktop-navigation-m6','Navigation','Original reference heading +1paragraph fixture','Mounted readiness vs completed transition recorded separately','Not backend latency; common64KiB scenario remains separate'],['desktop-pane-motion-m6','Motion','Real grid widths;shared editor identity/Undo after sibling close','rAF;not compositor presentation','No text scaling;two live editors maximum'],['desktop-sidebar-motion-m6','Motion','Width/transform compression with live companion','Native WebView rAF and computed intermediate widths','Reduced motion separately checked'],['desktop-churn-m6','Retention','Two rounds8opens/Library returns,companion changes,30+60s idle','No hidden editors;no forced GC','Different from M5 linked/search churn;no direct comparison'],['m6-profile-conditions','Methodology','Isolated WebView2 folder to coexist with personal M5','Profile-cache/power differences disclosed','First-profile startup not directly comparable to M5']];
 scenarios.getRange('A40:E44').format.wrapText=true;scenarios.getRange('A40:E44').format.rowHeight=64;wb.worksheets.getItem('M5 vs M6').getRange('A7:H7').format.rowHeight=52;
}
if(m7Runs.length){
 parity.getRange('D4:F4').values=[['M6/M7 scoped Windows','docs/plans/VAULTOR-NEXT.md','Compact Activity/review integration in retained shell/themes; full desktop parity remains pending.']];
 parity.getRange('D5:F5').values=[['M7 scoped checks','docs/plans/VAULTOR-NEXT.md','Managed originals and editable imported notes, exports and persisted metadata; rich file previews remain M9.']];
 parity.getRange('D8:F8').values=[['M7 workspace guards','docs/plans/VAULTOR-NEXT.md','New staged restore, exclusive ownership, active-task switch refusal and root-bound actor receipts.']];
 parity.getRange('D18:F18').values=[['M7 bundled','docs/help/next-foundation.md','Managed imports/exports, duplicate/partial semantics, portable archive exclusions and Activity.']];
 parity.getRange('D20:F20').values=[['M7 local Rust engine','docs/plans/VAULTOR-NEXT.md','Real coalesced progress, cancellation, durable bounded history and Interrupted state; native OS projection remains M10.']];
 for(const row of [5,8,18,20]){parity.getRange('A'+row+':F'+row).format.wrapText=true;parity.getRange('A'+row+':F'+row).format.rowHeight=64;}
 scenarios.getRange('A46:E53').values=[['import-100-small-m7','Managed import','100 UTF8 files,970–971bytes each','Rust task duration vs command-to-terminal','Discovery/hash review precedes execution timing'],['import-nested-mixed-m7','Folder import','3files,3directories;Markdown/binary/unsupported syntax','Identity-based collections;immutable originals','Duplicate skip is filename/hash;separate-copy opt-in'],['import-moderate-m7','Background transfer','16x8MiB originals;128MiB;64KiB buffers','Task duration;3 input samples during running task','Different workload from idle/common editing'],['export-selected-m7','Resource export','One committed64KiB note','New-directory publication;existing output refuses','Unsupported structures fail;no lossless rich export claim'],['workspace-export/restore-m7','Portable transfer','219+resources and128MiB originals','Versioned manifest/hash inventory;new workspace only','Linked authority/drafts excluded;merge deferred'],['cancel-import-m7','Cancellation','Immediate supported boundary cancellation','Committed items remain;unpublished stages cleaned','Not distributed resume or all-or-nothing import'],['transfer-retention/peak-m7','Memory/CPU','Live process30+60s settling before restart','500ms sampled peak plus CIM cost;shared WS summed','Historical post-restart retention observation invalidated'],['native-pickers-m7','Windows UI','Actual file/folder/source-destination dialogs','Separate from uncontaminated performance run','Accessibility attached only after common measurements']];
 scenarios.getRange('A46:E53').format.wrapText=true;scenarios.getRange('A46:E53').format.rowHeight=64;
}
if(m9Runs.length){
 parity.getRange('D5:F5').values=[['M9 scoped Windows','docs/plans/VAULTOR-NEXT.md','Managed rich tables/code/slash,images and saved resource links; linked M5 boundary retained.']];
 parity.getRange('D18:F18').values=[['M9 bundled','docs/help/next-foundation.md','Editor/media bounds, membership clipboard, native prepared copies and explicit OS gaps.']];
 scenarios.getRange('A62:E65').values=[['resource-clipboard-m9','Memberships','Two stable identities/source/destination/other membership','IPC transaction receipt','Copy references; independent duplication deferred'],['editor-churn-m9','Retention','Ten alternating rich-note/target opens and Library returns','Before/after/30s settling; process tree','Separate from M8 organization churn; no forced GC'],['native-editor-m9','Windows UI','Real picker,slash/table and prepared-file interactions','Observed Windows pass,not a performance sample','Separate from unattached common idle run'],['m9-profile-conditions','Method','Common100-note/two64KiB isolated profile','Same boundary as M8;small uncontrolled sample','Working sets sum shared pages; no causal claim']];scenarios.getRange('A62:E65').format.wrapText=true;scenarios.getRange('A62:E65').format.rowHeight=64;
}
const metricSheet = wb.worksheets.getItem('Metrics');
metricSheet.getRange('A18:E29').values = metrics.map(m => [m,m.includes('percent')||m.endsWith('_pct')?'%':m.includes('set')||m.includes('bytes')||m.includes('mib')?'MiB':'ms','lower','M1 instrument; see repository benchmark README','Missing values remain blank']);
wb.recalculate();
for(const [sheetName,experiments] of [['M4 vs M5',['m4-managed-notes-v1','m5-managed-notes-v1']],['M5 vs M6',['m5-managed-notes-v1','m6-managed-notes-v1']],['M6 vs M7',['m6-managed-notes-v1','m7-managed-notes-v1']],['M7 vs M8',['m7-managed-notes-v1','m8-managed-notes-v1']],['M8 vs M9',['m8-managed-notes-v1','m9-managed-notes-v1']]]){
 if(!normalized.some(r=>r[2]===experiments[1]&&r[14]==='Y'))continue;
 // Exercise the actual comparison formulas on a small disposable workbook, without recalculating unrelated historical sheets repeatedly.
 const comparison=wb.worksheets.getItem(sheetName),controls=comparison.getRange('A4:B8').values;
 const sources=[controls[0][1],controls[1][1]],dataset=controls[3][1],device=controls[4][1];
 const qaRows=normalized.filter(r=>r[14]==='Y'&&sources.includes(r[4])&&r[9]===dataset&&r[5]===device&&r[8]==='managed-note-64k'&&r[11]==='note_open'&&experiments.includes(r[2]));
 const qa=Workbook.create(),qRaw=qa.worksheets.add('Raw Runs'),q=qa.worksheets.add(sheetName);qRaw.getRange('A5:R'+(qaRows.length+4)).values=qaRows;q.getRange('A4:B8').values=controls;q.getRange('A15:B15').values=comparison.getRange('A15:B15').values;q.getRange('C15:G15').formulas=comparison.getRange('C15:G15').formulas.map(row=>row.map(f=>f.replaceAll('$'+end,'$'+(qaRows.length+4))));
 q.getRange('B6').values=[['managed-note-64k']];qa.recalculate();const values=q.getRange('C15:G15').values[0];
 for(let i=0;i<2;i++){const matches=qaRows.filter(r=>r[4]===sources[i]),mean=matches.reduce((n,r)=>n+r[12],0)/matches.length;if(values[i+3]!==matches.length||Math.abs(values[i]-mean)>1e-6)throw Error(sheetName+' editing scenario mean/count mismatch');}
 console.log(sheetName+' editing means/counts',values);q.getRange('B6').values=[['missing-scenario']];qa.recalculate();const missing=q.getRange('C15:G15').values[0];if(missing[0]!==''||missing[1]!==''||missing[3]!==0||missing[4]!==0)throw Error('Missing scenario must stay blank');console.log('Scenario/missing-data recalculation passed in disposable workbook; delivery default untouched.');
}
console.log((await wb.inspect({kind:'table',range:'Dashboard!A11:H23',include:'values',tableMaxRows:13,tableMaxCols:8,maxChars:2400})).ndjson);
console.log((await wb.inspect({kind:'match',searchTerm:'#REF!|#DIV/0!|#VALUE!|#NAME\\?|#NUM!',options:{useRegex:true,maxResults:10},maxChars:1000})).ndjson);
if(!process.argv.includes('--data-only')){
const preview = await wb.render({sheetName:'Dashboard',range:'A4:H23',scale:1});
await fs.writeFile(join(root,'raw/workbook-after.png'),new Uint8Array(await preview.arrayBuffer()));
for(const [sheetName,range] of [['Raw Runs','K4:O12'],['Protocol','A3:B14'],['Parity Gates','A4:F10'],['Scenarios','A16:E21'],['Metrics','A18:E24']]) {
  const image=await wb.render({sheetName,range,scale:1});
  await fs.writeFile(join(root,'raw',`workbook-${sheetName.replaceAll(' ','-')}.png`),new Uint8Array(await image.arrayBuffer()));
}
if(m2Runs.length){const image=await wb.render({sheetName:'M1 vs M2',range:'A2:H20',scale:1});await fs.writeFile(join(root,'raw/workbook-M2.png'),new Uint8Array(await image.arrayBuffer()));console.log((await wb.inspect({kind:'table',range:'M1 vs M2!A10:H17',tableMaxRows:8,tableMaxCols:8,maxChars:1600})).ndjson);}
if(m3Runs.length){const image=await wb.render({sheetName:'M2 vs M3',range:'A2:H20',scale:1});await fs.writeFile(join(root,'raw/workbook-M3.png'),new Uint8Array(await image.arrayBuffer()));console.log((await wb.inspect({kind:'table',range:'M2 vs M3!A10:H17',tableMaxRows:8,tableMaxCols:8,maxChars:1600})).ndjson);}
if(m4Runs.length){const image=await wb.render({sheetName:'M3 vs M4',range:'A2:H20',scale:1});await fs.writeFile(join(root,'raw/workbook-M4.png'),new Uint8Array(await image.arrayBuffer()));console.log((await wb.inspect({kind:'table',range:'M3 vs M4!A10:H17',tableMaxRows:8,tableMaxCols:8,maxChars:1600})).ndjson);}
}
if(m5Runs.length&&!m6Runs.length){for(const [sheetName,range]of [['M4 vs M5','A2:H20'],['Scenarios','A34:E38'],['Parity Gates','A4:F10']]){const preview=await wb.render({sheetName,range,scale:1});await fs.writeFile(join(root,'raw','workbook-M5-'+sheetName.replaceAll(' ','-')+'.png'),new Uint8Array(await preview.arrayBuffer()));}console.log((await wb.inspect({kind:'table',range:'M4 vs M5!A10:H17',tableMaxRows:8,tableMaxCols:8,maxChars:1800})).ndjson);}
if(m6Runs.length&&!m7Runs.length){for(const [sheetName,range]of [['M5 vs M6','A2:H20'],['Scenarios','A40:E44'],['Parity Gates','A4:F10']]){const image=await wb.render({sheetName,range,scale:1});await fs.writeFile(join(root,'raw','workbook-M6-'+sheetName.replaceAll(' ','-')+'.png'),new Uint8Array(await image.arrayBuffer()));}console.log((await wb.inspect({kind:'table',range:'M5 vs M6!A10:H17',tableMaxRows:8,tableMaxCols:8,maxChars:1500})).ndjson);}
if(m7Runs.length&&!m8Runs.length){for(const [sheetName,range]of [['M6 vs M7','A2:H20'],['Scenarios','A46:E53'],['Parity Gates','A4:F10'],['Parity Gates','A18:F21']]){const image=await wb.render({sheetName,range,scale:1});await fs.writeFile(join(root,'raw','workbook-M7-'+sheetName.replaceAll(' ','-')+'-'+range.replace(':','-')+'.png'),new Uint8Array(await image.arrayBuffer()));}console.log((await wb.inspect({kind:'table',range:'M6 vs M7!A10:H17',tableMaxRows:8,tableMaxCols:8,maxChars:1600})).ndjson);}
if(m8Runs.length){
 const parity=wb.worksheets.getItem('Parity Gates');parity.getRange('A11').values=[['Organization / lifecycle']];parity.getRange('D18:F18').values=[['M8 bundled','docs/help/next-foundation.md','Tags,pins,Recents,Trash/Restore,permanent deletion and collection lifecycle Help.']];parity.getRange('D11:F11').values=[['M8 scoped Windows','docs/plans/VAULTOR-NEXT.md','Tags/pins/Trash/Restore and reviewed hierarchy deletion; remaining linked/media organization is pending.']];parity.getRange('A11:F11').format.wrapText=true;parity.getRange('A11:F11').format.rowHeight=64;
 const scenarios=wb.worksheets.getItem('Scenarios');scenarios.getRange('A55:E59').values=[['tags-1000-m8','Organization','1000 generated tags; substring and100-row pages','Command receipt separate from UI','Existing-first picker; committed metadata'],['bulk-tag/pin/trash/restore-100-m8','Organization','100 loaded managed resources','Single actor transaction','Same IDs/content; page-scoped frontend'],['empty-trash-205-m8','Lifecycle','205 resources across3 list pages','Confirmation to Activity terminal; Rust task separately','Independent eligible commits; protected drafts retained'],['organization-retention-m8','Retention','Bounded note/menu/tag/collection navigation then30+60s idle','No accessibility inspection; exact recipe in summary','Separate workload from M7 transfers'],['m8-profile-conditions','Method','Common100-note/two64KiB fixture; isolated WebView2','Power/cache/background uncontrolled','Small samples; no causal improvement claim']];scenarios.getRange('A60:E60').values=[['tag-picker-search-m8','Picker UI','Live tag;1 catalog tag/1 result','Input insertion to confirmed query response,including100ms debounce','Final focus-preserving native presentation run']];scenarios.getRange('A60:E60').format.wrapText=true;scenarios.getRange('A60:E60').format.rowHeight=64;scenarios.getRange('A55:E59').format.wrapText=true;scenarios.getRange('A55:E59').format.rowHeight=64;
 for(const [sheetName,range]of [['M7 vs M8','A2:H20'],['Scenarios','A55:E60'],['Parity Gates','A8:F11'],['Parity Gates','A18:F21']]){const preview=await wb.render({sheetName,range,scale:1});await fs.writeFile(join(root,'raw','workbook-M8-'+sheetName.replaceAll(' ','-')+'.png'),new Uint8Array(await preview.arrayBuffer()));}
}
await (await SpreadsheetFile.exportXlsx(wb)).save(path);
await fs.mkdir(join(root,'summaries'),{recursive:true});
for(const file of await fs.readdir(join(root,'raw'))) {
  if(!file.endsWith('.json'))continue;
  if(!rows.some(row=>String(row[16]).endsWith('/'+file)))continue;
  const report = JSON.parse(await fs.readFile(join(root,'raw',file),'utf8'));
  if(!report.architecture)continue;
  const {coexistingPersonalReference,editorRecipe,architecture,commit,dirty,executableSha256,timestamp,system,dataset,samples,limitations,success,error,runtime,viewport,node,appVersion,instrument,churnRecipeSha256,desktopRecipe,organizationRecipe,openProfile} = report;
  let {checks,transferRecipe,transferFixture}=report;
  if(file==='tauri-rust-2026-11-10T07-01-17.887Z.json'){checks=['Native keyboard resource export destination and native archive Save only; file/folder selection was skipped in this supplemental run.'];transferRecipe={...transferRecipe,mode:'native-output-only',metadataCorrection:'Original driver check label was too broad; final combined native-picker run separately verifies all picker workflows.'};}
  if(transferRecipe?.mode?.startsWith('native-')){const {moderateFiles,moderateFileBytes,moderateBytes,...actual}=transferFixture??{};transferFixture={...actual,metadataCorrection:'Moderate128MiB workload is generated only in transfer-performance mode; not exercised by native picker acceptance.'};}
  const linkedFixture=report.linkedFixture?.files===111?{...report.linkedFixture,files:110,metadataCorrection:'Recipe contains110 Markdown files and one nested directory; original111 counted that directory as a file.'}:report.linkedFixture;
  const processBreakdown=report.breakdowns?.map(b=>({phase:b.phase,timestamp:b.timestamp,roles:Object.entries(Object.groupBy(b.processes,p=>p.role)).map(([role,ps])=>({role,processes:ps.length,...Object.fromEntries(['workingSet','privateWorkingSet','privateBytes','cpuSeconds'].map(k=>[k,ps.reduce((n,p)=>n+(p[k]??0),0)]))}))}));
  const groups=new Map();
  for(const sample of samples??[]) {const key=[sample.scenario,sample.iteration,sample.metric].join('/');if(!groups.has(key))groups.set(key,[]);groups.get(key).push(sample);}
  const measurements=[...groups.values()].map(group=>{const first=group[0],values=group.map(s=>s.value).sort((a,b)=>a-b);return {scenario:first.scenario,iteration:first.iteration,metric:first.metric,unit:first.unit,n:values.length,min:values[0],median:(values[Math.floor((values.length-1)/2)]+values[Math.floor(values.length/2)])/2,p95:values[Math.ceil(values.length*.95)-1],max:values.at(-1)};});
  await fs.writeFile(join(root,'summaries',basename(file)),JSON.stringify({architecture,commit,dirty,executableSha256,timestamp,system,dataset,measurements,checks,limitations,success,error:(report.editorRecipe||report.linkedFixture||report.transferRecipe||report.organizationRecipe||measurements.some(m=>m.scenario.startsWith('desktop-')))&&error?error.split('\n')[0]:error,runtime,viewport,node,appVersion,instrument,churnRecipeSha256,desktopRecipe,organizationRecipe,editorRecipe,coexistingPersonalReference,transferRecipe,transferFixture,openProfile,linkedFixture,processBreakdown,...((report.editorRecipe||report.transferRecipe||report.organizationRecipe)?{comparisonEligible:!failures.has('benchmarks/tauri-rust/raw/'+file)}:{})},null,2)+'\n');
}
if(m9Runs.length){for(const [sheetName,range]of [['M8 vs M9','A2:H20'],['Scenarios','A62:E65'],['Parity Gates','A4:F10']]){const preview=await wb.render({sheetName,range,scale:1});await fs.writeFile(join(root,'raw','workbook-M9-'+sheetName.replaceAll(' ','-')+'.png'),new Uint8Array(await preview.arrayBuffer()));}}
console.log(`Refreshed workbook from ${rows.length} canonical records; ${failures.size} invalidated runs.`);
