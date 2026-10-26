import {sourceWindow,SOURCE_PAGE_STEP} from '../../lib/linked/sourceWindow';
import {linkedError} from '../../lib/linked/errors';
import {Component,useState,useEffect,useSyncExternalStore,useCallback,useRef,useMemo,type ReactNode} from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {LIMITS} from '../../lib/markdown/limits';
import type {LinkedWorkspace} from '../../lib/linked/workspace';
import type {Opened} from '../../lib/linked/types';
const reasons:Record<string,string>={RECOVERY_VOLUME_UNAVAILABLE:'Safe saving requires an available, verified private recovery folder on this NTFS volume. Reconnect the drive or review its setup in Linked sources.',LARGE_DOCUMENT:'Rich-text editing supports documents up to 256 KiB. The original file remains unchanged.',ENCODING_UNSUPPORTED:'This encoding cannot be edited safely. The original bytes remain unchanged.',HARDLINKED_FILE:'This file has multiple hardlinks and is read-only.',SPECIAL_FILE:'This file has filesystem characteristics outside the supported editing contract.',DOCUMENT_SHAPE_LIMIT:'This document is too complex for safe rich-text editing. Its source remains intact.'};
// Rendering authority is independent of Save admission. Keep parsing/DOM bounded,
// never execute raw HTML or fetch untrusted Markdown images from the network.
function previewBudget(){return (tree:unknown)=>{
  type Node={children?:Node[]};const root=tree as Node,stack=[{node:root,depth:0}];let count=0;
  if((root.children?.length??0)>LIMITS.rootBlocks)throw Error('PREVIEW_COMPLEXITY_LIMIT');
  while(stack.length){const {node,depth}=stack.pop()!;if(++count>LIMITS.renderNodes||depth>LIMITS.depth)throw Error('PREVIEW_COMPLEXITY_LIMIT');for(const child of node.children??[])stack.push({node:child,depth:depth+1});}
};}
class PreviewBoundary extends Component<{source:string;children:ReactNode},{failed:boolean}>{
  state={failed:false};
  static getDerivedStateFromError(){return {failed:true};}
  render(){return this.state.failed?<><p className="browse-feedback">Formatted preview is unavailable for this document. Its source remains intact.</p><pre className="whitespace-pre-wrap break-words font-mono text-sm">{this.props.source}</pre></>:this.props.children;}
}
export default function LinkedReadonly({workspace,opened}:{workspace:LinkedWorkspace;opened:Opened}){
  useEffect(()=>workspace.previewMounted(opened.id),[workspace,opened.id]);
  useSyncExternalStore(workspace.subscribe,workspace.getSnapshot);const changed=workspace.previewStatus.get(opened.id);
  const [offset,setOffset]=useState(0),[text,setText]=useState(()=>new TextDecoder().decode(opened.bytes)),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  const [viewSource,setViewSource]=useState(false);
  const previewText=useMemo(()=>{if(opened.size>LIMITS.interactiveBytes||opened.bytes.byteLength!==opened.size)return null;try{return new TextDecoder('utf-8',{fatal:true}).decode(opened.bytes);}catch{return null;}},[opened.bytes,opened.size]);
  const page=useRef(0),generation=useRef(opened.binding);
  const load=useCallback(async(next:number)=>{const binding=opened.binding;setBusy(true);setError('');try{const bytes=await workspace.request<Uint8Array>('chunk',{document:opened.id,binding,offset:Math.max(0,next-4)});if(generation.current!==binding)return;setText(sourceWindow(bytes,Math.max(0,next-4)));setOffset(next);page.current=next;}catch(failure){if(generation.current===binding)setError(linkedError(failure));}finally{if(generation.current===binding)setBusy(false);}},[workspace,opened.id,opened.binding]);
  useEffect(()=>{generation.current=opened.binding;if(opened.size<=262144){setText(new TextDecoder().decode(opened.bytes));setOffset(0);page.current=0;}else void load(Math.min(page.current,Math.floor(Math.max(0,opened.size-1)/SOURCE_PAGE_STEP)*SOURCE_PAGE_STEP));return()=>{generation.current='';};},[load,opened.bytes,opened.size,opened.binding]); // preserve reading window across clean external refresh
  return <section className="px-5 py-3"><div className="flex flex-wrap items-center gap-3"><p className="browse-feedback min-w-0 flex-1">Linked · Read only. {reasons[opened.readonlyReason]??'Direct saving is unavailable for this file.'}</p>{previewText!==null&&<button className="library-button" aria-pressed={viewSource} onClick={()=>setViewSource(value=>!value)}>{viewSource?'View formatted':'View source'}</button>}</div>{changed&&changed!=='UNCHANGED'&&<p className="browse-feedback" role="status">{changed==='DOCUMENT_REPLACED'?'The file was replaced. Open the current entry from the linked folder to review it.':'The source changed or is unavailable. Reopen it when available; original bytes remain intact.'}</p>}{opened.size>262144&&<div className="flex items-center gap-3 text-sm"><button className="library-button" disabled={busy||offset===0} onClick={()=>void load(Math.max(0,offset-SOURCE_PAGE_STEP))}>Previous</button><span>Bytes {Math.max(0,offset-4).toLocaleString()}–{Math.min(Math.max(0,offset-4)+65536,opened.size).toLocaleString()} of {opened.size.toLocaleString()}</span><button className="library-button" disabled={busy||offset+SOURCE_PAGE_STEP>=opened.size} onClick={()=>void load(offset+SOURCE_PAGE_STEP)}>Next</button>{!text&&<button className="library-button" disabled={busy} onClick={()=>void load(0)}>Read source</button>}</div>}{error&&<p className="browse-feedback" role="alert">{error}</p>}{previewText!==null&&!viewSource?<PreviewBoundary key={opened.binding} source={previewText}><div className="prose prose-slate dark:prose-invert max-w-none" aria-label="Read-only Markdown preview"><ReactMarkdown remarkPlugins={[remarkGfm,previewBudget]} components={{img:({alt})=><span>{alt?`Image: ${alt}`:'Linked image'}</span>,a:({href,children})=>/^https?:\/\//i.test(href??'')?<a href={href} target="_blank" rel="noreferrer">{children}</a>:<span title={href}>{children}</span>}}>{previewText}</ReactMarkdown></div></PreviewBoundary>:<pre className="whitespace-pre-wrap break-words font-mono text-sm">{previewText??text}</pre>}</section>;
}
