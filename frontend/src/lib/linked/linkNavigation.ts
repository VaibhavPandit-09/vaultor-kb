import {markdownDestination} from '../../../../desktop/src/linked/path-resolution.mjs';

/** Display/activation policy only. Native resolution still owns filesystem grants. */
export function markdownLinkKind(relative:string,href:string):'external'|'local'|undefined{
  if(!href||href.length>4096||(href.includes('\\')||[...href].some(character=>character.charCodeAt(0)<32)))return;
  if(/^https?:\/\//i.test(href)){
    try{const url=new URL(href);if(!url.username&&!url.password)return 'external';}catch{/* Refuse malformed URLs. */}
    return;
  }
  if(markdownDestination(relative,href))return 'local';
}
export function revealMarkdownHeading(root:HTMLElement,fragment:string){
  let desired:string;try{desired=decodeURIComponent(fragment);}catch{return false;}
  const slugs=new Map<string,number>();
  for(const heading of root.querySelectorAll<HTMLElement>('h1,h2,h3,h4,h5,h6')){
    const base=(heading.textContent??'').trim().toLowerCase().replace(/[^\p{L}\p{N}\p{M}\s_-]/gu,'').replace(/\s/g,'-'),count=slugs.get(base)??0;slugs.set(base,count+1);
    if((count?base+'-'+count:base)===desired){heading.scrollIntoView({block:'start'});return true;}
  }
  return false;
}
