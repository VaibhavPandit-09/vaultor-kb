import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import AppModal from '../components/modals/AppModal';
import {PreviewBoundary} from '../components/editor/LinkedPreviewBudget';
import {previewBudget} from '../components/editor/linkedPreviewLimits';
import {markdownLinkKind,revealMarkdownHeading} from '../lib/linked/linkNavigation';
import JourneyViewport from '../components/JourneyViewport';
import type {ReadingPosition} from '../lib/paneNavigation';
import {useEffect,useState,type MouseEvent} from 'react';
import {useEscapeLayer,ESCAPE_PRIORITIES} from '../lib/escape/escape';
import {FileText,Save,RefreshCw,X,PanelRight,MoreHorizontal} from 'lucide-react';
import NextEditor from './NextEditor';
import NoteOrientation from '../components/NoteOrientation';
import {linkedCommand} from './linked';
import type {LinkedDocument,LinkedRelationships} from './linkedTypes';
import type {SharedNoteDocuments} from '../lib/sharedNoteDocuments';
export default function LinkedPane({active=false,sessionId,doc,index,documents,status,error,busy,locked,changed,save,review,close,beside,follow,organize,openRelated,reload,liveRevision,focusWhenReady,focusHandled,leaveFocus,reading,animationMode='smooth'}:{active?:boolean;sessionId?:string;animationMode?:'smooth'|'snappy';reading?:{visitId:string;position:ReadingPosition;direction?:string;onPosition:(p:Partial<ReadingPosition>)=>void};doc:LinkedDocument;index:number;documents:SharedNoteDocuments;status:string;error?:string;busy:boolean;locked:boolean;changed:(capture:()=>typeof doc.content)=>void;save:()=>void;review:()=>void;close:()=>void;beside:()=>void;organize?:(event:MouseEvent<HTMLElement>)=>void;openRelated?:(id:string)=>void;reload?:()=>void;liveRevision?:number;follow:(href:string,beside?:boolean)=>void;focusWhenReady:boolean;focusHandled:()=>void;leaveFocus:()=>void}){
 const [references,setReferences]=useState<LinkedRelationships>(),[referenceError,setReferenceError]=useState('');
 const loadReferences=()=>{setReferenceError('');void linkedCommand<LinkedRelationships>({op:'relationships',id:doc.documentId}).then(setReferences).catch(e=>setReferenceError(String(e)));};
 const [showSource,setShowSource]=useState(false);
 const [changedSource,setChangedSource]=useState('');
 const [asset,setAsset]=useState<{name:string;url:string}>();
 const [assetError,setAssetError]=useState('');
 const {documentId,revision,path}=doc;
 const canCheck=!!reload;
 useEffect(()=>{
   if(!canCheck||!active)return;
   let alive=true,checking=false;
   const check=async()=>{
     if(checking||document.hidden)return;
     checking=true;
     try{
       const current=await linkedCommand<{revision:string;path:string}>({op:'check',id:documentId});
       if(alive)setChangedSource(current.revision!==revision||current.path!==path?'The external file has changed.':'');
     }catch(e){if(alive)setChangedSource(String(e));}
     finally{checking=false;}
   };
   void check();
   const timer=setInterval(()=>void check(),15000);
   window.addEventListener('focus',check);
   return()=>{alive=false;clearInterval(timer);window.removeEventListener('focus',check);};
 },[canCheck,active,documentId,revision,path,liveRevision]);
 useEffect(()=>()=>{if(asset)URL.revokeObjectURL(asset.url);},[asset]);
 const previewAsset=async(href:string)=>{
   setAssetError('');
   try{
     const result=await linkedCommand<{name:string;mime:string;bytes:number[]}>({op:'asset',id:documentId,href});
     setAsset({name:result.name,url:URL.createObjectURL(new Blob([new Uint8Array(result.bytes)],{type:result.mime}))});
   }catch(e){setAssetError(String(e));}
 };
 const activateLink=(href:string,anchor:HTMLElement,beside?:boolean)=>{
   if(href.startsWith('#')){
     const preview=anchor.closest<HTMLElement>('[aria-label="Read-only Markdown preview"]');
     if(preview)revealMarkdownHeading(preview,href.slice(1));
   }else if(/\.(png|jpe?g|gif|webp)(?:#.*)?$/i.test(href))void previewAsset(href);
   else follow(href,beside);
 };
 const formatted=!doc.editable&&!doc.draft;
 const [sourceFocused,setSourceFocused]=useState(false);useEscapeLayer({active:sourceFocused,priority:ESCAPE_PRIORITIES.editorFocus,restoreFocusOnEscape:false,close:leaveFocus});
 return <section className="next-pane workspace-note-pane next-linked-pane" data-session-pane={sessionId} data-note-id={doc.id} aria-label={`Linked editor pane ${index+1}`}><JourneyViewport visitId={reading?.visitId??doc.id} initialPosition={reading?.position??{scrollTop:0,scrollLeft:0}} onPosition={p=>reading?.onPosition(p)} direction={reading?.direction} animationMode={animationMode}><NoteOrientation organizationLabel="External source" tagCount={0} identity={<div className="next-note-bar"><FileText size={15}/><input className="note-title" data-active={active} aria-label={`Linked Markdown title ${index+1}`} readOnly value={doc.title} title={doc.path}/><span role="status" title={status}>{status}</span><div className="next-note-actions">{organize&&<button aria-label="Organize linked Markdown" onClick={organize}><MoreHorizontal size={16}/></button>}<button aria-label="Save linked Markdown" title="Explicit Save · Ctrl+S inside this pane" disabled={busy||locked||!doc.editable} onClick={save}><Save size={16}/></button><button aria-label="Review or reload linked source" title="Review current source / reload" disabled={busy} onClick={review}><RefreshCw size={16}/></button><button aria-label="Open linked Markdown beside" disabled={busy} onClick={beside}><PanelRight size={16}/></button><button aria-label="Close linked Markdown" disabled={busy} onClick={close}><X size={16}/></button></div></div>}><div className="next-linked-state"><span title={doc.path}>External · {doc.path}</span><small>{doc.reason??'Explicit Save only · Follow a relative Markdown link'}</small></div></NoteOrientation>{openRelated&&!locked&&<details className="next-frontmatter" onToggle={event=>{if(event.currentTarget.open)loadReferences();}}><summary>Links and backlinks</summary>{referenceError&&<p role="alert">{referenceError}</p>}{references&&<><h3>Links</h3>{!references.outgoing.length&&<p>No indexed links.</p>}<ul>{references.outgoing.map(item=><li key={item.path}>{item.id?<button onClick={()=>openRelated(item.id!)}>{item.title}</button>:<span>{item.path} · Unavailable</span>} {item.occurrences>1&&<small>{item.occurrences} references</small>}</li>)}</ul><h3>Backlinks</h3>{!references.incoming.length&&<p>No indexed backlinks.</p>}<ul>{references.incoming.map(item=><li key={item.id}><button onClick={()=>openRelated(item.id)}>{item.title}</button> {item.occurrences>1&&<small>{item.occurrences} references</small>}</li>)}</ul></>}</details>}{error&&<div className="next-error" role="alert">{error}<button onClick={review}>Review source and draft</button></div>}{doc.frontmatter&&<details className="next-frontmatter"><summary>Frontmatter · preserved</summary><pre>{doc.frontmatter}</pre></details>}{changedSource&&<div className="next-linked-state" role="status">{changedSource}<button onClick={status==='source unchanged'?reload:review}>{status==='source unchanged'?'Reload source':'Review protected draft'}</button></div>}
 {assetError&&<p role="alert">{assetError}</p>}
 {formatted&&<div className="next-linked-state"><button aria-pressed={showSource} onClick={()=>setShowSource(value=>!value)}>{showSource?'View formatted':'View source'}</button></div>}
 {formatted?(showSource?<pre onFocus={()=>setSourceFocused(true)} onBlur={()=>setSourceFocused(false)} tabIndex={0} className="next-source-preview" aria-label="Read-only Markdown source">{doc.base}</pre>:<PreviewBoundary key={doc.revision} source={doc.base}><div className="prose prose-slate dark:prose-invert max-w-none next-source-preview" aria-label="Read-only Markdown preview"><ReactMarkdown remarkPlugins={[remarkGfm,previewBudget]} components={{
   img:({src,alt})=>src&&markdownLinkKind(doc.path,src)==='local'?<button type="button" onClick={()=>void previewAsset(src)}>{alt||'Preview linked image'}</button>:<span>{alt||'Linked image'}</span>,
   a:({href,children})=>href&&markdownLinkKind(doc.path,href)?<a href={href} className="markdown-link" onClick={event=>{event.preventDefault();activateLink(href,event.currentTarget,event.shiftKey);}}>{children}</a>:<span>{children}</span>,
 }}>{doc.base}</ReactMarkdown></div></PreviewBoundary>):<NextEditor initialSelection={reading?.position.selection} positionChanged={selection=>reading?.onPosition({selection})} note={{id:doc.id,title:doc.title,content:doc.content,revision:0}} pane={index} documents={documents} locked={locked||busy||!doc.editable} changed={changed} focusWhenReady={focusWhenReady} focusHandled={focusHandled} leaveFocus={leaveFocus} followLink={(href,beside)=>{if(/\.(png|jpe?g|gif|webp)(?:#.*)?$/i.test(href)&&!/^https?:/i.test(href))void previewAsset(href);else follow(href,beside);}}/>}
 <AppModal open={!!asset&&!locked} title={asset?.name??'Linked image'} onClose={()=>setAsset(undefined)}>{asset&&<img className="max-h-[70vh] max-w-full object-contain" src={asset.url} alt={asset.name}/>}</AppModal></JourneyViewport></section>;
}
