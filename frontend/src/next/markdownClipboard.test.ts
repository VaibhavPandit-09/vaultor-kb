import {describe,expect,it} from 'vitest';
import {markdownClipboard} from './markdownClipboard';

const transfer=(plain:string,html='',markdown='')=>({
  getData:(type:string)=>({'text/plain':plain,'text/html':html,'text/markdown':markdown})[type]??'',
});
describe('managed Markdown paste admission',()=>{
  it('lets normal prose, keyboard-like text, rich HTML and TSV keep their normal behavior',()=>{
    expect(markdownClipboard(transfer('ordinary text about * an example'))).toBeNull();
    expect(markdownClipboard(transfer('- one ordinary line'))).toBeNull();
    expect(markdownClipboard(transfer('# rich','<h1>rich</h1>'))).toBeNull();
    expect(markdownClipboard(transfer('A\tB\n1\t2'))).toBeNull();
  });
  it('recognizes explicit Markdown and clear structural text',()=>{
    expect(markdownClipboard(transfer('plain','','# Explicit'))).toBe('# Explicit');
    expect(markdownClipboard(transfer('## Section\n\n- [x] task'))).toContain('Section');
    expect(markdownClipboard(transfer('| A | B |\n|---|---|\n| 1 | 2 |'))).toContain('|---|---|');
  });
});
