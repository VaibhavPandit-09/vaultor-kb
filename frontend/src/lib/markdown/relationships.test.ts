// @vitest-environment jsdom
import {expect,it} from 'vitest';
import {markdownRelationships} from './relationships';
import {referenceResolver} from '../folderImports';
import {convertText,type ImportRow} from '../fileImports';
import {markdownDestination,markdownPathMatcher} from '../../../../desktop/src/linked/path-resolution.mjs';
const encode=(text:string)=>new TextEncoder().encode(text);
it('imported and linked folders discover equivalent parsed destinations without changing source bytes',()=>{
 const source='[B](nested/b.md#part) [Encoded](Space%20name.md) [Self](#top) [Missing](gone.md)\n\n[Ref][b]\n\n[b]: nested/b.md\n\n`[literal](other.md)`\n\n```md\n[code](other.md)\n```\n\n[[Wiki|Alias]]\n';
 const paths=['docs/a.md','docs/nested/b.md','docs/Space name.md'];
 const rows:ImportRow[]=paths.map(path=>({id:path,path,file:new File([''],path.split('/').at(-1)!),kind:'markdown',asNote:true,status:'ready',warnings:[]}));
 const imported=convertText('markdown',source,referenceResolver(rows,paths[0]));
 const ids:string[]=[];const visit=(node:typeof imported.doc)=>{if(node.type==='resourceLink')ids.push(node.attrs!.resourceId);node.content?.forEach(visit);};visit(imported.doc);
 const bytes=encode(source),before=bytes.slice(),links=markdownRelationships(bytes).links,match=markdownPathMatcher(paths.map(path=>path.slice(5)));
 const linked=links.flatMap(link=>{const destination=markdownDestination('a.md',link.href);const path=destination&&match(destination.relative);return path?['docs/'+path]:[];});
 expect(linked.sort()).toEqual(ids.sort());expect(bytes).toEqual(before);expect(links).toHaveLength(5);
});
it('excludes frontmatter, raw HTML, images and code and bounds shape/input',()=>{
 expect(markdownRelationships(encode('---\nexample: [Not](x.md)\n---\n\n![Image](pic.png)\n\n<div>[No](x.md)</div>\n\n[Yes](y.md)')).links.map(link=>link.href)).toEqual(['y.md']);
 expect(()=>markdownRelationships(new Uint8Array(1048577))).toThrow(/SIZE_LIMIT/);
 expect(()=>markdownRelationships(new Uint8Array([255]))).toThrow();
});
