import { build } from 'esbuild';
import { mkdir, copyFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const out = new URL('../android/app/src/main/assets/', import.meta.url);
await mkdir(out, { recursive: true });
await build({
  entryPoints: [fileURLToPath(new URL('../editor/index.js', import.meta.url))],
  bundle: true,
  minify: true,
  format: 'iife',
  outfile: fileURLToPath(new URL('editor.js', out)),
});
await copyFile(
  new URL('../editor/index.html', import.meta.url),
  new URL('editor.html', out),
);
console.log('Built restricted bundled editor');
