import {useState,type ReactNode} from 'react';
import {FileText,Compass,Folder,FolderSymlink,Tags,Pin,Clock} from 'lucide-react';
const views=[['sessions','Open notes',FileText],['shortcuts','Quick access',Compass],['collections','Collections',Folder],['tags','Tags',Tags],['pins','Pinned',Pin],['recent','Recents',Clock],['sources','Linked sources',FolderSymlink]] as const;
export type CompanionView=typeof views[number][0];
/** AdaptiveNavigator's companion categories, restricted to capabilities present in Next. */
export default function CompanionNavigator({view,choose,children}:{view:CompanionView;choose:(v:CompanionView)=>void;children:ReactNode}){
 const [direction,setDirection]=useState(1);
 const change=(next:CompanionView)=>{setDirection(views.findIndex(v=>v[0]===next)>views.findIndex(v=>v[0]===view)?1:-1);choose(next);};
 return <div className="adaptive-navigator next-companion" data-navigator-view={view}><p className="navigator-scope">Sidebar working area</p><header className="navigator-heading"><strong>{views.find(v=>v[0]===view)![1]}</strong></header><div className="navigator-categories" role="tablist" aria-label="Working region" onKeyDown={event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;const buttons=[...event.currentTarget.querySelectorAll<HTMLButtonElement>('[role=tab]')],index=buttons.indexOf(document.activeElement as HTMLButtonElement);event.preventDefault();buttons[event.key==='Home'?0:event.key==='End'?buttons.length-1:(index+(event.key==='ArrowLeft'?-1:1)+buttons.length)%buttons.length]?.focus();}}>{views.map(([key,label,Icon])=><button key={key} role="tab" id={'next-category-'+key} aria-controls={'next-category-panel-'+key} tabIndex={key===view?0:-1} aria-selected={key===view} aria-label={label} title={label} onClick={()=>change(key)}><Icon size={15}/></button>)}</div><div className="next-companion-content" data-direction={direction}>{children}</div></div>;
}
