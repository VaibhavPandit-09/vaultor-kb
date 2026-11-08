import type {ButtonHTMLAttributes,ReactNode} from 'react';
import type {LucideIcon} from 'lucide-react';
/** Presentation only; callers retain command admission, execution and dialog ownership. */
export function MenuAction({icon:Icon,hint,destructive,children,...props}:ButtonHTMLAttributes<HTMLButtonElement>&{icon?:LucideIcon;hint?:string;destructive?:boolean;children:ReactNode}){
 return <button {...props} type="button" className={'library-button menu-action'+(destructive?' menu-destructive':'')}><span className="menu-icon" aria-hidden="true">{Icon&&<Icon size={15}/>}</span><span className="menu-label">{children}</span>{hint&&<kbd aria-hidden="true">{hint}</kbd>}</button>;
}
export function MenuSeparator(){return <div role="separator" className="menu-separator"/>;}
