import test from 'node:test';
import assert from 'node:assert/strict';
import {relativeDestination,assetMime} from '../src/linked/links.mjs';

test('relative Markdown links normalize only inside the authorized source',()=>{
  assert.deepEqual(relativeDestination('android/ANDROID.md','../architecture/WORKSPACES.md#reading'),{relative:'architecture/WORKSPACES.md',fragment:'reading'});
  assert.equal(relativeDestination('guide.md','assets/Unicode%20%CE%A9.png').relative,'assets/Unicode Ω.png');
  assert.deepEqual(relativeDestination('guide.md','#heading'),{relative:'guide.md',fragment:'heading'});
  for(const href of ['../outside.md','%2e%2e/outside.md','file:///C:/outside.md','C:/x.md','//server/x.md','\\server\\x.md','assets/x.png:secret','.git/config','.vaultor-recovery/evidence','assets/%00.png','https://example.test/image.png'])assert.throws(()=>relativeDestination('guide.md',href),/LINKED_LINK/);
});
test('only bounded raster image headers and PDF receive preview MIME types',()=>{
  const png=Buffer.alloc(24);Buffer.from([137,80,78,71,13,10,26,10]).copy(png);png.writeUInt32BE(200,16);png.writeUInt32BE(100,20);assert.equal(assetMime(png),'image/png');
  png.writeUInt32BE(100000,16);assert.throws(()=>assetMime(png),/IMAGE_SIZE/);
  assert.equal(assetMime(Buffer.from('%PDF-1.7')),'application/pdf');
  for(const value of ['<svg></svg>','<html>unsafe</html>','#!/bin/sh'])assert.throws(()=>assetMime(Buffer.from(value)),/PREVIEW_UNSUPPORTED/);
});
