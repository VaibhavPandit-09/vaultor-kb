import {invoke} from '@tauri-apps/api/core';
import type {Editor, JSONContent, Range} from '@tiptap/core';
import {captureImportTarget,type ImportTarget} from '../lib/importTarget';
import {command,type Snapshot} from './client';

export type EditorFileReview = {
  target: ImportTarget;
  content: JSONContent[];
  format: 'table' | 'markdown';
  source?: {text:string;name:string;workspace:string};
  pasted?: string;
  warning?: string;
};

async function convert(source:string, format:EditorFileReview['format']) {
  if(new TextEncoder().encode(source).length>1024*1024)throw new Error('Conversion is limited to 1 MiB.');
  const worker=new Worker(new URL('./editorImport.worker.ts',import.meta.url),{type:'module'});
  try {
    return await new Promise<JSONContent[]>((resolve,reject)=>{
      worker.onmessage=({data}:MessageEvent<{content?:JSONContent[];error?:string}>)=>{
        if(data.content)resolve(data.content);
        else reject(new Error(data.error??'Could not read editor content'));
      };
      worker.onerror=()=>reject(new Error('The editor file parser could not finish'));
      worker.postMessage({format,source});
    });
  } finally {worker.terminate();}
}

export async function prepareEditorFile(editor:Editor,range:Range,format:EditorFileReview['format']):Promise<EditorFileReview|undefined>{
  const target=captureImportTarget(editor,range);
  let prepared=false;
  try {
    const {path:workspace}=await command<Snapshot>({kind:'snapshot'});
    const picked=await invoke<{text:string;name:string}|null>('pick_editor_text',{format});
    if(!picked)return;
    target.assertValid();
    const content=await convert(picked.text,format);
    target.assertValid();
    editor.schema.nodeFromJSON({type:'doc',content}).check();
    prepared=true;
    return {target,content,format,source:format==='table'?{...picked,workspace}:undefined};
  } finally {if(!prepared)target.dispose();}
}

export async function prepareMarkdownPaste(target:ImportTarget,text:string):Promise<EditorFileReview>{
  try {
    const content=await convert(text,'markdown');
    target.assertValid();
    target.editor.schema.nodeFromJSON({type:'doc',content}).check();
    return {target,content,format:'markdown',pasted:text};
  } catch(error){
    try {target.assertValid();}
    catch(invalid){target.dispose();throw invalid;}
    return {target,content:[],format:'markdown',pasted:text,warning:String(error)};
  }
}

export async function insertEditorReview(review:EditorFileReview,plain=false){
  const {target,source}=review;
  target.assertValid();
  if(plain&&review.pasted!==undefined){
    const content=review.pasted.split(/\r\n|\r|\n/).map(text=>({type:'paragraph',content:text?[{type:'text',text}]:[]}));
    target.insert(content,8*1024*1024);
    return;
  }
  let content=review.content;
  if(source){
    const bytes=new TextEncoder().encode(source.text);
    const resource=await invoke<{id:string;name:string}>('attachment',bytes.buffer,{headers:{
      'x-file-name':encodeURIComponent(source.name),'x-editor-table':'1','x-workspace':encodeURIComponent(source.workspace),
    }});
    content=content.map(node=>({...node,attrs:{...node.attrs,sourceResourceId:resource.id,sourceResourceTitle:resource.name,sourceResourceType:'file'}}));
  }
  target.insert(content,8*1024*1024);
}
