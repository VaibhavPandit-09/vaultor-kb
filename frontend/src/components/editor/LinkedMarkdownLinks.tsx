import {useEffect,useRef,useState,type ReactNode,type MouseEvent,type KeyboardEvent} from 'react';
import type {LinkedTarget} from '../../lib/linked/types';
import {markdownLinkKind,revealMarkdownHeading} from '../../lib/linked/linkNavigation';
import {linkedError} from '../../lib/linked/errors';
import AppModal from '../modals/AppModal';

/** Links keep their source URLs; single click and focused Enter use the same authorized activation. */
export default function LinkedMarkdownLinks({documentId,relative,resolve,onNavigate,onError,children}:{documentId:string;relative:string;resolve:(href:string)=>Promise<LinkedTarget>;onNavigate?:(id:string,newPane:boolean,fragment:string)=>Promise<void>;onError:(error:string)=>void;children:ReactNode}){
  const root=useRef<HTMLDivElement>(null),active=useRef(true);
  const [asset,setAsset]=useState<{url:string;name:string;mime:string}>();
  useEffect(()=>{active.current=true;return()=>{active.current=false;};},[]);
  useEffect(()=>()=>{if(asset)URL.revokeObjectURL(asset.url);},[asset]);
  const follow=async(href:string,newPane:boolean)=>{
    try{const target=await resolve(href);if(!active.current)return;
      if(target.kind==='document'){await onNavigate?.(target.id,newPane,target.fragment);if(active.current&&!newPane&&target.id===documentId&&target.fragment&&root.current)revealMarkdownHeading(root.current,target.fragment);}
      else setAsset({url:URL.createObjectURL(new Blob([new Uint8Array(target.bytes).buffer],{type:target.mime})),mime:target.mime,name:target.name});
    }catch(error){if(active.current)onError(linkedError(error));}
  };
  const activate=(event:MouseEvent<HTMLDivElement>|KeyboardEvent<HTMLDivElement>)=>{
    const anchor=event.target instanceof Element?event.target.closest<HTMLAnchorElement>('a[href]'):null;
    if(!anchor||!event.currentTarget.contains(anchor))return;
    if('key' in event&&event.key!=='Enter')return;
    event.preventDefault();event.stopPropagation();
    if('key' in event&&event.repeat)return;
    const href=anchor.getAttribute('href')??'',kind=markdownLinkKind(relative,href);
    if(kind==='external')window.open(href,'_blank','noopener,noreferrer');
    else if(kind==='local')void follow(href,event.shiftKey);
    else onError('This link is outside the supported source or URL policy. The document is unchanged.');
  };
  return <div ref={root} onClickCapture={activate} onKeyDownCapture={activate}>{children}
    <AppModal open={!!asset} title={asset?.name??'Linked attachment'} description="Read-only preview from the authorized source." onClose={()=>setAsset(undefined)}>{asset?.mime.startsWith('image/')?<img className="max-h-[70vh] max-w-full object-contain" src={asset.url} alt={asset.name}/>:asset?<iframe sandbox="" title={asset.name} src={asset.url} className="h-[60vh] w-full"/>:null}</AppModal>
  </div>;
}
