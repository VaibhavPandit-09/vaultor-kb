import {useEffect,useState} from 'react';
import {open} from '@tauri-apps/plugin-dialog';
import {invoke} from '@tauri-apps/api/core';
import type {Editor} from '@tiptap/core';
import type {Node as ProseNode} from '@tiptap/pm/model';
import AppModal from '../components/modals/AppModal';
import {command,type Page} from './client';
import {attachImages,commitImages,original} from './media';
import type {ImportTarget} from '../lib/importTarget';

export type ImagePickerRequest = {target: ImportTarget; replace?: ProseNode};

export default function EditorImagePicker({editor,request,close}:{editor:Editor; request:ImagePickerRequest; close:()=>void}) {
  const [query,setQuery]=useState(''),[page,setPage]=useState<Page>(),[error,setError]=useState(''),[busy,setBusy]=useState(false);
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
  const files=()=>apply(async()=>{
    const picked=await open({multiple:!request.replace,filters:[{name:'Raster images',extensions:['png','jpg','jpeg','gif','webp']}]});
    if(!picked)return [];
    const paths=Array.isArray(picked)?picked:[picked];
    if(paths.length>12)throw new Error('Choose up to 12 images.');
    let total=0;
    const files:File[]=[];
    for(const path of paths){
      const bytes=await invoke<ArrayBuffer>('selected_image',{path});
      total+=bytes.byteLength;
      if(total>60*1024*1024)throw new Error('Choose images totaling at most 60 MiB.');
      files.push(new File([bytes],path.split(/[\\/]/).at(-1)??'Image'));
    }
    return attachImages(files);
  });
  return <AppModal open title={request.replace?'Replace image':'Add image'} onClose={()=>{if(!busy)close();}}>
    <div className="image-picker">
      <p className="browse-feedback">{request.replace?'Only this image placement changes.':'Images retain their original bytes.'}</p>
      <button disabled={busy} onClick={()=>void files()}>Choose image files</button>
      <input autoFocus type="search" aria-label="Find existing image" value={query} onChange={event=>setQuery(event.target.value)}/>
      {busy&&<p role="status">Preparing images…</p>}
      {error&&<p role="alert">{error}</p>}
      <div className="image-picker-results">{page?.items.map(image=><button key={image.id} disabled={busy} onClick={()=>void apply(async()=>{
        if(!(await original(image.id)).mime.startsWith('image/'))throw new Error('This resource is not a supported raster image.');
        return [{id:image.id,name:image.title}];
      })}>{image.title}</button>)}
      {page&&!page.items.length&&<p>No matching images.</p>}</div>
      {page?.next&&<p className="browse-feedback">Showing the first 50 matches. Refine the search to find more.</p>}
    </div>
  </AppModal>;
}
