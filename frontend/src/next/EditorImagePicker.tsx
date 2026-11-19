import {useEffect,useRef,useState} from 'react';
import {open} from '@tauri-apps/plugin-dialog';
import {invoke} from '@tauri-apps/api/core';
import type {Editor} from '@tiptap/core';
import type {Node as ProseNode} from '@tiptap/pm/model';
import AppModal from '../components/modals/AppModal';
import {command,type Page,type Snapshot} from './client';
import {attachImages,commitImages,original} from './media';
import type {ImportTarget} from '../lib/importTarget';

export type ImagePickerRequest = {target: ImportTarget; replace?: ProseNode; files?: File[]};
type Entry={name:string;source:string|File;receipt?:{id:string;name:string};error?:string};

export default function EditorImagePicker({editor,request,close}:{editor:Editor; request:ImagePickerRequest; close:()=>void}) {
  const [query,setQuery]=useState(''),[page,setPage]=useState<Page>(),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  const [entries,setEntries]=useState<Entry[]>(()=>request.files?.map(file=>({name:file.name,source:file}))??[]);
  const [progress,setProgress]=useState(''),[selection,setSelection]=useState<{id:string;title:string}>();
  const [preview,setPreview]=useState<{id:string;url:string}>();
  const cancelled=useRef(false);
  useEffect(()=>{
    if(!selection)return;
    let active=true,url='';
    void original(selection.id).then(result=>{
      if(!result.mime.startsWith('image/'))throw new Error('Unsupported raster format');
      if(active){url=URL.createObjectURL(new Blob([result.buffer],{type:result.mime}));setPreview({id:selection.id,url});}
    }).catch(error=>{if(active)setError(String(error));});
    return()=>{active=false;if(url)URL.revokeObjectURL(url);};
  },[selection]);
  useEffect(()=>{
    let current=true;
    const timer=setTimeout(()=>{
      void command<Page>({kind:'search',options:{query,content:false,collection:null,kind:'image',order:'title'},limit:50})
        .then(result=>{if(current)setPage(result);})
        .catch(error=>{if(current)setError(String(error));});
    },query?180:0);
    return()=>{current=false;clearTimeout(timer);};
  },[query]);

  const apply=async(load:()=>Promise<{id:string;name:string}[]>)=>{
    if(busy)return;
    setBusy(true);setError('');
    try {await commitImages(editor,load,request.target,request.replace);close();}
    catch(error){setError(String(error));}
    finally{setBusy(false);}
  };
  const chooseFiles=async()=>{
    setBusy(true);setError('');
    try{
      const picked=await open({multiple:!request.replace,filters:[{name:'Raster images',extensions:['png','jpg','jpeg','gif','webp']}]});
      if(!picked)return;
      const paths=Array.isArray(picked)?picked:[picked];
      if(paths.length>12)throw new Error('Choose up to 12 images.');
      setEntries(paths.map(path=>({name:path.split(/[\\/]/).at(-1)??'Image',source:path})));
    }catch(error){setError(String(error));}finally{setBusy(false);}
  };
  const prepare=async(index?:number)=>{
    if(busy||entries.length>12)return;
    setBusy(true);setError('');cancelled.current=false;
    let total=0;
    let workspace:string;
    try{workspace=(await command<Snapshot>({kind:'snapshot'})).path;}catch(error){setBusy(false);setError(String(error));return;}
    for(const [i,entry] of entries.entries()){
      if(cancelled.current||editor.isDestroyed)break;
      if(entry.receipt||index!==undefined&&i!==index)continue;
      setProgress('Preparing '+(i+1)+' of '+entries.length+' · '+entry.name);
      try{
        request.target.assertValid();
        const file=typeof entry.source==='string'
          ? new File([await invoke<ArrayBuffer>('selected_image',{path:entry.source})],entry.name)
          : entry.source;
        total+=file.size;
        if(total>60*1024*1024)throw new Error('This preparation is limited to 60 MiB.');
        if(cancelled.current)break;
        request.target.assertValid();
        const [receipt]=await attachImages([file],workspace);
        setEntries(rows=>rows.map((row,j)=>j===i?{...row,receipt,error:undefined}:row));
      }catch(error){setEntries(rows=>rows.map((row,j)=>j===i?{...row,error:String(error)}:row));}
    }
    setProgress('');setBusy(false);
  };
  return <AppModal open title={request.replace?'Replace image':'Add image'} onClose={()=>{if(!busy)close();}}>
    <div className="image-picker">
      <p className="browse-feedback">{request.replace?'Only this image placement changes.':'Images retain their original bytes.'}</p>
      <button disabled={busy} onClick={()=>void chooseFiles()}>Choose image files</button>
      {entries.length>0&&<section aria-label="Image batch">
        {entries.map((entry,index)=><div key={index}><span>{entry.name} · {entry.receipt?'Ready':entry.error?'Failed':'Waiting'}</span>
          {entry.error&&<><p role="status">{entry.error}</p><button disabled={busy} onClick={()=>void prepare(index)}>Retry</button></>}
        </div>)}
        {entries.length>12&&<p role="alert">Choose up to 12 images.</p>}
        <button disabled={busy||entries.length>12||entries.every(entry=>entry.receipt)} onClick={()=>void prepare()}>Prepare images</button>
        {progress&&<button onClick={()=>{cancelled.current=true;}}>Stop after current file</button>}
        <button disabled={busy||!entries.some(entry=>entry.receipt)} onClick={()=>void apply(async()=>entries.flatMap(entry=>entry.receipt?[entry.receipt]:[]))}>
          {request.replace?'Replace from batch':'Insert ready images'}
        </button>
        <p className="browse-feedback">Prepared copies stay in Library if you close this picker.</p>
      </section>}
      <input autoFocus type="search" aria-label="Find existing image" value={query} onChange={event=>setQuery(event.target.value)}/>
      {busy&&<p role="status">{progress||'Preparing images…'}</p>}
      {error&&<p role="alert">{error}</p>}
      <div className="image-picker-results">{page?.items.map(image=><button key={image.id} disabled={busy} onClick={()=>{setError('');setSelection({id:image.id,title:image.title});}}>{image.title}</button>)}
      {selection&&preview?.id===selection.id&&<div className="next-picker-image">
        <img src={preview.url} alt={selection.title}/>
        <button disabled={busy} onClick={()=>void apply(async()=>[{id:selection.id,name:selection.title}])}>{request.replace?'Replace with selected image':'Insert selected image'}</button>
      </div>}
      {page&&!page.items.length&&<p>No matching images.</p>}</div>
      {page?.next&&<p className="browse-feedback">Showing the first 50 matches. Refine the search to find more.</p>}
    </div>
  </AppModal>;
}
