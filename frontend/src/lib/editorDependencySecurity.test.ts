// @vitest-environment jsdom
import {expect,it} from 'vitest';
import {mergeAttributes} from '@tiptap/core';
import {DOMSerializer} from '@tiptap/pm/model';

it('does not inherit executable attributes from an own JSON prototype key',()=>{
 const input=JSON.parse('{"__proto__":{"data-r10-canary":"inherited","onerror":"globalThis.r10Canary=true"}}');
 const attrs=mergeAttributes(input);
 const {dom}=DOMSerializer.renderSpec(document,['img',attrs]);
 expect((dom as Element).getAttribute('onerror')).toBeNull();
 expect((dom as Element).getAttribute('data-r10-canary')).toBeNull();
 expect(Object.prototype).not.toHaveProperty('r10Canary');
});
