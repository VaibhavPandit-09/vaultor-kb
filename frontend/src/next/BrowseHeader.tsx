import type {ReactNode} from 'react';
/** One surface changes geometry. Scroll owners update its progress without React per-frame work. */

export default function BrowseHeader({title,detail,search,actions}:{title:string;detail?:string;search?:ReactNode;actions?:ReactNode}){return <header className="next-header next-browse-header"><div className="next-header-identity"><p className="next-browse-eyebrow">Your workspace</p><h1 title={title}>{title}</h1><small aria-live="polite">{detail}</small></div><div className="next-header-search">{search}</div><div className="next-header-actions">{actions}</div></header>;}
