import { expect, it } from 'vitest';
import { normalizeSidebarSections } from './sidebarPreferences';
it('normalizes old and partial device preferences without hiding defaults',()=>{
 expect(normalizeSidebarSections(undefined)).toEqual({pinned:{visible:true,collapsed:false,type:'all'},recent:{visible:true,collapsed:false,type:'all'},tags:{visible:true,collapsed:false,type:'all'}});
 expect(normalizeSidebarSections({pinned:{visible:false},recent:{collapsed:true,type:'all'},unknown:{visible:false}})).toEqual({pinned:{visible:false,collapsed:false,type:'all'},recent:{visible:true,collapsed:true,type:'all'},tags:{visible:true,collapsed:false,type:'all'}});
 expect(normalizeSidebarSections({tags:'bad'}).tags).toEqual({visible:true,collapsed:false,type:'all'});
});

it('preserves explicit types and normalizes malformed choices without confusing tags with types',()=>{
 expect(normalizeSidebarSections({pinned:{type:'collection'},recent:{type:'future'},tags:{type:'note'}}).pinned.type).toBe('collection');
 expect(normalizeSidebarSections({recent:{type:'future'}}).recent.type).toBe('future');
 expect(normalizeSidebarSections({recent:{type:'bad value'},tags:{type:'note'}}).recent.type).toBe('all');
 expect(normalizeSidebarSections({tags:{type:'note'}}).tags.type).toBe('all');
});
