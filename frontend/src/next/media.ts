import {invoke} from '@tauri-apps/api/core';
import {command,type Summary} from './client';
import {captureImportTarget,type ImportTarget} from '../lib/importTarget';
import type {Editor} from '@tiptap/core';
export const media=<T,>(request:Record<string,unknown>,workspace?:string)=>command<T>({kind:'media',request,workspace});
export const native=(action:string,id:string|null=null,text:string|null=null,receipt?:string)=>invoke<string>('native_resource',{action,id,text,receipt});
const pending=new Set<Promise<unknown>>();
export async function flushAttachments(){await Promise.all([...pending]);}
export function commitImages(editor:Editor,load:()=>Promise<{id:string;name:string}[]>,anchor?:ImportTarget,replace?:NonNullable<ReturnType<Editor['state']['doc']['nodeAt']>>){
 const target=anchor??captureImportTarget(editor,editor.state.selection);
 return runAttachment(async()=>{
  target.assertValid();
  const images=await load();
  if(!images.length)return;
  if(replace){target.replaceNode(replace,{resourceId:images[0].id});return;}
  target.insert(images.map(image=>({type:'image',attrs:{resourceId:image.id,width:100,alignment:'center',alt:image.name,caption:''}})));
 }).finally(()=>{if(!anchor)target.dispose();});
}
async function runAttachment(work:()=>Promise<void>){
 if(pending.size)throw Error('Finish the current image insertion first');
 const job=work();pending.add(job);
 try{await job;}finally{pending.delete(job);}
}
export async function attachImages(files:File[],workspace?:string){
 if(files.length>12||files.reduce((bytes,file)=>bytes+file.size,0)>60*1024*1024)throw Error('Choose up to 12 images totaling 60 MiB');
 const images:{id:string;name:string}[]=[];
 for(const file of files){
  if(file.size>20*1024*1024)throw Error('Each image must be at most 20 MiB');
  const bytes=await file.arrayBuffer();
  images.push(await invoke<{id:string;name:string}>('attachment',bytes,{headers:{'x-file-name':encodeURIComponent(file.name),...(workspace?{'x-workspace':encodeURIComponent(workspace)}:{})}}));
 }
 return images;
}
export function insertImages(editor:Editor,files:File[]){return commitImages(editor,()=>attachImages(files));}
export async function original(id:string,workspace?:string){const buffer=await invoke<ArrayBuffer>('resource_bytes',{id,workspace});const bytes=new Uint8Array(buffer);const mime=bytes[0]===137&&bytes[1]===80?'image/png':bytes[0]===255&&bytes[1]===216?'image/jpeg':bytes[0]===71&&bytes[1]===73?'image/gif':String.fromCharCode(...bytes.subarray(0,4))==='RIFF'&&String.fromCharCode(...bytes.subarray(8,12))==='WEBP'?'image/webp':'text/plain';return {buffer,mime};}
export async function copyResources(ids:string[],mode:'copy'|'cut'|'links',collection:string|null,workspace?:string){
 if(!workspace)throw Error('Open the source workspace before copying resources');
 const {receipt,text}=await media<{receipt:string;text:string}>({op:'copy',ids,mode,collection},workspace);
 await native('clipboardWriteResource',null,text,receipt);
}
export async function pasteResources(collection:string|null,workspace?:string){
 if(!collection||!workspace)throw Error('Choose a destination collection');
 const receipt=await native('clipboardReadResource');
 if(!receipt)throw Error('Copy resources in Vaultor before pasting into a collection');
 return media({op:'paste',receipt,collection},workspace);
}
export function pasteLinks(editor:Editor,event:ClipboardEvent,workspace?:string){
 const marker=/data-vaultor-clipboard=["']([a-f0-9-]{36})["']/i.exec(event.clipboardData?.getData('text/html')??'')?.[1];
 if(!workspace||!marker)return false;
 event.preventDefault();
 const target=captureImportTarget(editor,editor.state.selection);
 void (async()=>{
  const receipt=await native('clipboardReadResource');
  if(receipt!==marker)throw Error('Resource clipboard changed. Copy the resources again.');
  const data=await media<{mode:string;resources:Pick<Summary,'id'|'title'|'kind'>[]}>({op:'clipboard',receipt},workspace);
  if(data.mode==='cut')throw Error('Paste cut memberships into a collection. Use Copy links to insert a note link.');
  target.insert(data.resources.map(r=>({type:'resourceLink',attrs:{resourceId:r.id,label:r.title,type:r.kind==='file'?'file' as const:'note' as const}})));
 })().catch(error=>{
  if(!editor.isDestroyed)editor.view.dom.dispatchEvent(new CustomEvent('vaultor-next-editor-error',{detail:String(error)}));
 }).finally(target.dispose);
 return true;
}
export const findResources=async(query:string)=>(await command<{items:Summary[]}>({kind:'search',options:{query,content:false,collection:null,order:'title'},limit:30})).items.map(r=>({id:r.id,title:r.title,type:r.kind==='file'?'file' as const:'note' as const,virtual:false}));
