import ImagePreviewCanvas from '../components/ImagePreviewCanvas';
/* eslint-disable react-refresh/only-export-components -- Tiptap adapter owns the node view. */
import {useEffect,useState} from 'react';
import {ReactNodeViewRenderer} from '@tiptap/react';
import {ManagedImage} from '../components/editor/ManagedImageDefinition';
import {createImagePlacement} from '../components/editor/ManagedImage';
import {copyImage} from '../lib/noteImages';
import {original,native,media} from './media';
import {showTransfer} from './transfers';
export function FileView({id}:{id:string}){const [info,setInfo]=useState<{name:string;bytes:number}>(),[url,setUrl]=useState(''),[text,setText]=useState(''),[error,setError]=useState('');useEffect(()=>{let active=true,object='';void media<{name:string;bytes:number}>({op:'info',id}).then(async info=>{if(!active)return;setInfo(info);if(info.bytes>20*1024*1024||! /\.(png|jpe?g|gif|webp|txt|md|csv|json|log)$/i.test(info.name))return;const result=await original(id);if(!active)return;if(result.mime.startsWith('image/')){object=URL.createObjectURL(new Blob([result.buffer],{type:result.mime}));setUrl(object);}else if(/\.(txt|md|csv|json|log)$/i.test(info.name)&&info.bytes<=1048576)setText(new TextDecoder('utf-8',{fatal:true}).decode(result.buffer));}).catch(e=>{if(active)setError(String(e));});return()=>{active=false;if(object)URL.revokeObjectURL(object);};},[id]);const action=(name:string)=>void native(name,id).then(setError).catch(e=>setError(String(e)));return <section className="next-file-view"><small>{info?`Original: ${info.name} · ${info.bytes.toLocaleString()} bytes`:'Loading original metadata…'}</small><div className="next-file-actions"><button className="library-button" onClick={()=>action('open')}>Open external copy</button><button className="library-button" onClick={()=>action('reveal')}>Reveal prepared copy</button><button className="library-button" onClick={()=>showTransfer({op:'export',ids:[id]})}>Export original…</button></div>{url&&<><button className="library-button" onClick={()=>void copyImage(id,loadManagedImage).catch(e=>setError(String(e)))}>Copy image</button><ImagePreviewCanvas key={id} url={url} title={info?.name??'Image'}/></>} {text&&<pre>{text}</pre>}{!url&&!text&&<p>Read-only preview is available for raster images and UTF-8 text/Markdown. Use a prepared copy for other formats.</p>}{error&&<p role="status">{error}</p>}</section>;}
async function loadManagedImage(id:string,signal:AbortSignal){
 const result=await original(id);
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
