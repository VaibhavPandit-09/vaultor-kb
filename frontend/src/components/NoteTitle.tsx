import {useRef,useState} from 'react';
import {useEscapeLayer} from '../lib/escape/escape';
/** Original note-title display/edit states; document protection remains host-owned. */
export default function NoteTitle({value,change,label,disabled=false,readOnly=false}:{value:string;change:(value:string)=>void;label:string;disabled?:boolean;readOnly?:boolean}){
 const [editing,setEditing]=useState(false),original=useRef(value),button=useRef<HTMLButtonElement>(null);
 const leave=(cancel=false,focus=true)=>{if(cancel)change(original.current);setEditing(false);if(focus)requestAnimationFrame(()=>button.current?.focus({preventScroll:true}));};
 useEscapeLayer({active:editing,priority:300,close:()=>leave(true),restoreFocusOnEscape:false});
 return <div className="next-note-title">{editing?<input data-note-title autoFocus aria-label={label} value={value} maxLength={240} disabled={disabled} onChange={e=>change(e.target.value)} onBlur={()=>leave(false,false)} onKeyDown={e=>{if(e.nativeEvent.isComposing)return;if(e.key==='Enter'){e.preventDefault();leave();}}}/>:<button ref={button} type="button" data-note-title value={value} className="note-title" aria-label={label} title={readOnly?value:'Edit title · '+value} disabled={disabled||readOnly} onClick={()=>{original.current=value;setEditing(true);}}>{value||'Untitled note'}</button>}</div>;
}
