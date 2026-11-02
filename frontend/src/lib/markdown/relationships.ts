import {fromMarkdown} from 'mdast-util-from-markdown';
import {gfm} from 'micromark-extension-gfm';
import {gfmFromMarkdown} from 'mdast-util-gfm';
import {frontmatter} from 'micromark-extension-frontmatter';
import {frontmatterFromMarkdown} from 'mdast-util-frontmatter';
import type {Nodes} from 'mdast';

/** Derived destinations only; code, HTML and unsupported wikilinks remain literal. */
export function markdownRelationships(bytes:Uint8Array){
  if(bytes.length>1048576)throw Error('RELATIONSHIP_SIZE_LIMIT');
  const text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);
  const ast=fromMarkdown(text,{extensions:[gfm(),frontmatter(['yaml','toml'])],mdastExtensions:[gfmFromMarkdown(),frontmatterFromMarkdown(['yaml','toml'])]});
  const definitions=new Map<string,string>();
  const links:{href:string;label:string;path:string}[]=[];
  let destinationUnits=0,limited=false;
  const pending:Nodes[]=[ast];let count=0;
  while(pending.length){const node=pending.pop()!;if(++count>30000)throw Error('RELATIONSHIP_SHAPE_LIMIT');if(node.type==='definition'&&!definitions.has(node.identifier.toUpperCase()))definitions.set(node.identifier.toUpperCase(),node.url);if('children' in node)pending.push(...[...node.children].reverse());}
  const walk=(node:Nodes,depth=0)=>{
    if(depth>64)throw Error('RELATIONSHIP_SHAPE_LIMIT');
    const href=node.type==='link'?node.url:node.type==='linkReference'?definitions.get(node.identifier.toUpperCase()):undefined;
    if(href){if(links.length>=2000||href.length>4096||destinationUnits+href.length>262144)limited=true;
      else{destinationUnits+=href.length;links.push({href,label:text.slice(node.position?.start.offset??0,node.position?.end.offset??0).slice(0,180),path:String(node.position?.start.offset??0)});}}
    if('children' in node)for(const child of node.children)walk(child,depth+1);
  };walk(ast);
  return {links,limited};
}
