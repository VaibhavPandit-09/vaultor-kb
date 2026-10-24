// Killed-process-style fault injection at real durable save boundaries.
import { CaptureStore, snapshot } from './filesystem.mjs';
import { join } from 'node:path';
const [root, journalRoot, boundary] = process.argv.slice(2);
const store = new CaptureStore(root, journalRoot), base = await snapshot(join(root, 'doc.md'));
await store.save('doc.md', base, Buffer.from('Vaultor local\n'), async step => {
  if (step === boundary) process.exit(73);
});
