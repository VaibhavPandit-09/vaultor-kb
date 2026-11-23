import ImagePreviewCanvas from '../components/ImagePreviewCanvas';
/* eslint-disable react-refresh/only-export-components -- Tiptap adapter owns the node view. */
import {lazy,Suspense,useEffect,useState} from 'react';
import {ReactNodeViewRenderer} from '@tiptap/react';
import {ManagedImage} from '../components/editor/ManagedImageDefinition';
import {createImagePlacement} from '../components/editor/ManagedImage';
import {copyImage} from '../lib/noteImages';
import {original,native,media} from './media';
import {showTransfer} from './transfers';
import PlaybackPreview from './PlaybackPreview';
const PdfPreview=lazy(()=>import('./PdfPreview'));
const raster=/\.(png|jpe?g|gif|webp)$/i;
const textFile=/\.(txt|md|markdown|csv|tsv|json|xml|yaml|log|js|ts|rs|py|java)$/i;
const video=/\.(mp4|webm)$/i;
const audio=/\.(wav|mp3|ogg|opus|flac|m4a)$/i;
export function FileView({id,workspace}:{id:string;workspace?:string}){return <FileContent key={JSON.stringify([workspace,id])} id={id} workspace={workspace}/>;}
function FileContent({id,workspace}:{id:string;workspace?:string}){
  const [info,setInfo]=useState<{name:string;bytes:number}>(),[url,setUrl]=useState(''),[text,setText]=useState<string>(),[error,setError]=useState('');
  const [loading,setLoading]=useState(true);
  useEffect(()=>{
    const signal=new AbortController();
    let loaded:{release:()=>void}|undefined;
    void media<{name:string;bytes:number}>({op:'info',id},workspace).then(async metadata=>{
      if(signal.signal.aborted)return;
      setInfo(metadata);
      if(raster.test(metadata.name)){
        const image=await loadManagedImage(id,signal.signal,workspace);
        if(signal.signal.aborted){image.release();return;}
        loaded=image;setUrl(image.url);
      }else if(textFile.test(metadata.name)){
        if(metadata.bytes>1024*1024)throw new Error('Text preview is limited to 1 MiB.');
        const {buffer}=await original(id,workspace);
        if(!signal.signal.aborted)setText(new TextDecoder('utf-8',{fatal:true}).decode(buffer));
      }
    }).catch(error=>{if(!signal.signal.aborted)setError(String(error));})
      .finally(()=>{if(!signal.signal.aborted)setLoading(false);});
    return()=>{signal.abort();loaded?.release();};
  },[id,workspace]);
  const run=(action:string)=>void native(action,id).then(setError).catch(error=>setError(String(error)));
  const pdf=!!info&&/\.pdf$/i.test(info.name);
  const inlineMedia=!!info&&(video.test(info.name)||audio.test(info.name));
  return <section className="next-file-view">
    {info&&<small>{info.name} · {info.bytes.toLocaleString()} bytes</small>}
    <div className="next-file-actions">
      <button className="library-button" disabled={!info} onClick={()=>run('open')}>Open external copy</button>
      <button className="library-button" disabled={!info} onClick={()=>run('reveal')}>Reveal prepared copy</button>
      <button className="library-button" disabled={!info} onClick={()=>run('copyPath')}>Copy prepared file path</button>
      <button className="library-button" disabled={!info} onClick={()=>showTransfer({op:'export',ids:[id]})}>Export original…</button>
      {url&&<button className="library-button" onClick={()=>void copyImage(id,loadManagedImage).catch(error=>setError(String(error)))}>Copy image</button>}
    </div>
    {loading&&<p role="status">Loading preview…</p>}
    {url&&<ImagePreviewCanvas url={url} title={info?.name??'Image'}/>}
    {text!==undefined&&<pre>{text}</pre>}
    {pdf&&<Suspense fallback={<p role="status">Loading PDF viewer…</p>}><PdfPreview id={id} workspace={workspace}/></Suspense>}
    {inlineMedia&&<PlaybackPreview id={id} workspace={workspace} video={video.test(info.name)}/>}
    {!loading&&!error&&!url&&text===undefined&&!pdf&&!inlineMedia&&<p>No inline preview for this format. Reveal or export an independent copy.</p>}
    {error&&<p role="status">{error}</p>}
  </section>;
}
async function loadManagedImage(id:string,signal:AbortSignal,workspace?:string){
 const result=await original(id,workspace);
 signal.throwIfAborted();
 if(!result.mime.startsWith('image/'))throw new Error('This resource is not a supported raster image.');
 const url=URL.createObjectURL(new Blob([result.buffer],{type:result.mime}));
 return {url,release:()=>URL.revokeObjectURL(url)};
}
const NextImagePlacement=createImagePlacement({
 load:loadManagedImage, unloadOffscreen:true,
 copy:id=>copyImage(id,loadManagedImage),
 download:async id=>showTransfer({op:'export',ids:[id]}),
 usedIn:async(id,editor)=>{const rows=await media<{id:string;title:string}[]>({op:'backlinks',id});if(!editor.isDestroyed)editor.view.dom.dispatchEvent(new CustomEvent('vaultor:image-usage',{detail:rows}));},
});
export const NextImage=ManagedImage.extend({addNodeView(){return ReactNodeViewRenderer(NextImagePlacement);},addProseMirrorPlugins(){return [];}});
