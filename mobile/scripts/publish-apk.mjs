// Android-only publication. Run only after documented installed-release safety gates.
import { execFileSync } from 'node:child_process';
import { readFile, mkdtemp } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
const root = resolve(import.meta.dirname, '../..'),
  mobile = join(root, 'mobile');
const run = (cmd, args) =>
  execFileSync(cmd, args, { cwd: root, encoding: 'utf8' }).trim();
const version = JSON.parse(
  await readFile(join(mobile, 'package.json')),
).version;
const tag = `android/v${version}`,
  repo = 'VaibhavPandit-09/vaultor-kb';
const dir = join(mobile, 'releases', version),
  manifest = JSON.parse(await readFile(join(dir, 'android-release.json')));
const trust = JSON.parse(await readFile(join(mobile, 'release-trust.json')));
const hash = b => createHash('sha256').update(b).digest('hex');
if (
  manifest.signerSha256 !== trust.signerSha256 ||
  manifest.applicationId !== trust.applicationId ||
  manifest.versionName !== version
)
  throw Error('Artifact trust mismatch');
if (hash(await readFile(join(dir, manifest.apk))) !== manifest.sha256)
  throw Error('APK checksum mismatch');
if (run('git', ['status', '--porcelain']))
  throw Error('Source tree must be clean');
const commit = run('git', ['rev-parse', 'HEAD']);
if (manifest.sourceCommit !== commit)
  throw Error('Rebuild and verify the APK from this exact release source.');
const checksum = await readFile(join(dir, 'SHA256SUMS.txt'), 'utf8');
if (checksum !== `${manifest.sha256}  ${manifest.apk}\n`)
  throw Error('Checksum sidecar differs from verified APK manifest.');
if (run('git', ['rev-list', '-n', '1', tag]) !== commit)
  throw Error('Tag must identify this exact clean source');
if (
  !run('git', [
    'ls-remote',
    'origin',
    `refs/tags/${tag}`,
    `refs/tags/${tag}^{}`,
  ]).includes(commit)
)
  throw Error('Push immutable source tag before publishing');
if (!process.argv.includes('--publish')) {
  console.log(
    `Verified publication preflight for ${tag}; --publish enables GitHub mutations.`,
  );
  process.exit(0);
}
const notes = join(root, 'docs/android/releases', `${version}.md`);
await readFile(notes); // Actual emulator evidence and scope notes must exist.
const existing = JSON.parse(
  run('gh', [
    'release',
    'list',
    '--repo',
    repo,
    '--limit',
    '100',
    '--json',
    'tagName',
  ]),
).some(r => r.tagName === tag);
if (!existing)
  run('gh', [
    'release',
    'create',
    tag,
    '--repo',
    repo,
    '--verify-tag',
    '--draft',
    '--prerelease',
    '--title',
    `Vaultor Android ${version}`,
    '--notes-file',
    notes,
  ]);
const release = JSON.parse(
  run('gh', [
    'release',
    'view',
    tag,
    '--repo',
    repo,
    '--json',
    'assets,isDraft,isPrerelease',
  ]),
);
if (!release.isPrerelease)
  throw Error('Android milestone must remain a prerelease');
const names = [manifest.apk, 'SHA256SUMS.txt', 'android-release.json'];
for (const name of names) {
  const asset = release.assets.find(a => a.name === name);
  if (asset) {
    const temp = await mkdtemp(join(tmpdir(), 'vaultor-apk-verify-'));
    run('gh', [
      'release',
      'download',
      tag,
      '--repo',
      repo,
      '--pattern',
      name,
      '--dir',
      temp,
    ]);
    if (
      hash(await readFile(join(temp, name))) !==
      hash(await readFile(join(dir, name)))
    )
      throw Error(`Immutable asset differs: ${name}`);
  } else {
    if (!release.isDraft)
      throw Error('Published APK releases cannot acquire replacement assets');
    run('gh', ['release', 'upload', tag, join(dir, name), '--repo', repo]);
  }
}
// Download every staged artifact, compare exact bytes, then make it usable.
const check = await mkdtemp(join(tmpdir(), 'vaultor-apk-staged-'));
run('gh', ['release', 'download', tag, '--repo', repo, '--dir', check]);
for (const name of names)
  if (
    hash(await readFile(join(check, name))) !==
    hash(await readFile(join(dir, name)))
  )
    throw Error(`Staged artifact mismatch: ${name}`);
if (release.isDraft)
  run('gh', ['release', 'edit', tag, '--repo', repo, '--draft=false']);
console.log(`https://github.com/${repo}/releases/tag/${tag}`);
