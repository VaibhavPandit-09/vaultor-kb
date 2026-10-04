import { cp, mkdir } from 'node:fs/promises';
const destination = new URL('../ui/', import.meta.url);
await mkdir(destination, { recursive: true });
await cp(new URL('../../frontend/dist/', import.meta.url), destination, { recursive: true });
console.log('Bundled frontend copied to desktop/ui.');
