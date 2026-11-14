import {useRef} from 'react';
import {createPortal} from 'react-dom';
import {X,FileText} from 'lucide-react';
import PreviewShell from '../components/PreviewShell';
import {DialogFocusContext,useDialogFocus} from '../lib/dialogFocus';
import {useEscapeLayer,ESCAPE_PRIORITIES} from '../lib/escape/escape';
import {FileView} from './MediaView';
export default function FilePreview({id,title,opacity,close}:{id:string;title:string;opacity:number;close:()=>void}){
 const root=useRef<HTMLDivElement>(null),{scope,onKeyDown}=useDialogFocus(root);
 useEscapeLayer({active:true,priority:ESCAPE_PRIORITIES.preview,close,restoreFocusOnEscape:false});
 return createPortal(<div ref={root} onKeyDown={onKeyDown}><DialogFocusContext value={scope}><PreviewShell mode="modal" transparency={opacity} label={title} resourceId={id} onClose={close}><div className="preview-heading"><div className="preview-identity"><FileText size={16}/><h3>{title}</h3></div><div className="preview-actions"><button aria-label="Close file preview" onClick={close}><X size={18}/></button></div></div><div className="next-file-preview-content flex-1 min-h-0 p-4"><FileView id={id}/></div></PreviewShell></DialogFocusContext></div>,document.body);
}
