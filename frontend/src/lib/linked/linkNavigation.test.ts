// @vitest-environment jsdom
import {expect,it,vi} from 'vitest';
import {markdownLinkKind,revealMarkdownHeading} from './linkNavigation';
it('allows explicit HTTP(S) or confined relative destinations without granting filesystem access',()=>{
 for(const href of ['./Architecture.md','./Backend/API.md#part','./Space%20name.md','#part'])expect(markdownLinkKind('Index.md',href)).toBe('local');
 expect(markdownLinkKind('Backend/API.md','../Index.md')).toBe('local');
 expect(markdownLinkKind('Index.md','https://example.test/docs')).toBe('external');
 for(const href of ['','javascript:alert(1)','data:text/html,hi','file:///C:/private.md','//example.test','https://user:pass@example.test','../outside.md','%2e%2e/outside.md','C:/private.md','a\\b.md','https://example.test/\nsecret'])expect(markdownLinkKind('Index.md',href)).toBeUndefined();
});
it('retains encoded and duplicate-heading fragment behavior in either renderer',()=>{
 const root=document.createElement('div');root.innerHTML='<h2>Endpoint Details</h2><h2>Endpoint Details</h2>';
 const headings=root.querySelectorAll('h2');headings.forEach(h=>h.scrollIntoView=vi.fn());
 expect(revealMarkdownHeading(root,'endpoint%2Ddetails-1')).toBe(true);expect(headings[1].scrollIntoView).toHaveBeenCalledWith({block:'start'});
 expect(revealMarkdownHeading(root,'%zz')).toBe(false);expect(revealMarkdownHeading(root,'missing')).toBe(false);
});
