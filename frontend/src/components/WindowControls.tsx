import {Maximize,Minimize2,Minus,X} from 'lucide-react';
import type {ReactNode} from 'react';
/** DesktopChrome presentation; host commands remain outside this component. */
export default function WindowControls({maximized,minimize,maximize,close,menu,drag,error,closeTitle='Close window',className=''}:{maximized:boolean;minimize:()=>void;maximize:()=>void;close:()=>void;menu?:ReactNode;drag?:ReactNode;error?:string;closeTitle?:string;className?:string}){
 return <div className={'desktop-window-controls '+className} role="group" aria-label="Window controls">{drag}{menu}<button aria-label="Minimize" title="Minimize" onClick={minimize}><Minus size={16}/></button><button aria-label={maximized?'Restore window':'Maximize'} title={maximized?'Restore window':'Maximize'} onClick={maximize}>{maximized?<Minimize2 size={14}/>:<Maximize size={14}/>}</button><button className="desktop-close" aria-label="Close window" title={closeTitle} onClick={close}><X size={17}/></button>{error&&<span role="alert" className="desktop-window-error">{error}</span>}</div>;
}
