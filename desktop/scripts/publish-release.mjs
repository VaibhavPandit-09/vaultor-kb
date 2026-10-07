import { execFileSync } from 'node:child_process';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, basename, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkPublicationMode, checkIdenticalAsset } from './release-publication-policy.mjs';
import { releaseArtifacts } from './release-artifacts.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const args = process.argv.slice(2);
if (args.some(value => !['--publish', '--add-platform', '--platform', 'win32', 'darwin', '--notes'].includes(value) && value.startsWith('--'))) throw new Error('Unknown release option.');
const option = name => { const i = args.indexOf(name); return i < 0 ? undefined : args[i + 1]; };
const platform = option('--platform') ?? process.platform;
const pkg = JSON.parse(await readFile(join(root, 'desktop/package.json'), 'utf8'));
const trust = JSON.parse(await readFile(join(root, 'desktop/release-trust.json'), 'utf8'));
const pair = await releaseArtifacts(join(root, 'desktop/releases'), pkg.version, trust.publicKey, platform);
const tag = `v${pkg.version}`;
console.log(`Verified ${tag}: ${basename(pair.installer)} (${pair.manifest.size} bytes) and signed sidecar.`);
if (!args.includes('--publish')) {
  console.log('Dry run only. Use --publish --notes <release-notes.md> after committing, pushing and tagging the verified release.');
} else {
  const notes = option('--notes');
  if (!notes) throw new Error('Provide a reviewed release notes file.');
  const body = await readFile(resolve(root, notes), 'utf8');
  if (!body.trim()) throw new Error('Release notes must not be empty.');
  const run = (command, argv) => execFileSync(command, argv, { cwd: root, encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  if (run('git', ['status', '--porcelain'])) throw new Error('Commit all intended release changes first; the working tree must be clean.');
  const repo = JSON.parse(run('gh', ['repo', 'view', '--json', 'nameWithOwner'])).nameWithOwner;
  const commit = run('git', ['rev-parse', 'HEAD']);
  const remote = run('git', ['ls-remote', 'origin', `refs/tags/${tag}`, `refs/tags/${tag}^{}`]).split('\n').filter(Boolean);
  const tagged = remote.find(line => line.endsWith('^{}')) ?? remote[0];
  if (!tagged || tagged.split(/\s/)[0] !== commit) throw new Error('Push the release tag pointing to this exact commit before uploading. Never move a published tag.');
  // Listing first distinguishes an absent release from an authentication/network failure.
  const releases = JSON.parse(run('gh', ['api', `repos/${repo}/releases`, '--paginate', '--slurp'])).flat();
  const release = releases.find(item => item.tag_name === tag);
  checkPublicationMode(release, args.includes('--add-platform'));
  if (!release) run('gh', ['release', 'create', tag, '--repo', repo, '--verify-tag', '--draft', '--title', `Vaultor ${pkg.version}`, '--notes-file', resolve(root, notes)]);
  const existing = JSON.parse(run('gh', ['release', 'view', tag, '--repo', repo, '--json', 'assets'])).assets;
  for (const path of [pair.installer, pair.sidecar]) {
    const name = basename(path);
    if (existing.some(asset => asset.name === name)) {
      // A retry may reuse byte-identical assets; never silently replace published bytes.
      const temp = await mkdtemp(join(tmpdir(), 'vaultor-release-verify-'));
      try {
        run('gh', ['release', 'download', tag, '--repo', repo, '--pattern', name, '--dir', temp]);
        const { createHash } = await import('node:crypto');
        const { createReadStream } = await import('node:fs');
        const digest = async file => { const hash = createHash('sha256'); for await (const chunk of createReadStream(file)) hash.update(chunk); return hash.digest('hex'); };
        checkIdenticalAsset(await digest(path), await digest(join(temp, name)), name);
      } finally {
        if (dirname(resolve(temp)) !== resolve(tmpdir()) || !basename(temp).startsWith('vaultor-release-verify-')) throw new Error('Unexpected verification directory; refusing cleanup.');
        await rm(temp, { recursive: true, force: true });
      }
    } else run('gh', ['release', 'upload', tag, path, '--repo', repo]);
  }
  console.log(`${release && !release.draft ? 'Published release' : 'Draft release'} https://github.com/${repo}/releases/tag/${tag} contains verified ${platform} artifacts. Existing assets and source tag were preserved.`);
}
