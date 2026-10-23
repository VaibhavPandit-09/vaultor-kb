// @vitest-environment jsdom
import { expect, it } from 'vitest';
import { convertText, type ImportRow } from './fileImports';
import { sourcePath, folderPaths, referenceResolver } from './folderImports';
function row(path:string,asNote=true):ImportRow{return {id:path,path,file:new File(['x'],path.split('/').at(-1)!),kind:asNote?'markdown':'binary',asNote,status:'ready',warnings:[]};}
it('resolves cross-directory, encoded, extensionless, image and cyclic references without title matching',()=>{
 const rows=[row('docs/README.md'),row('docs/a/Space name.md'),row('docs/image.png',false)];
 const resolve=referenceResolver(rows,'docs/a/Space name.md');
 expect(resolve('../README.md#intro')).toMatchObject({id:'docs/README.md',fragment:'intro'});
 expect(resolve('./Space%20name')).toMatchObject({id:'docs/a/Space name.md'});
 expect(resolve('../image.png')).toMatchObject({image:true});
 for(const ref of ['../../outside.md','https://example.com','/absolute.md','../missing.md','%zz'])expect(resolve(ref)).toBeUndefined();
});
it('does not guess ambiguous case-insensitive targets or extension conventions',()=>{
 const resolve=referenceResolver([row('docs/A.md'),row('docs/a.md'),row('docs/a.markdown')],'docs/readme.md');
 expect(resolve('a')).toBeUndefined();expect(resolve('a.md')?.id).toBe('docs/a.md');
});
it('rewrites parsed links and images while preserving code, labels, fragments and alt text',()=>{
 const rows=[row('docs/a.md'),row('docs/b.md'),row('docs/pic.png',false)];
 const {doc,warnings}=convertText('markdown','[Other](b.md#part)\n\n![Accessible](pic.png)\n\n`[literal](b.md)`\n\n```md\n[code](b.md)\n```\n\n[Missing](gone.md)\n\n[Web](https://example.com)',referenceResolver(rows,'docs/a.md'));
 const encoded=JSON.stringify(doc);expect(encoded).toContain('resourceLink');expect(encoded).toContain('heading: #part');expect(encoded).toContain('Accessible');expect(encoded).toContain('[literal](b.md)');expect(encoded).toContain('[code](b.md)');expect(encoded).toContain('https://example.com');expect(warnings).toHaveLength(1);
 expect(doc.content?.some(node=>node.type==='image'&&node.attrs?.resourceId==='docs/pic.png')).toBe(true);
});
it('bounds paths and retains empty directories, rejecting colliding folder casing',()=>{
 for(const path of ['../bad','/root','a/../b','a\\b','a//b','C:/x','a/\0'])expect(()=>sourcePath(path)).toThrow();
 expect(folderPaths({rows:[row('docs/a/b.md')],folder:{name:'docs',directories:['docs/empty']}})).toEqual(['docs','docs/a','docs/empty']);
 expect(()=>folderPaths({rows:[row('docs/A/b.md'),row('docs/a/c.md')]})).toThrow(/case/);
});
