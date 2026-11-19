import Papa from 'papaparse';
import type {JSONContent} from '@tiptap/core';
import {project} from '../lib/markdown/syntax';

export function tableContent(source: string): JSONContent[] {
  const parsed = Papa.parse<string[]>(source.replace(/^\uFEFF/, ''), {
    delimitersToGuess: [',', '\t', ';'],
    preview: 10002,
  });
  if (parsed.errors.some(error => error.code !== 'UndetectableDelimiter')) {
    throw new Error('Malformed quoted fields. Correct the file and try again.');
  }
  const rows = parsed.data;
  if (/[\r\n]$/.test(source) && rows.at(-1)?.length === 1 && rows.at(-1)?.[0] === '') rows.pop();
  const width = rows.reduce((max, row) => Math.max(max, row.length), 0);
  if (parsed.meta.truncated || rows.length > 10000 || width > 500 || width * rows.length > 50000) {
    throw new Error('Table insertion is limited to 10,000 rows, 500 columns and 50,000 cells.');
  }
  if (!width || !source.trim()) throw new Error('The table file is empty.');
  return [{
    type: 'table',
    content: rows.map((row, index) => ({
      type: 'tableRow',
      content: Array.from({length: width}, (_, column) => ({
        type: index === 0 ? 'tableHeader' : 'tableCell',
        content: [{type: 'paragraph', content: row[column] ? [{type: 'text', text: row[column]}] : []}],
      })),
    })),
  }];
}

export function markdownContent(source: string): JSONContent[] {
  const {blocks} = project(source);
  if (!blocks.length) throw new Error('The Markdown file is empty.');
  const visit = (node: JSONContent) => {
    if (node.type === 'sourceInline' || node.type === 'sourceBlock' || node.attrs?.mdMeta || node.attrs?.mdAlignment) {
      throw new Error('This Markdown contains syntax that cannot be inserted faithfully, such as images, reference definitions, HTML, aligned tables or code metadata.');
    }
    for (const mark of node.marks ?? []) {
      if (mark.type === 'link' && !/^(https?:\/\/|mailto:|#)/i.test(mark.attrs?.href ?? '')) {
        throw new Error('This Markdown contains a relative or unsupported link. Use a web address or heading anchor.');
      }
    }
    node.content?.forEach(visit);
  };
  for (const block of blocks) visit(block.node);
  return blocks.map(block => block.node);
}
