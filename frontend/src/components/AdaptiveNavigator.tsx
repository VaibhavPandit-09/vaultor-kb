import NavigatorFrame from './NavigatorFrame';
import {useEffect,useRef,useState,type ReactNode} from 'react';
import {FileText,Pin,Folder,Tag,FolderSymlink,Compass} from 'lucide-react';
import {useDesktopInteraction,useDropTarget} from '../lib/desktopInteraction';
import {navigatorContext,navigatorViews,type NavigatorState,type NavigatorView} from '../lib/navigator';
const labels:Record<NavigatorView,string>={sessions:'Open notes',shortcuts:'Quick access',collections:'Collections',tags:'Tags',sources:'Linked sources'};
const icons={sessions:FileText,shortcuts:Pin,collections:Folder,tags:Tag,sources:FolderSymlink};
function Category({view,active,dragging,onChoose,onDiscover}:{view:NavigatorView;active:boolean;dragging:boolean;onChoose:()=>void;onDiscover:()=>void}){
 const drop=useDropTarget(dragging?{kind:'discovery',id:'navigator-'+view,label:'Show '+labels[view]}:null,onDiscover),Icon=icons[view];
 return <button role="tab" tabIndex={active?0:-1} id={'navigator-tab-'+view} aria-selected={active} aria-controls={'navigator-panel-'+view} aria-label={labels[view]} title={'Sidebar: '+labels[view]} aria-description={'Show '+labels[view]+' in the companion working area; the main page stays open.'} {...drop} onClick={onChoose}><Icon size={15}/></button>;
}
/** Presentation only: sessions, commands, queries and drag authority retain their existing owners. */
export default function AdaptiveNavigator({state,onChange,editing,selected,destination,children}:{state:NavigatorState;onChange:(next:NavigatorState)=>void;editing:boolean;selected:number;destination?:string;children:(view:NavigatorView,active:boolean)=>ReactNode}){
 const drag=useDesktopInteraction(),ticket=drag?.payload?.ticket??null,baseline=navigatorContext(state,editing,selected,destination);
 const [gesture,setGesture]=useState<{ticket:string|null;origin:NavigatorView;temporary:NavigatorView|null}>({ticket:null,origin:baseline,temporary:null});
 if(gesture.ticket!==ticket)setGesture({ticket,origin:baseline,temporary:null});
 const origin=ticket&&gesture.ticket===ticket?gesture.origin:baseline,active=ticket?(gesture.temporary??origin):baseline;
 const panels=useRef(new Map<NavigatorView,HTMLElement>()),writeTimer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined),latest=useRef({state,onChange,ticket});
 useEffect(()=>{latest.current={state,onChange,ticket};},[state,onChange,ticket]);
 useEffect(()=>()=>clearTimeout(writeTimer.current),[]);
 useEffect(()=>{if(ticket)return;const element=panels.current.get(active);if(element)element.scrollTop=state.scroll[active]??0;},[active,ticket,state.scroll]);
 const choose=(view:NavigatorView)=>{if(ticket)setGesture(current=>({...current,temporary:view}));else onChange({...state,view});};
 const scroll=(view:NavigatorView,element:HTMLElement)=>{if(ticket)return;const top=element.scrollTop;clearTimeout(writeTimer.current);writeTimer.current=setTimeout(()=>{const current=latest.current;if(!current.ticket&&Math.abs((current.state.scroll[view]??0)-top)>1)current.onChange({...current.state,scroll:{...current.state.scroll,[view]:top}});},180);};
 return <NavigatorFrame view={active} label={labels[active]} dragging={Boolean(ticket)} mode={ticket?'Drag preview':state.view==='auto'?'Auto':'Chosen'} automatic={<button aria-label="Follow workspace context" title={state.view==='auto'?'Automatic: follows workspace activity':'Return to automatic working area'} aria-pressed={state.view==='auto'} disabled={Boolean(ticket)} onClick={()=>onChange({...state,view:'auto'})}><Compass size={14}/></button>} categories={navigatorViews.map(view=><Category key={view} view={view} active={view===active} dragging={Boolean(ticket)} onChoose={()=>choose(view)} onDiscover={()=>choose(view)}/>)}>  <div className="navigator-viewport">{navigatorViews.map(view=>{const painted=active===view,retained=Boolean(ticket&&origin===view&&!painted);return <section key={view} ref={element=>{if(element)panels.current.set(view,element);else panels.current.delete(view);}} id={'navigator-panel-'+view} role="tabpanel" aria-labelledby={'navigator-tab-'+view} aria-hidden={!painted||undefined} hidden={!painted&&!retained} data-retained-source={retained||undefined} className="sidebar-secondary navigator-panel" onScroll={event=>scroll(view,event.currentTarget)}>{children(view,painted||retained)}</section>;})}</div></NavigatorFrame>;
}
