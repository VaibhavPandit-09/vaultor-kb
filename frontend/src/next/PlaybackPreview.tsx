import {useEffect,useRef,useState} from 'react';
import {invoke} from '@tauri-apps/api/core';
import {command,type Snapshot} from './client';

export default function PlaybackPreview({id,video,workspace}:{id:string;video:boolean;workspace?:string}){
  const element=useRef<HTMLMediaElement|null>(null);
  const [status,setStatus]=useState('Checking the managed original…');
  useEffect(()=>{
    const player=element.current;
    if(!player)return;
    let live=true,token:string|undefined;
    const release=(value:string)=>void invoke('close_media_preview',{token:value}).catch(()=>{});
    void (workspace?Promise.resolve({path:workspace}):command<Snapshot>({kind:'snapshot'})).then(({path:workspace})=>{
      if(live)return invoke<string>('open_media_preview',{id,workspace});
    }).then(value=>{
      if(!value)return;
      if(!live){release(value);return;}
      token=value;
      player.src='http://vaultor-preview.localhost/'+value;
      player.load();
    }).catch(error=>{if(live)setStatus(String(error));});
    const ready=()=>setStatus('');
    const failed=()=>setStatus('WebView2 could not play this container or codec. Open an external copy.');
    player.addEventListener('loadedmetadata',ready);
    player.addEventListener('error',failed);
    return()=>{
      live=false;
      player.removeEventListener('loadedmetadata',ready);
      player.removeEventListener('error',failed);
      player.pause();
      player.removeAttribute('src');
      player.load();
      if(token)release(token);
    };
  },[id,video,workspace]);
  return <div className="next-playback">
    {video?<video ref={node=>{element.current=node;}} controls preload="metadata" playsInline/>:
      <audio ref={node=>{element.current=node;}} controls preload="metadata"/>}
    {status&&<p role="status">{status}</p>}
  </div>;
}
