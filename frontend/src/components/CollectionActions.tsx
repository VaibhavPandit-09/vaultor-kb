import {useContext,useState,useRef} from 'react';
import {FolderOpen,FilePlus2,FolderPlus,ClipboardPaste,Pin,Pencil,FolderInput,Settings2,Trash2,Upload} from 'lucide-react';
import type {OrganizationItem} from '../lib/organization';
import {commandScope,requireCommandScope} from '../lib/resourceBatchCommands';
import {getPlatform} from '../lib/platform';
import {pasteResources} from '../lib/resourceClipboard';
import {pinCollection} from '../lib/resourceBatchCommands';
import {CollectionCommandsContext} from '../lib/collectionCommands';
import {isMac} from '../lib/shortcuts';
import LibraryPopover from './LibraryPopover';
import {MenuAction,MenuSeparator} from './MenuAction';
import CollectionManagement from './CollectionManagement';
import CollectionDeletionDialog from './CollectionDeletionDialog';
import {CollectionPicker} from './ResourceCollections';
import {useRestoreFocusOnClose} from '../lib/useRestoreFocusOnClose';

/** Dashboard remains the owner of note creation/navigation and reviewed import acquisition. */

export default function CollectionActions({item,onOpen,contextTarget='.library-row',contextOnly=false}:{item:OrganizationItem;onOpen:(item:OrganizationItem)=>void;contextTarget?:string;contextOnly?:boolean}){
 const commands=useContext(CollectionCommandsContext),focus=useRestoreFocusOnClose(),[scope]=useState(commandScope);
 const [dialog,setDialog]=useState<'rename'|'move'|'manage'|'create'|'delete'|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const running=useRef(false);
 const work=async(task:()=>void|Promise<unknown>,close:()=>void)=>{if(running.current)return;running.current=true;setBusy(true);setError('');try{requireCommandScope(scope);await task();close();}catch(failure){setError(failure instanceof Error?failure.message:'Collection action failed.');}finally{running.current=false;setBusy(false);}};
 const done=()=>{setDialog(null);focus.restoreFocus();};
 return <><LibraryPopover contextTarget={contextTarget} contextOnly={contextOnly} label={'Actions for '+item.name} trigger="⋯" className="browse-icon-button">{close=>{
  const show=(next:typeof dialog)=>{requireCommandScope(scope);close();focus.captureFocus();setDialog(next);};
  return <><MenuAction icon={FolderOpen} disabled={busy} onClick={()=>void work(()=>onOpen(item),close)}>Open collection</MenuAction>
   {commands&&<MenuAction icon={FilePlus2} disabled={busy} onClick={()=>void work(()=>commands.newNote(item),close)}>New note here</MenuAction>}
   <MenuAction icon={FolderPlus} disabled={busy} onClick={()=>void work(()=>show('create'),()=>{})}>New subcollection…</MenuAction>
   {getPlatform().resourceClipboard&&<MenuAction icon={ClipboardPaste} hint={isMac?'⌘V':'Ctrl+V'} disabled={busy} onClick={()=>void work(()=>pasteResources(item.id),close)}>Paste resources here</MenuAction>}
   {commands&&<MenuAction icon={Upload} disabled={busy} onClick={()=>void work(()=>{close();commands.importFiles(item);},()=>{})}>Import here…</MenuAction>}
   <MenuSeparator/>
   <MenuAction icon={Pin} disabled={busy} onClick={()=>void work(()=>pinCollection(item.id,!item.favorite,scope),close)}>{item.favorite?'Unpin collection':'Pin collection'}</MenuAction>
   <MenuAction icon={Pencil} disabled={busy} onClick={()=>void work(()=>show('rename'),()=>{})}>Rename collection…</MenuAction>
   <MenuAction icon={FolderInput} disabled={busy} onClick={()=>void work(()=>show('move'),()=>{})}>Move collection…</MenuAction>
   <MenuAction icon={Settings2} disabled={busy} onClick={()=>void work(()=>show('manage'),()=>{})}>Manage collection…</MenuAction>
   <MenuSeparator/><MenuAction icon={Trash2} destructive disabled={busy} onClick={()=>void work(()=>show('delete'),()=>{})}>Delete collection…</MenuAction>{error&&<p role="alert">{error}</p>}</>;
 }}</LibraryPopover>
 {dialog&&['rename','move','manage'].includes(dialog)&&<CollectionManagement collection={item} section={dialog as 'rename'|'move'|'manage'} onChanged={()=>{}} onClose={done}/>}
 {dialog==='delete'&&<CollectionDeletionDialog collection={item} onClose={done} onDeleted={done}/>}
 {dialog==='create'&&<CollectionPicker resourceIds={[]} parentId={item.id} onClose={done} onCreated={created=>{setDialog(null);onOpen(created);}}/>}
 </>;
}
