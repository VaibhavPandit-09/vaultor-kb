import { expect, it } from 'vitest';
import { MarkdownEngine } from './engine';
import { project, key } from './syntax';
import { LIMITS } from './limits';

it('retains byte-local patches and exact Undo/Redo at beginning, middle and end near 1 MiB', () => {
  const paragraph = 'Ordinary technical paragraph with unchanged source spelling and words. '.repeat(8);
  const chunk = `## Heading\r\n\r\n${paragraph}\r\n\r\n- first **bold** item\r\n- second item\r\n\r\n\`\`\`ts\r\nconst value = 1;\r\n\`\`\`\r\n\r\n`;
  const source = '\ufeff---\r\ntitle: unchanged\r\n---\r\n\r\n' + chunk.repeat(Math.floor((LIMITS.bytes - 4096) / chunk.length)) + '[label][ref]\r\n\r\n[ref]: ./guide.md "retain"\r\n';
  const engine = new MarkdownEngine(new TextEncoder().encode(source), LIMITS.interactiveBytes);
  const indexes = engine.projection.blocks.flatMap((b,i)=>b.node.type==='paragraph' && b.raw.startsWith('Ordinary') ? [i] : []);
  for (const index of [indexes[0],indexes[Math.floor(indexes.length/2)],indexes.at(-1)!]) {
    const before = engine.source, doc = structuredClone(engine.projection.doc), block = engine.projection.blocks[index];
    doc.content![index].content![0].text = block.node.content![0].text!.replace('technical','technical LOCAL');
    const result = engine.apply(doc);
    expect(result.accepted, result.reason).toBe(true);
    expect(result.patches).toHaveLength(1);
    expect(result.patches[0].text.trim()).toBe('LOCAL');
    expect(result.patches[0].removed).toBe('');
    expect(engine.source).toBe(before.slice(0,block.start)+block.raw.replace('technical','technical LOCAL')+before.slice(block.end));
    const after = engine.source;
    expect(engine.apply(project(before).doc).accepted).toBe(true); expect(engine.source).toBe(before);
    expect(engine.apply(doc).accepted).toBe(true); expect(engine.source).toBe(after);
    // Independent full parse must reproduce every shifted source range.
    const full = project(after);
    expect(engine.projection.syntaxNodes).toBe(full.syntaxNodes);
    expect(key(engine.projection.doc)).toBe(key(full.doc));
    expect(engine.projection.blocks).toEqual(full.blocks);
    expect(engine.projection.leaves).toEqual(full.leaves);
  }
}, 30000);

it.each([
  'Before.\n\nA paragraph with words\nand a continuation.\n\nAfter.\n',
  '# Heading words\n\nAfter.\n',
  'Heading words\n=============\n\nAfter.\n',
  'Before.\r\n\r\nA **bold** word &amp; escaped \\*text.\r\n\r\n<!-- keep -->\r\n',
  'Before.\n\nA [label][ref] word stays protected.\n\n[ref]: ./keep.md\n',
  'Before.\n\nA www.example.org word.\n\nAfter.\n',
])('incremental projection agrees with full parsing around context-sensitive syntax: %s', source => {
  const engine = new MarkdownEngine(new TextEncoder().encode(source));
  const doc = structuredClone(engine.projection.doc);
  const change = (node: typeof doc): boolean => {
    if(node.type==='text' && /word/.test(node.text!)){node.text=node.text!.replace('word','word LOCAL');return true;}
    return node.content?.some(change) ?? false;
  };
  expect(change(doc)).toBe(true);
  const result = engine.apply(doc); expect(result.accepted,result.reason).toBe(true);
  const full = project(engine.source);
  expect(engine.projection.blocks).toEqual(full.blocks);
  expect(engine.projection.leaves).toEqual(full.leaves);
  expect([...engine.projection.fragments].sort((a,b)=>a.start-b.start)).toEqual([...full.fragments].sort((a,b)=>a.start-b.start));
});

it('counts retained parser nodes when a local edit would exceed the full-document syntax ceiling',()=>{
  const source=Array.from({length:4},()=>'*x* '.repeat(2400).trimEnd()).join('\n\n');
  const engine=new MarkdownEngine(new TextEncoder().encode(source)),doc=structuredClone(engine.projection.doc);
  for(let i=0;i<600;i++)doc.content![0].content!.push({type:'text',text:' '},{type:'text',text:'x',marks:[{type:'italic'}]});
  const result=engine.apply(doc);
  expect(result.accepted).toBe(false);expect(result.reason).toBe('SOURCE_COMPLEXITY_LIMIT');expect(engine.source).toBe(source);
},15000);
