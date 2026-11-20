import {LIMITS} from '../../lib/markdown/limits';

// Rendering authority is independent of Save admission. Keep parsing/DOM bounded,
// never execute raw HTML or fetch untrusted Markdown images from the network.
export function previewBudget(){return (tree:unknown)=>{
  type Node={children?:Node[]};const root=tree as Node,stack=[{node:root,depth:0}];let count=0;
  if((root.children?.length??0)>LIMITS.rootBlocks)throw Error('PREVIEW_COMPLEXITY_LIMIT');
  while(stack.length){const {node,depth}=stack.pop()!;if(++count>LIMITS.renderNodes||depth>LIMITS.depth)throw Error('PREVIEW_COMPLEXITY_LIMIT');for(const child of node.children??[])stack.push({node:child,depth:depth+1});}
};}
