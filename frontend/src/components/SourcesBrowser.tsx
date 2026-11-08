import LinkedSources from './LinkedSources';
import {BrowseHeading} from './BrowseLayout';
import type {LinkedWorkspace} from '../lib/linked/workspace';
export default function SourcesBrowser({workspace,visible,onOpen,onReturn}:{workspace:LinkedWorkspace;visible:boolean;onOpen:(id:string)=>void;onReturn:()=>void}){
 return <section hidden={!visible} className="library-view tags-browser" aria-label="Linked source browser"><BrowseHeading title="Linked sources" actions={<button className="library-button" onClick={onReturn}>Library</button>}/><LinkedSources active={visible} workspace={workspace} onOpen={entry=>onOpen(entry.id)}/></section>;
}
