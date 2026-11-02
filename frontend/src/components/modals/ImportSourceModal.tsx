import {useState} from 'react';
import {FilePlus2,FolderOpen,Upload} from 'lucide-react';
import AppModal from './AppModal';

export default function ImportSourceModal({pending,error,onBrowse,onDrop,onClose}:{pending:boolean;error:string;onBrowse:(folder:boolean)=>void;onDrop:(files:File[])=>void;onClose:()=>void}){
 const [dropError,setDropError]=useState('');
 return <AppModal open title="Import" widthClassName="max-w-md" onClose={()=>{if(!pending)onClose();}}>
  <div className="import-acquisition" aria-busy={pending} onDragOver={event=>{if(event.dataTransfer.types.includes('Files')){event.preventDefault();event.dataTransfer.dropEffect=pending?'none':'copy';}}} onDrop={event=>{event.preventDefault();if(pending)return;setDropError('');if(!window.vaultorDesktop?.dropFiles&&Array.from(event.dataTransfer.items).some(item=>item.webkitGetAsEntry?.()?.isDirectory)){setDropError('Use Browse folder in this browser to preserve folder paths.');return;}onDrop(Array.from(event.dataTransfer.files));}}>
   <Upload size={22} aria-hidden="true"/>
   <p>Drop files or folders here, or browse.</p>
   <div className="flex flex-wrap gap-2"><button className="library-button" disabled={pending} onClick={()=>onBrowse(false)}><FilePlus2 size={16}/>Browse files</button><button className="library-button" disabled={pending} onClick={()=>onBrowse(true)}><FolderOpen size={16}/>Browse folder</button></div>
   <p className="browse-feedback">Imports create independent Vaultor resources. To keep editing external originals, use Linked sources → Link folder.</p>
   {pending&&<p role="status">Preparing import…</p>}{(error||dropError)&&<p role="alert">{error||dropError}</p>}
  </div>
 </AppModal>;
}
