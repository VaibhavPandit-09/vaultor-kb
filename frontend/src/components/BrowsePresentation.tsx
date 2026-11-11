import type {HTMLAttributes,ReactNode} from 'react';
import {ChevronLeft,ChevronRight} from 'lucide-react';

/** Shared presentation extracted from BrowseLayout. No queries, IPC or application providers. */
export function BrowseHeading({title,kicker='YOUR WORKSPACE',actions}:{title:string;kicker?:string;actions?:ReactNode}){
 return <header className="library-heading"><div className="library-heading-title"><p>{kicker}</p><h1 title={title}>{title}</h1></div><div className="library-heading-actions">{actions}</div></header>;
}
export function BrowsePagination({page,totalPages,loading,onPage,compact=false}:{page:number;totalPages:number;loading:boolean;onPage:(page:number)=>void;compact?:boolean}){
 if(totalPages<=1&&page===0)return null;
 return <nav aria-label="Result pages" title={`Page ${page+1} of ${Math.max(totalPages,page+1)}`} className={compact?'library-pagination library-pagination-compact':'library-pagination'}><span>Page {page+1} of {Math.max(totalPages,page+1)}</span><button className="library-button" aria-label="Previous" title={compact?'Previous page':undefined} disabled={loading||page===0} onClick={()=>onPage(page-1)}><ChevronLeft size={15}/>{!compact&&'Previous'}</button><button className="library-button" aria-label="Next" title={compact?'Next page':undefined} disabled={loading||page+1>=totalPages} onClick={()=>onPage(page+1)}>{!compact&&'Next'}<ChevronRight size={15}/></button></nav>;
}
export function BrowseRowSurface({selection,resource,date,actions,children,...props}:Omit<HTMLAttributes<HTMLDivElement>,'resource'>&{selection?:ReactNode;resource:ReactNode;date?:ReactNode;actions?:ReactNode}){
 return <div {...props} className={['library-row',props.className].filter(Boolean).join(' ')}>{selection}<div className="library-resource" role={props.role==='row'?'gridcell':undefined}>{resource}</div>{date}<div className="browse-row-actions">{actions}</div>{children}</div>;
}

/** Original directory view switch, shared without its API controller. */
export function CollectionDirectorySwitch({value,onChange}:{value:'all'|'hierarchy';onChange:(value:'all'|'hierarchy')=>void}){return <div className="collection-directory-switch" role="group" aria-label="Collection presentation">{(['all','hierarchy'] as const).map(mode=><button type="button" key={mode} className="library-button" aria-pressed={value===mode} onClick={()=>onChange(mode)}>{mode==='all'?'All':'Hierarchy'}</button>)}</div>;}
