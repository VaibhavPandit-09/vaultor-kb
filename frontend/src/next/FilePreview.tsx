import {useLayoutEffect,useRef,useState,type ReactNode} from 'react';
import {createPortal} from 'react-dom';
import {X,FileText,Maximize2,PanelRight} from 'lucide-react';
import PreviewShell from '../components/PreviewShell';
import {DialogFocusContext,useDialogFocus} from '../lib/dialogFocus';
import {useEscapeLayer,ESCAPE_PRIORITIES} from '../lib/escape/escape';
import {FileView} from './MediaView';
export default function FilePreview({id,title,opacity,placement,workspace,close,reviewAction}:{id:string;title:string;opacity:number;placement:'floating'|'side';workspace?:string;close:()=>void;reviewAction?:ReactNode}){
 const root=useRef<HTMLDivElement>(null),{scope,onKeyDown}=useDialogFocus(root);
 const [expanded,setExpanded]=useState<boolean|null>(null);
 const mode=(expanded??placement==='floating')?'modal':'side';
 useLayoutEffect(()=>{root.current?.querySelector<HTMLElement>('[data-preview-close]')?.focus({preventScroll:true});},[id]);
 useEscapeLayer({active:true,priority:ESCAPE_PRIORITIES.preview,close,restoreFocusOnEscape:false});
 return createPortal(<div ref={root} className="next-resource-preview" onKeyDown={mode==='modal'?onKeyDown:undefined}>
   <DialogFocusContext value={mode==='modal'?scope:null}>
     <PreviewShell mode={mode} transparency={opacity} label={title} resourceId={id} onClose={close}>
       <div className="preview-heading">
         <div className="preview-identity"><FileText size={16}/><h3>{title}</h3></div>
         <div className="preview-actions">
           {reviewAction}
           <button aria-label={mode==='modal'?'Move preview to the side':'Expand file preview'} onClick={()=>setExpanded(mode==='side')}>{mode==='modal'?<PanelRight size={18}/>:<Maximize2 size={18}/>}</button>
           <button data-preview-close aria-label="Close file preview" onClick={close}><X size={18}/></button>
         </div>
       </div>
       <div className="next-file-preview-content flex-1 min-h-0 px-4"><FileView id={id} workspace={workspace}/></div>
     </PreviewShell>
   </DialogFocusContext>
 </div>,document.body);
}
