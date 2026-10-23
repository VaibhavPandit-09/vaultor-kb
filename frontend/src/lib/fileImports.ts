import type { ImportTarget } from './importTarget';
import { Node, generateJSON, type JSONContent } from '@tiptap/core';
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
export type ImportReference = {id:string;type:'note'|'file';image?:boolean;fragment?:string};
export function convertText(kind: ImportKind, text: string, resolve?: (href:string)=>ImportReference|undefined): { doc: JSONContent; warnings: string[] } {
  const warnings: string[] = [];
  let content: JSONContent[];
  if (kind === 'markdown') {
    // Parse in an inert document. Images are preserved as references, never fetched.
    const template = document.createElement('template');
    template.innerHTML = markdownToHtml(text);
    const parsed = template.content;
    const references=new Map<string,ImportReference>();
    parsed.querySelectorAll('[data-import-reference]').forEach(node=>node.removeAttribute('data-import-reference'));
    const marker=(reference:ImportReference)=>{const key=crypto.randomUUID();references.set(key,reference);return key;};
    parsed.querySelectorAll('img').forEach(image => {
      const reference = image.getAttribute('src') ?? '';
      const target=resolve?.(reference);
      if(target?.image){image.removeAttribute('src');image.setAttribute('data-import-reference',marker(target));return;}
      warnings.push(`Image kept as a text reference (asset not imported): ${reference.slice(0, 180)}`);
      image.replaceWith(document.createTextNode(`[Image: ${image.getAttribute('alt') || 'image'}] (${reference})`));
    });
    parsed.querySelectorAll('a').forEach(link => {
      const href = link.getAttribute('href') ?? '';
      const target=resolve?.(href);
      if(target){const span=document.createElement('span');span.setAttribute('data-import-reference',marker(target));span.textContent=link.textContent;link.replaceWith(span);if(target.fragment)span.after(document.createTextNode(` (heading: #${target.fragment})`));return;}
      if (!/^(https?:|mailto:|#)/i.test(href)) {
        warnings.push(`Local or unsupported link kept as text: ${href.slice(0, 180)}`);
        link.replaceWith(document.createTextNode(`${link.textContent} (${href})`));
      }
    });
    parsed.querySelectorAll('script,style,iframe,object,embed').forEach(node => node.remove());
    const resourceLink=Node.create({name:'resourceLink',group:'inline',inline:true,atom:true,addAttributes(){return {resourceId:{default:null},label:{default:null},type:{default:'note'}};},parseHTML(){return [{tag:'span[data-import-reference]',getAttrs:node=>{const target=references.get((node as HTMLElement).dataset.importReference??'');return target?{resourceId:target.id,label:(node as HTMLElement).textContent,type:target.type}:false;}}];}});
    const image=Node.create({name:'image',group:'block',atom:true,addAttributes(){return {resourceId:{default:null},alt:{default:''},width:{default:100},alignment:{default:'center'}};},parseHTML(){return [{tag:'img[data-import-reference]',getAttrs:node=>{const target=references.get((node as HTMLElement).dataset.importReference??'');return target?{resourceId:target.id,alt:(node as HTMLElement).getAttribute('alt')??''}:false;}}];}});
    const doc = generateJSON(template.innerHTML, [resourceLink,image,StarterKit, Table, TableRow, TableCell, TableHeader, TaskList, TaskItem.configure({ nested: true }), Highlight]);
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
export async function importResource(id: string, file: File, doc?: JSONContent, collectionId?: string, progress?: (percent: number) => void, source?:{generation:string;epoch:number}): Promise<Resource> {
  const body = new FormData();
  if(collectionId) body.append('collectionId',collectionId);
  body.append('title', doc ? noteTitle(file.name) : file.name);
  if (doc) body.append('content', JSON.stringify(doc)); else body.append('file', file);
  const { data } = await api.put<Resource>('/resources/imports/' + id, body, { ...(source?{connectionEpoch:source.epoch,headers:{'X-Vaultor-Generation':source.generation}}:{}),onUploadProgress: event => progress?.(Math.round((event.progress ?? 0) * 85)) });
  return data;
}

export type ImportRow = { path?:string; imageValid?:boolean; sourceText?:string; destinationId?:string; resolved?:boolean; revision?:string; id: string; file: File; kind: ImportKind; asNote: boolean; doc?: JSONContent; warnings: string[]; parseError?: string; status: 'ready' | 'pending' | 'done' | 'failed'; error?: string; started?: boolean };
export type ImportSession = { collection?: {id:string;name:string}; rows: ImportRow[]; target?: ImportTarget; mode?: 'markdown' | 'csv' | 'link'; folder?: {name:string;directories:string[];emptyFoldersUnavailable?:boolean} };
export async function prepareImport(files: File[] & {directories?:string[];emptyFoldersUnavailable?:boolean}, target?: ImportTarget, mode?: ImportSession['mode']): Promise<ImportSession> {
  if(files.length>2000||files.reduce((n,f)=>n+f.size,0)>2*1024*1024*1024)throw new Error('Select at most 2,000 files and 2 GiB.');
  let decoded=0;
  const rows:ImportRow[]=[];
  const ordered=[...files].sort((a,b)=>(a.webkitRelativePath||a.name).localeCompare(b.webkitRelativePath||b.name));
  for(const file of ordered) {
    const kind = mode === 'link' ? 'binary' : mode ?? classifyFile(file.name, file.type);
    const row: ImportRow = { id: crypto.randomUUID(), path:(file.webkitRelativePath||file.name).normalize('NFC'), file, kind, asNote: kind === 'markdown' || kind === 'text', warnings: [], status: 'ready' };
    if (kind !== 'binary') {
      try { row.sourceText=await readImportText(file);decoded+=row.sourceText.length*2;if(decoded>64*1024*1024){row.sourceText=undefined;throw new Error('Decoded text exceeds 64 MiB. Keep remaining files as originals.');} const result = convertText(kind, row.sourceText); row.doc = result.doc; row.warnings = result.warnings; }
      catch (error) { row.parseError = error instanceof Error ? error.message : String(error); }
    }
    rows.push(row);
  }
  const paths=files.directories??[];const root=paths[0]?.split('/')[0]??files[0]?.webkitRelativePath?.split('/')[0];
  const session:ImportSession={ rows, target, mode,...(root?{folder:{name:root.normalize('NFC'),directories:paths,emptyFoldersUnavailable:files.emptyFoldersUnavailable}}:{}) };
  if(session.folder)(await import('./folderImports')).folderPaths(session);
  return session;
}

