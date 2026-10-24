// @vitest-environment jsdom
import { it, expect } from 'vitest';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { Table, TableRow, TableCell, TableHeader } from '@tiptap/extension-table';
import { closeHistory } from '@tiptap/pm/history';
import { MarkdownEngine } from './engine';
import { markdownExtensions, setMarkdownAlignment } from './extensions';
import { canonical, project } from './syntax';
import { clipboardReason, snapshotCache, shapeCache, shapeReason } from './foreground';
import { LIMITS } from './limits';
function fixture(source: string) {
  const engine = new MarkdownEngine(new TextEncoder().encode(source));
  const editor = new Editor({ extensions: [StarterKit, Table, TableRow, TableCell, TableHeader, ...markdownExtensions()], content: engine.projection.doc });
  const locate = (text: string) => { let p = -1; editor.state.doc.descendants((n, pos) => { if (p < 0 && n.isText && n.text!.includes(text)) p = pos + n.text!.indexOf(text); }); if(p < 0) throw new Error(text); return p; };
  const sync = () => { const before = engine.source, result = engine.apply(editor.getJSON()); expect(result.accepted, result.reason).toBe(true); expect(canonical(project(engine.source).doc)).toEqual(canonical(editor.getJSON())); for(const patch of result.patches) { const a = new TextEncoder().encode(before), b = new TextEncoder().encode(engine.source); expect(b.slice(0,patch.start)).toEqual(a.slice(0,patch.start)); expect(b.slice(patch.start + new TextEncoder().encode(patch.text).length)).toEqual(a.slice(patch.end)); } return result; };
  return {engine,editor,locate,sync};
}
for (const line of [
  'Text &amp; and &#x1F600; plus \\*literal\\*.',
  'Text **bold _nested_** and *other* plus __mixed__.',
  'Text `same` and ``same`` plus _same_ and *same*.',
  'Text &copy; adjacent **bold**_italic_ end.',
]) it('R1 repeated formatting preserves raw tokens and exact Undo: ' + line, () => {
  const source = line + '\r\n\r\n<!-- raw -->\r\n\r\nTail.\r\n', f = fixture(source);
  f.editor.chain().setTextSelection({from:1,to:5}).toggleBold().run(); f.sync();
  expect(f.engine.source).toContain(line.slice(4));
  f.editor.commands.undo(); f.sync(); expect(f.engine.source).toBe(source);
  f.editor.commands.redo(); f.sync(); f.editor.commands.undo(); f.sync(); expect(f.engine.source).toBe(source); f.editor.destroy();
});
it('R1 applying a mark to an entity preserves the entity spelling and astral boundaries', () => {
  const f=fixture('Before &amp; 😀 after.\n\nTail.\n'), p=f.locate('&');
  f.editor.chain().setTextSelection({from:p,to:p+1}).toggleBold().run(); f.sync(); expect(f.engine.source).toContain('**&amp;**');
  f.editor.commands.undo(); f.sync(); expect(f.engine.source).toBe('Before &amp; 😀 after.\n\nTail.\n'); f.editor.destroy();
});
it('R1 formatting across protected inline references preserves the atom', () => {
  const f=fixture('Text [label][ref] and &amp; end.\n\n[ref]: ../a.md\n');
  f.editor.chain().setTextSelection({from:1,to:5}).toggleItalic().run(); f.sync();
  expect(f.engine.source).toContain('[label][ref]'); expect(f.engine.source).toContain('&amp;'); f.editor.destroy();
});
it('R1 uncertain encoded cross-format replacement preserves source and recoverable draft', () => {
  const source='A &amp; and **bold** tail.\n', f=fixture(source);
  f.editor.commands.setTextSelection({from:1,to:3}); f.editor.commands.insertContent('New');
  const result=f.engine.apply(f.editor.getJSON());
  if(result.accepted) expect(f.engine.source).toContain('&amp;'); else { expect(f.engine.source).toBe(source); expect(f.editor.getText()).toContain('New'); }
  f.editor.destroy();
});
for(const eol of ['\n','\r\n']) it('R2 row/column/alignment operations and successive exact history ' + JSON.stringify(eol), () => {
  const source='Keep _raw_.\n\n| a | b |\n| :--- | ---: |\n| c | d |\n| e | f |\n\n<!-- raw -->\n'.replaceAll('\n',eol), f=fixture(source);
  const choose=(text:string)=>f.editor.commands.setTextSelection(f.locate(text));
  choose('d'); f.editor.commands.addColumnBefore(); f.sync(); expect(f.engine.projection.doc.content![1].attrs!.mdAlign).toEqual(['left',null,'right']);
  choose('d'); setMarkdownAlignment(f.editor,'center'); f.sync(); expect(f.engine.projection.doc.content![1].attrs!.mdAlign).toEqual(['left',null,'center']);
  choose('d'); f.editor.commands.addRowAfter(); f.sync();
  choose('f'); f.editor.commands.deleteRow(); f.sync();
  choose('d'); f.editor.commands.deleteColumn(); f.sync(); expect(f.engine.projection.doc.content![1].attrs!.mdAlign).toEqual(['left',null]);
  expect(f.engine.source.startsWith('Keep _raw_.'+eol+eol)).toBe(true); expect(f.engine.source.endsWith(eol+eol+'<!-- raw -->'+eol)).toBe(true);
  while(f.editor.commands.undo()) f.sync(); expect(f.engine.source).toBe(source);
  while(f.editor.commands.redo()) f.sync(); f.editor.destroy();
});
it('R2 GFM header removal and spans reject instead of silently losing semantics', () => {
  const source='| a | b |\n| --- | --- |\n| c | d |\n', f=fixture(source);
  f.editor.commands.setTextSelection(f.locate('a')); f.editor.commands.toggleHeaderRow();
  const r=f.engine.apply(f.editor.getJSON()); expect(r.accepted).toBe(false); expect(f.engine.source).toBe(source); f.editor.commands.undo();
  const doc=structuredClone(f.engine.projection.doc); doc.content![0].content![0].content![0].attrs={colspan:2};
  expect(f.engine.apply(doc).reason).toBe('TABLE_SPANS_REQUIRE_SOURCE'); f.editor.destroy();
});
it('R3 snapshot cache is exact, shares unchanged subtrees and follows Undo without retaining old roots', () => {
  const f=fixture('First **bold**.\n\nTail.\n'), read=snapshotCache(), initial=f.editor.state.doc, a=read(initial);
  expect(JSON.stringify(a)).toBe(JSON.stringify(f.editor.getJSON()));
  f.editor.view.dispatch(closeHistory(f.editor.state.tr.insertText('x',2))); const b=read(f.editor.state.doc);
  expect(b.content![1]).toBe(a.content![1]); expect(b.content![0]).not.toBe(a.content![0]);
  expect(JSON.stringify(b)).toBe(JSON.stringify(f.editor.getJSON())); expect(shapeReason(shapeCache()(f.editor.state.doc),2)).toBeUndefined(); f.editor.destroy();
});
it('R3 dense/long-line admission is bounded before an editor is mounted', () => {
  expect(()=>new MarkdownEngine(new TextEncoder().encode('x'.repeat(LIMITS.textBlockUnits+1)),LIMITS.interactiveBytes)).toThrow('RENDER_COMPLEXITY_LIMIT');
  expect(()=>new MarkdownEngine(new TextEncoder().encode('x\n\n'.repeat(1501)),LIMITS.interactiveBytes)).toThrow('RENDER_COMPLEXITY_LIMIT');
});
it('R3 clipboard complexity is bounded before DOM parsing, including malformed/deep input',()=>{
  expect(clipboardReason('', '<span>'.repeat(33)+'x'+'</span>'.repeat(33))).toBe('CLIPBOARD_COMPLEXITY_LIMIT');
  expect(clipboardReason('', '<br>'.repeat(1501))).toBe('CLIPBOARD_COMPLEXITY_LIMIT');
  expect(clipboardReason('x\n'.repeat(1501),'')).toBe('CLIPBOARD_COMPLEXITY_LIMIT');
  expect(clipboardReason('x','<p><strong>x</strong></p>')).toBeUndefined();
});
it('R1 interior of a multi-codepoint entity remains a precise refusal with draft intact', () => {
  const source='A &NotEqualTilde; B.\n', f=fixture(source), p=f.locate('≂');
  f.editor.chain().setTextSelection({from:p,to:p+1}).toggleBold().run();
  const r=f.engine.apply(f.editor.getJSON()); expect(r.accepted).toBe(false); expect(f.engine.source).toBe(source); expect(f.editor.getHTML()).toContain('<strong>'); f.editor.destroy();
});
const workflowEvidence: object[]=[];
for(const path of ['docs/CODEBASE.md','docs/workspace/SESSIONS.md','docs/workspace/NAVIGATION.md','docs/security/HOST-ACCESS.md','docs/design/UI_PHILOSOPHY.md']) it('R5 visual-operation corpus workflow, no fallback: '+path, async()=>{
  const {readFileSync,writeFileSync,mkdirSync}=await import('node:fs'), {resolve}=await import('node:path'), {createHash}=await import('node:crypto');
  const source=readFileSync(resolve('..',path),'utf8'), e=new MarkdownEngine(new TextEncoder().encode(source),LIMITS.interactiveBytes), base=structuredClone(e.projection.doc);
  const index=base.content!.findIndex(n=>n.type==='paragraph'&&n.content?.length===1&&n.content[0].type==='text'&&!n.content[0].marks?.length&&n.content[0].text!.length>12);expect(index).toBeGreaterThanOrEqual(0);
  const paragraph=base.content![index], value=paragraph.content![0].text!, operations:object[]=[];
  const edits: [string,(doc:typeof base)=>void][]=[
    ['text',doc=>{doc.content![index].content![0].text='Edited '+value;}],
    ['bold',doc=>{doc.content![index].content=[{type:'text',text:value.slice(0,5),marks:[{type:'bold'}]},{type:'text',text:value.slice(5)}];}],
    ['italic',doc=>{doc.content![index].content=[{type:'text',text:value.slice(0,5),marks:[{type:'italic'}]},{type:'text',text:value.slice(5)}];}],
    ['heading',doc=>{doc.content![index].type='heading';doc.content![index].attrs={level:2};}],
    ['paragraph split',doc=>{doc.content!.splice(index,1,{type:'paragraph',content:[{type:'text',text:value.slice(0,5)}]},{type:'paragraph',content:[{type:'text',text:value.slice(5)}]});}],
    ['link',doc=>{doc.content!.push({type:'paragraph',content:[{type:'text',text:'Guide',marks:[{type:'link',attrs:{href:'../guide.md',title:'Keep'}}]}]});}],
    ['list',doc=>{doc.content!.push({type:'bulletList',content:[{type:'listItem',content:[{type:'paragraph',content:[{type:'text',text:'New item'}]}]}]});}],
    ['code',doc=>{doc.content!.push({type:'codeBlock',attrs:{language:'js',mdMeta:null},content:[{type:'text',text:'const value = 1;'}]});}],
    ['table',doc=>{doc.content!.push(project('| a | b |\n| --- | --- |\n| c | d |').doc.content![0]);}],
    ['paragraph deletion',doc=>{doc.content!.splice(index,1);}]
  ];
  for(const [label,change] of edits){const doc=structuredClone(base);change(doc);const result=e.apply(doc);operations.push({label,accepted:result.accepted,reason:result.reason,patchMs:result.patchMs,validationMs:result.validationMs});expect(result.accepted,label+': '+result.reason).toBe(true);expect(e.apply(base).accepted).toBe(true);expect(e.source).toBe(source);}
  workflowEvidence.push({path,sha256:createHash('sha256').update(source).digest('hex'),bytes:Buffer.byteLength(source),operations});
  if(process.env.VAULTOR_RECORD_MARKDOWN_REMEDIATION==='1'){const dir=resolve('../experiments/linked-markdown/g1/remediation/evidence');mkdirSync(dir,{recursive:true});writeFileSync(resolve(dir,'workflow.json'),JSON.stringify({method:'10 scripted common operations and exact inverse restoration on each of five actual docs; not telemetry or physical user study',documents:workflowEvidence},null,2)+'\n');}
});
it('R5 representative encoded-formatting/aligned-table diff and byte ledger',async()=>{
  const source='---\ntitle: keep\n---\n\nText &amp; and **bold _nested_** with `same` and ``same``.\n\n| a | b |\n| :--- | ---: |\n| c | d |\n\n<!-- untouched -->\n', f=fixture(source), ledger:object[]=[];
  f.editor.chain().setTextSelection({from:f.locate('Text'),to:f.locate('Text')+4}).toggleBold().run();ledger.push(f.sync());
  let cell=-1;f.editor.state.doc.descendants((n,p)=>{if(n.isText&&n.text==='d')cell=p;});expect(cell).toBeGreaterThan(0);
  f.editor.commands.setTextSelection(cell);expect(f.editor.commands.addColumnBefore()).toBe(true);ledger.push(f.sync());
  expect(f.engine.source).toContain('&amp; and **bold _nested_** with `same` and ``same``.');expect(f.engine.source.endsWith('\n\n<!-- untouched -->\n')).toBe(true);
  if(process.env.VAULTOR_RECORD_MARKDOWN_REMEDIATION==='1'){const {writeFileSync,mkdirSync}=await import('node:fs'),{resolve}=await import('node:path'),{spawnSync}=await import('node:child_process');const dir=resolve('../experiments/linked-markdown/g1/remediation/evidence');mkdirSync(dir,{recursive:true});writeFileSync(resolve(dir,'locality.before.md'),source);writeFileSync(resolve(dir,'locality.after.md'),f.engine.source);writeFileSync(resolve(dir,'locality.json'),JSON.stringify(ledger,null,2)+'\n');const diff=spawnSync('git',['diff','--no-index','--','locality.before.md','locality.after.md'],{cwd:dir,encoding:'utf8',windowsHide:true});expect(diff.status).toBe(1);writeFileSync(resolve(dir,'locality.diff'),diff.stdout);}
  f.editor.destroy();
});
it('R2 per-cell alignment cannot silently become a column alignment',()=>{
  const f=fixture('| a | b |\n| :--- | ---: |\n| c | d |\n');
  const doc=structuredClone(f.engine.projection.doc); doc.content![0].content![1].content![0].attrs!.mdAlignment='right';
  expect(f.engine.apply(doc).reason).toBe('CELL_ALIGNMENT_REQUIRES_COLUMN_COMMAND');f.editor.destroy();
});
it('R1 nested mark removal preserves separate mixed delimiters and exact successive Undo',()=>{
  const source='**bold _nested_** then *other* and __mixed__.\n\nTail.\n',f=fixture(source),p=f.locate('nested');
  f.editor.chain().setTextSelection({from:p,to:p+6}).unsetItalic().run();f.sync();
  expect(f.engine.source).toContain('*other* and __mixed__');
  f.editor.commands.undo();f.sync();expect(f.engine.source).toBe(source);
  f.editor.commands.redo();f.sync();f.editor.commands.undo();f.sync();expect(f.engine.source).toBe(source);f.editor.destroy();
});
