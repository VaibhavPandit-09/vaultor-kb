import {expect,it} from 'vitest';
import {collectionDeletionDestination} from './organization';
it('reconciles any selected descendant to the surviving parent of the deleted root',()=>{
 expect(collectionDeletionDestination({id:'leaf',name:'Leaf',count:1,ancestors:[{id:'parent',name:'Parent'},{id:'root',name:'Root'}]},['root','leaf'],'parent')).toEqual({id:'parent',name:'Parent',count:0});
});
it('uses the surviving stable parent ID when cached breadcrumb metadata is absent',()=>{
 expect(collectionDeletionDestination({id:'root',name:'Root',count:1},['root'],'parent')).toEqual({id:'parent',name:'Collection',count:0});
});
it('routes a deleted top-level root to Collections and preserves unrelated destinations',()=>{
 expect(collectionDeletionDestination({id:'root',name:'Root',count:0},['root'],null)).toBeNull();
 expect(collectionDeletionDestination({id:'other',name:'Other',count:0},['root'],'parent')).toBeUndefined();
});
