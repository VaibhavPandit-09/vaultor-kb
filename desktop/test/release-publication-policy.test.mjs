import {test} from 'node:test';
import assert from 'node:assert/strict';
import {checkPublicationMode,checkIdenticalAsset} from '../scripts/release-publication-policy.mjs';
test('published releases require explicit platform addition, preserving identical retries',()=>{
 assert.doesNotThrow(()=>checkPublicationMode(undefined,false));
 assert.doesNotThrow(()=>checkPublicationMode({draft:true},false));
 assert.throws(()=>checkPublicationMode({draft:false},false),/add-platform/);
 assert.throws(()=>checkPublicationMode(undefined,true),/existing release/);
 assert.doesNotThrow(()=>checkPublicationMode({draft:false},true));
 assert.doesNotThrow(()=>checkIdenticalAsset('same','same','installer'));
 assert.throws(()=>checkIdenticalAsset('new','old','installer'),/differs/);
});
