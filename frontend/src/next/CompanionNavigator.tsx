import NavigatorFrame from '../components/NavigatorFrame';
import {useState,type ReactNode} from 'react';
import {FileText,Compass,Folder,FolderSymlink,Tags,Pin,Clock} from 'lucide-react';
const views=[['sessions','Open notes',FileText],['shortcuts','Quick access',Compass],['collections','Collections',Folder],['tags','Tags',Tags],['pins','Pinned',Pin],['recent','Recents',Clock],['sources','Linked sources',FolderSymlink]] as const;
export type CompanionView=typeof views[number][0];
/** AdaptiveNavigator's companion categories, restricted to capabilities present in Next. */
export default function CompanionNavigator({view,choose,children,auto=false,toggleAuto}:{auto?:boolean;toggleAuto?:()=>void;view:CompanionView;choose:(v:CompanionView)=>void;children:ReactNode}){
 const [direction,setDirection]=useState(1);
 const change=(next:CompanionView)=>{setDirection(views.findIndex(v=>v[0]===next)>views.findIndex(v=>v[0]===view)?1:-1);choose(next);};
 return <NavigatorFrame className="next-companion" view={view} label={views.find(v=>v[0]===view)![1]} mode={auto?'Auto':'Chosen'} automatic={toggleAuto&&<button aria-label="Automatic sidebar companion" title="Follow workspace context" aria-pressed={auto} onClick={toggleAuto}><Compass size={14}/></button>} categories={views.filter(v=>v[0]!=='pins'&&v[0]!=='recent').map(([key,label,Icon])=><button key={key} role="tab" id={'next-category-'+key} aria-controls={'next-category-panel-'+key} tabIndex={(key===view||key==='shortcuts'&&(view==='pins'||view==='recent'))?0:-1} aria-selected={(key===view||key==='shortcuts'&&(view==='pins'||view==='recent'))} aria-label={label} title={label} onClick={()=>change(key)}><Icon size={15}/></button>)}><div className="next-companion-content" data-direction={direction}>{children}</div></NavigatorFrame>;
}
