import { expect, it } from 'vitest';
import { normalizeSidebarSections } from './sidebarPreferences';
it('normalizes old and partial device preferences without hiding defaults',()=>{
 expect(normalizeSidebarSections(undefined)).toEqual({pinned:{visible:true,collapsed:false},recent:{visible:true,collapsed:false},tags:{visible:true,collapsed:false}});
 expect(normalizeSidebarSections({pinned:{visible:false},recent:{collapsed:true},unknown:{visible:false}})).toEqual({pinned:{visible:false,collapsed:false},recent:{visible:true,collapsed:true},tags:{visible:true,collapsed:false}});
 expect(normalizeSidebarSections({tags:'bad'}).tags).toEqual({visible:true,collapsed:false});
});
