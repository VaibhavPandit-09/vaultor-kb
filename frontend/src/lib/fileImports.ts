import type { ImportTarget } from './importTarget';
import { generateJSON, type JSONContent } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { Table } from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableCell from '@tiptap/extension-table-cell';
import TableHeader from '@tiptap/extension-table-header';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import Highlight from '@tiptap/extension-highlight';
import { markdownToHtml } from '../components/editor/markdownUtils';
import { buildCsvImportBlocks } from '../components/editor/csvUtils';
import api from './api';
import type { Resource } from '../types';

export type ImportKind = 'markdown' | 'text' | 'code' | 'csv' | 'binary';
export const MAX_TEXT_BYTES = 5 * 1024 * 1024;
export function classifyFile(name: string, mime = ''): ImportKind {
  const ext = name.split('.').pop()?.toLowerCase();
  if (ext === 'md' || ext === 'markdown') return 'markdown';
  if (ext === 'txt') return 'text';
  if (ext === 'csv' || ext === 'tsv') return 'csv';
  if (ext && ['js','jsx','ts','tsx','py','java','go','rs','c','cpp','h','cs','rb','sh','sql','json','yaml','yml','toml','xml','html','css','log','ini','cfg'].includes(ext)) return 'code';
  if (mime.startsWith('text/')) return 'code';
  return 'binary';
}
export const noteTitle = (name: string) => name.replace(/\.[^.]+$/, '').trim().slice(0, 500) || 'Imported note';
export async function readImportText(file: File): Promise<string> {
  if (file.size > MAX_TEXT_BYTES) throw new Error('Text-to-note import is limited to 5 MiB. Keep this file as an original resource instead.');
  const bytes = new Uint8Array(await file.arrayBuffer());
  let text: string;
  try {
    const encoding = bytes[0] === 255 && bytes[1] === 254 ? 'utf-16le' : bytes[0] === 254 && bytes[1] === 255 ? 'utf-16be' : 'utf-8';
    text = new TextDecoder(encoding, { fatal: true }).decode(bytes).replace(/^\uFEFF/, '');
  } catch { throw new Error('Unsupported text encoding. Save as UTF-8 or UTF-16 with a BOM, or keep the original file.'); }
  if (text.includes('\0')) throw new Error('This file contains binary data. Keep it as an original file.');
  return text.replace(/\r\n?/g, '\n');
}
const paragraph = (text: string): JSONContent => ({ type: 'paragraph', content: text ? [{ type: 'text', text }] : [] });
export function convertText(kind: ImportKind, text: string): { doc: JSONContent; warnings: string[] } {
  const warnings: string[] = [];
  let content: JSONContent[];
  if (kind === 'markdown') {
    // Parse in an inert document. Images are preserved as references, never fetched.
    const template = document.createElement('template');
    template.innerHTML = markdownToHtml(text);
    const parsed = template.content;
    parsed.querySelectorAll('img').forEach(image => {
      const reference = image.getAttribute('src') ?? '';
      warnings.push(`Image kept as a text reference (asset not imported): ${reference.slice(0, 180)}`);
      image.replaceWith(document.createTextNode(`[Image: ${image.getAttribute('alt') || 'image'}] (${reference})`));
    });
    parsed.querySelectorAll('a').forEach(link => {
      const href = link.getAttribute('href') ?? '';
      if (!/^(https?:|mailto:|#)/i.test(href)) {
        warnings.push(`Local or unsupported link kept as text: ${href.slice(0, 180)}`);
        link.replaceWith(document.createTextNode(`${link.textContent} (${href})`));
      }
    });
    parsed.querySelectorAll('script,style,iframe,object,embed').forEach(node => node.remove());
    const doc = generateJSON(template.innerHTML, [StarterKit, Table, TableRow, TableCell, TableHeader, TaskList, TaskItem.configure({ nested: true }), Highlight]);
    return { doc, warnings: [...new Set(warnings)].slice(0, 50) };
  } else if (kind === 'csv') {
    // No extra file resource is required when the user explicitly chooses a note.
    content = buildCsvImportBlocks({ id: '', title: '', type: 'file' }, text).tableContent;
    delete content[0].attrs;
  } else if (kind === 'code') content = [{ type: 'codeBlock', content: text ? [{ type: 'text', text }] : [] }];
  else content = text.split('\n').map(paragraph);
  return { doc: { type: 'doc', content }, warnings };
}

/** Retrying the same ID returns the original creation, even after a lost response. */
export async function importResource(id: string, file: File, doc?: JSONContent): Promise<Resource> {
  const body = new FormData();
  body.append('title', doc ? noteTitle(file.name) : file.name);
  if (doc) body.append('content', JSON.stringify(doc)); else body.append('file', file);
  const { data } = await api.put<Resource>('/resources/imports/' + id, body);
  return data;
}

export type ImportRow = { id: string; file: File; kind: ImportKind; asNote: boolean; doc?: JSONContent; warnings: string[]; parseError?: string; status: 'ready' | 'pending' | 'done' | 'failed'; error?: string; started?: boolean };
export type ImportSession = { rows: ImportRow[]; target?: ImportTarget; mode?: 'markdown' | 'csv' | 'link' };
export async function prepareImport(files: File[], target?: ImportTarget, mode?: ImportSession['mode']): Promise<ImportSession> {
  const rows = await Promise.all(files.map(async file => {
    const kind = mode === 'link' ? 'binary' : mode ?? classifyFile(file.name, file.type);
    const row: ImportRow = { id: crypto.randomUUID(), file, kind, asNote: kind === 'markdown' || kind === 'text', warnings: [], status: 'ready' };
    if (kind !== 'binary') {
      try { const result = convertText(kind, await readImportText(file)); row.doc = result.doc; row.warnings = result.warnings; }
      catch (error) { row.parseError = error instanceof Error ? error.message : String(error); }
    }
    return row;
  }));
  return { rows, target, mode };
}

