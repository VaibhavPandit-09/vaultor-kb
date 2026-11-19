import {useCallback,useContext,useEffect,useLayoutEffect,useRef,useState} from 'react';
import {createPortal,flushSync} from 'react-dom';
import type {Editor} from '@tiptap/core';
import {TextSelection} from '@tiptap/pm/state';
import EditorImagePicker,{type ImagePickerRequest} from './EditorImagePicker';
import {Bold,Italic,Underline,Strikethrough,Code,Link,Image,Undo,Redo,MoreHorizontal} from 'lucide-react';
import LibraryPopover from '../components/LibraryPopover';
import type {TableOutput} from '../components/editor/TableDataPanel';
import {prepareEditorFile,type EditorFileReview} from './editorImport';
import TableControls from '../components/editor/TableControls';
import SlashMenu,{getFilteredSlashItems} from '../components/editor/SlashMenu';
import {slashCommandPluginKey,type SlashCommandState} from '../components/editor/SlashCommandExtension';
import {resourceLinkPluginKey,type ResourceLinkState,activateResourceLinkSuggestion} from '../components/editor/ResourceLinkDefinition';
import ResourceLinkMenu from '../components/editor/ResourceLinkMenu';
import {registerResourceLinkNavigator} from '../lib/resourceLinkNavigation';
import {useEscapeLayer,ESCAPE_PRIORITIES,PopoverPriorityContext} from '../lib/escape/escape';
import {command,type Note} from './client';
import {findResources,media,native} from './media';
import {captureImportTarget} from '../lib/importTarget';
import {invoke} from '@tauri-apps/api/core';
import {showTransfer} from './transfers';
import AppModal from '../components/modals/AppModal';
import type {RefObject} from 'react';
const noop=()=>{};
const tableOutput:TableOutput={copy:text=>native('clipboardWrite',null,text),saveCsv:async(text,scope)=>await invoke<boolean>('save_table_csv',{text,visible:scope==='visible'})?'saved':'cancelled'};
const service={upload:true,search:findResources,create:async(title:string)=>{const note=await command<Note>({kind:'createNote',title,collection:null});return {id:note.id,title:note.title,type:'note' as const,virtual:false};}};
export default function EditorControls({active,editor,container,noteId,openResource,saveStatus,retrySave,managed=true}:{active:boolean;managed?:boolean;retrySave?:()=>void;saveStatus:'saved'|'saving'|'failed';editor:Editor;container:RefObject<HTMLDivElement|null>;noteId:string;openResource?:(id:string,beside?:boolean)=>void}){
 const [slash,setSlash]=useState<SlashCommandState|null>(null),[resource,setResource]=useState<ResourceLinkState|null>(null),[selected,setSelected]=useState(0),[position,setPosition]=useState({left:0,top:0}),[format,setFormat]=useState(false),[error,setError]=useState(''),[backlinks,setBacklinks]=useState<{id:string;title:string}[]>([]);const selectedRef=useRef(0),count=useRef(0);
 const [fileReview,setFileReview]=useState<EditorFileReview>(),[readingFile,setReadingFile]=useState(false);
 useEffect(()=>()=>{fileReview?.target.dispose();},[fileReview]);
 const importFile=(format:'table'|'markdown')=>(editor:Editor,range:{from:number;to:number})=>{
   if(readingFile||fileReview)return;
   setError('');setReadingFile(true);
   void prepareEditorFile(editor,range,format).then(review=>{
     if(review&&editor.isDestroyed)review.target.dispose();
     else if(review)setFileReview(review);
   }).catch(error=>{if(!editor.isDestroyed)setError(String(error));}).finally(()=>setReadingFile(false));
 };
 const closeFileReview=()=>{setFileReview(undefined);editor.commands.focus();};
 const insertReviewedFile=()=>{
   if(!fileReview)return;
   try{fileReview.target.insert(fileReview.content,8*1024*1024);closeFileReview();}
   catch(error){setError(String(error));closeFileReview();}
 };
 const uploadMd=importFile('markdown'),uploadCsv=importFile('table');
 const [imageUsage,setImageUsage]=useState<{id:string;title:string}[]>();
 useEffect(()=>{
   const listener=(event:Event)=>setImageUsage((event as CustomEvent<{id:string;title:string}[]>).detail);
   editor.view.dom.addEventListener('vaultor:image-usage',listener);
   return()=>editor.view.dom.removeEventListener('vaultor:image-usage',listener);
 },[editor]);
 const importResource=(editor:Editor,range:{from:number;to:number})=>{
   const anchor=captureImportTarget(editor,range);
   showTransfer({op:'files',editorImport:(id,failure)=>{
     if(!id){anchor.dispose();if(failure&&!editor.isDestroyed)setError(failure);return;}
     void media<{id:string;title:string;kind:string}[]>({op:'summaries',ids:[id]}).then(rows=>{
       const resource=rows[0];
       if(!resource)throw new Error('The imported resource is unavailable');
       anchor.insert([{type:'resourceLink',attrs:{resourceId:id,label:resource.title,type:resource.kind??'file'}}]);
       editor.commands.focus();
     }).catch(error=>{if(!editor.isDestroyed)setError(String(error));}).finally(anchor.dispose);
   }});
 };
 const slot=useRef<HTMLDivElement>(null);
 const popupPriority=useContext(PopoverPriorityContext);
 const [toolbarHost,setToolbarHost]=useState<HTMLElement|null>(null);
 // The existing note header owns the disclosure; only the controls move, never the editor.
 // eslint-disable-next-line react-hooks/set-state-in-effect -- synchronize an optional mounted header portal target.
 useLayoutEffect(()=>{const bar=slot.current?.closest('.next-document,.journey-viewport')?.querySelector<HTMLElement>('.next-note-bar');setToolbarHost(bar?.querySelector<HTMLElement>('.next-note-actions')??bar??null);},[container]);
 const dismissedSelection=useRef('');
 useEscapeLayer({active:format,priority:ESCAPE_PRIORITIES.popover-1,close:()=>{dismissedSelection.current=editor.state.selection.from+':'+editor.state.selection.to;setFormat(false);editor.view.focus();},restoreFocusOnEscape:false});
 const [formatOffset,setFormatOffset]=useState({x:0,y:0});
 const lastQuery=useRef('');
 const [,setFormatting]=useState('');
 const updateCount=useCallback((n:number)=>{count.current=n;},[]);
 const close=()=>{editor.view.dispatch(editor.state.tr.setMeta(slashCommandPluginKey,{active:false,range:null,query:'',navigateDirection:null}).setMeta(resourceLinkPluginKey,{active:false,range:null,query:''}));setSlash(null);setResource(null);editor.view.focus();};
 useEscapeLayer({active:!!slash||!!resource,priority:350,close,restoreFocusOnEscape:false});
 useEffect(()=>{const update=()=>{const s=slashCommandPluginKey.getState(editor.state)as SlashCommandState,r=resourceLinkPluginKey.getState(editor.state)as ResourceLinkState;const active=s?.active||r?.active;const key=(s?.active?'slash:'+s.query:r?.active?'link:'+r.query:'');if(lastQuery.current!==key){lastQuery.current=key;selectedRef.current=0;setSelected(0);}
 if(s?.navigateDirection){selectedRef.current=(selectedRef.current+(s.navigateDirection==='down'?1:-1)+Math.max(count.current,1))%Math.max(count.current,1);setSelected(selectedRef.current);editor.view.dispatch(editor.state.tr.setMeta(slashCommandPluginKey,{navigateDirection:null}));return;}
 setSlash(old=>s?.active?s:old?null:old);setResource(old=>r?.active?r:old?null:old);if(!active){const selectionKey=editor.state.selection.from+':'+editor.state.selection.to;if(dismissedSelection.current&&dismissedSelection.current!==selectionKey)dismissedSelection.current='';const selected=editor.state.selection instanceof TextSelection&&!editor.state.selection.empty&&!editor.isActive('codeBlock')&&editor.isFocused;setFormat(selected&&dismissedSelection.current!==editor.state.selection.from+':'+editor.state.selection.to);setFormatting(['bold','italic','underline','strike','code','highlight'].map(mark=>editor.isActive(mark)?'1':'0').join(''));return;}if(s?.active)count.current=getFilteredSlashItems(s.query,noop,noop).length;const c=editor.view.coordsAtPos(editor.state.selection.from);setPosition({left:Math.max(8,Math.min(innerWidth-300,c.left)),top:Math.max(8,Math.min(innerHeight-340,c.bottom+6))});};
 editor.on('transaction',update);return()=>{editor.off('transaction',update);};},[editor]);
 useEffect(()=>managed?registerResourceLinkNavigator(editor.view,direction=>{selectedRef.current=(selectedRef.current+(direction==='down'?1:-1)+Math.max(count.current,1))%Math.max(count.current,1);setSelected(selectedRef.current);}):undefined,[editor,managed]);
 useEffect(()=>{if(!managed)return;const map=window.__slashCommandExecutors??new Map<object,()=>void>();window.__slashCommandExecutors=map;map.set(editor.view,()=>{const current=slashCommandPluginKey.getState(editor.state)as SlashCommandState;const item=getFilteredSlashItems(current.query,uploadMd,uploadCsv)[selectedRef.current];if(item&&current.range){const range={...current.range};if(!item.keepOpen)flushSync(close);item.action(editor,range);}});window.__executeSlashCommand=view=>{if(view)map.get(view as object)?.();};return()=>{map.delete(editor.view);if(!map.size){delete window.__executeSlashCommand;delete window.__slashCommandExecutors;}};});
 const [imagePicker,setImagePicker]=useState<ImagePickerRequest>();
 useEffect(()=>()=>{imagePicker?.target.dispose();},[imagePicker]);
 useEffect(()=>{
   if(!managed)return;
   const listener=(event:Event)=>{
     if(!editor.isEditable)return;
     const detail=(event as CustomEvent<{position?:number;replaceId?:string}>).detail;
     const position=detail?.position;
     const replace=position!==undefined?editor.state.doc.nodeAt(position):null;
     if(detail?.replaceId&&(position===undefined||replace?.type.name!=='image'||replace.attrs.resourceId!==detail.replaceId)){
       setError('The selected image changed. Select it again.');return;
     }
     const range=position===undefined?editor.state.selection:{from:position,to:position};
     setImagePicker({target:captureImportTarget(editor,range),replace:replace??undefined});
   };
   editor.view.dom.addEventListener('vaultor:image-picker',listener);
   return()=>editor.view.dom.removeEventListener('vaultor:image-picker',listener);
 },[editor,managed]);
 useLayoutEffect(()=>{if(!format)return;let frame=0;const place=()=>{frame=0;const anchor=slot.current,panel=anchor?.querySelector<HTMLElement>('.next-editor-tools'),viewport=anchor?.closest('.journey-viewport');if(!anchor||!panel||!viewport||editor.isDestroyed)return;const a=anchor.getBoundingClientRect(),v=viewport.getBoundingClientRect(),c=editor.view.coordsAtPos(editor.state.selection.from),scale=anchor.clientWidth?a.width/anchor.clientWidth:1,width=panel.offsetWidth*scale,height=panel.offsetHeight*scale;const left=Math.max(v.left+8,Math.min(v.right-width-8,c.left)),minTop=Math.max(8,v.top+8),maxTop=Math.min(innerHeight-8,v.bottom-8)-height;let top=c.top-height-8;if(top<minTop)top=c.bottom+8;top=Math.max(minTop,Math.min(maxTop,top));const x=(left-a.left)/(scale||1),y=(top-a.top)/(scale||1);setFormatOffset(old=>old.x===x&&old.y===y?old:{x,y});};const schedule=()=>{if(!frame)frame=requestAnimationFrame(place);};place();document.addEventListener('scroll',schedule,true);window.addEventListener('resize',schedule);const observer=new ResizeObserver(schedule);if(slot.current?.firstElementChild)observer.observe(slot.current.firstElementChild);return()=>{cancelAnimationFrame(frame);observer.disconnect();document.removeEventListener('scroll',schedule,true);window.removeEventListener('resize',schedule);};},[format,editor]);
 const run=(fn:()=>boolean)=>{fn();editor.view.focus();};
 const controls=<div style={format?{transform:`translate3d(${formatOffset.x}px,${formatOffset.y}px,0)`}:undefined} className="next-editor-tools" role="toolbar" aria-label="Note formatting" onMouseDown={e=>{if(!(e.target as Element).closest('input,select,textarea'))e.preventDefault();}} data-selection={format}><button title="Undo" aria-label="Undo" onClick={()=>run(()=>editor.commands.undo())}><Undo size={14}/></button><button title="Redo" aria-label="Redo" onClick={()=>run(()=>editor.commands.redo())}><Redo size={14}/></button>{[[Bold,'Bold','bold'],[Italic,'Italic','italic'],[Underline,'Underline','underline'],[Strikethrough,'Strike','strike'],[Code,'Inline code','code']].filter(([,label])=>managed||label!=='Underline').map(([Icon,label,mark])=>{const Glyph=Icon as typeof Bold;return <button key={String(mark)} title={String(label)+({Bold:' · Ctrl+B',Italic:' · Ctrl+I',Underline:' · Ctrl+U',Strike:' · Ctrl+Shift+X','Inline code':' · Ctrl+E'}[String(label)]??'')} aria-label={String(label)} aria-pressed={editor.isActive(String(mark))} onMouseDown={e=>e.preventDefault()} onClick={()=>run(()=>editor.chain().focus().toggleMark(String(mark)).run())}><Glyph size={14}/></button>;})}{managed&&<><button aria-label="Insert resource link" title="Resource link · [[" onMouseDown={e=>e.preventDefault()} onClick={()=>{editor.chain().focus().insertContent('[[').run();const from=editor.state.selection.from;activateResourceLinkSuggestion(editor.view,{from:from-2,to:from});}}><Link size={14}/></button><button aria-label="Insert image" title="Insert managed image" onClick={()=>editor.view.dom.dispatchEvent(new Event('vaultor:image-picker'))}><Image size={14}/></button></>}<LibraryPopover label="Block and link actions" trigger={<MoreHorizontal size={14}/>} menu>{close=> <>{([['Paragraph',()=>editor.commands.setParagraph()],['Heading 1',()=>editor.commands.toggleHeading({level:1})],['Heading 2',()=>editor.commands.toggleHeading({level:2})],['Heading 3',()=>editor.commands.toggleHeading({level:3})],['Heading 4',()=>editor.commands.toggleHeading({level:4})],['Heading 5',()=>editor.commands.toggleHeading({level:5})],['Heading 6',()=>editor.commands.toggleHeading({level:6})],['Bullet list',()=>editor.commands.toggleBulletList()],['Numbered list',()=>editor.commands.toggleOrderedList()],['Task list',()=>editor.commands.toggleTaskList()],['Quote',()=>editor.commands.toggleBlockquote()],['Divider',()=>editor.commands.setHorizontalRule()],['Table',()=>editor.commands.insertTable({rows:3,cols:3,withHeaderRow:true})],['Code block',()=>editor.commands.toggleCodeBlock()],['Highlight',()=>editor.commands.toggleHighlight()],['Clear formatting',()=>editor.commands.unsetAllMarks()],['Remove web link',()=>editor.commands.unsetLink()]]as const).filter(([label])=>managed||label!=='Highlight').map(([label,fn])=><button key={label} onClick={()=>{close();run(fn);}}>{label}</button>)}<form onSubmit={e=>{e.preventDefault();const data=new FormData(e.currentTarget),href=String(data.get('url'));if(!/^https?:\/\//i.test(href)&&!href.startsWith('#')){setError('Use https/http or a local heading anchor');return;}editor.chain().focus().extendMarkRange('link').setLink({href}).run();close();}}><input name="url" aria-label="Web link URL" placeholder="https://…" defaultValue={editor.getAttributes('link').href??''}/><button>Set web link</button></form></>}</LibraryPopover>{managed&&<LibraryPopover label="Backlinks" trigger={<span>Links</span>}>{()=> <div><button onClick={()=>void media<typeof backlinks>({op:'backlinks',id:noteId}).then(setBacklinks).catch(e=>setError(String(e)))}>Refresh backlinks</button>{backlinks.map(r=><button key={r.id} onClick={()=>openResource?.(r.id)}>{r.title}</button>)}</div>}</LibraryPopover>}</div>;
 const disclosure=<LibraryPopover label="Note formatting" trigger={<Bold size={15}/>} >{()=> <PopoverPriorityContext value={popupPriority+1}>{controls}</PopoverPriorityContext>}</LibraryPopover>;
 return <><div ref={slot} className="next-editor-toolbar-slot">{format?controls:toolbarHost?createPortal(disclosure,toolbarHost):disclosure}</div>
 {readingFile&&<p role="status">Reading editor file…</p>}
 {fileReview&&createPortal(<AppModal open title={fileReview.format==='table'?'Insert table':'Insert Markdown'} onClose={closeFileReview} footer={<><button onClick={closeFileReview}>Cancel</button><button onClick={insertReviewedFile}>Insert</button></>}>
   <p>{fileReview.format==='table'?fileReview.content[0].content?.length+' rows · '+fileReview.content[0].content?.[0].content?.length+' columns. The first row becomes headers.':fileReview.content.length+' editable blocks will be inserted.'}</p>
   <p>The selected file stays intact.</p>
 </AppModal>,document.body)}
 {imageUsage&&<AppModal open title="Image used in" onClose={()=>setImageUsage(undefined)}>{imageUsage.length?imageUsage.map(note=><button className="library-button" key={note.id} onClick={()=>{setImageUsage(undefined);openResource?.(note.id);}}>{note.title}</button>):<p>No saved notes use this image yet.</p>}</AppModal>}
 {imagePicker&&<EditorImagePicker editor={editor} request={imagePicker} close={()=>{setImagePicker(undefined);editor.commands.focus();}}/>}
 {managed&&<TableControls onRetrySave={retrySave} saveStatus={saveStatus} editor={editor} active={active&&editor.isEditable} containerRef={container} output={tableOutput}/>}
 {(slash?.range||resource?.range)&&createPortal(<div className="next-editor-suggestion" style={{position:'fixed',left:position.left,top:position.top,zIndex:4000}}>{slash?.range?<SlashMenu editor={editor} range={slash.range} query={slash.query} selectedIndex={selected} onClose={close} onUploadMd={uploadMd} onUploadCsv={uploadCsv}/>:resource?.range?<ResourceLinkMenu editor={editor} range={resource.range} query={resource.query} selectedIndex={selected} service={service} onClose={close} onUpdateFiltered={updateCount} onRequestFileUpload={importResource}/>:null}</div>,document.body)}{error&&<p role="alert">{error}</p>}</>;
}
