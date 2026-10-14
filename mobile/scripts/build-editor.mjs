import { build } from 'esbuild';
import { mkdir, copyFile, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const out = new URL('../android/app/src/main/assets/', import.meta.url);
await mkdir(out, { recursive: true });
await build({
  entryPoints: [fileURLToPath(new URL('../reader/index.js', import.meta.url))],
  bundle: true,
  minify: true,
  format: 'iife',
  outfile: fileURLToPath(new URL('reader.js', out)),
});
for (const [src, dst] of [
  ['index.html', 'reader.html'],
  ['reader.css', 'reader.css'],
  ['media.html', 'media.html'],
  ['media.css', 'media.css'],
  ['media.js', 'media.js'],
])
  await copyFile(
    new URL('../reader/' + src, import.meta.url),
    new URL(dst, out),
  );
for (const file of ['editor.html', 'editor.js'])
  await rm(new URL(file, out), { force: true });
console.log('Built restricted read-only renderer; no editor engine bundled');
