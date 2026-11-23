// Run against a new disposable emulator. The predecessor must be the published APK.
import assert from 'node:assert/strict';
import {execFileSync, spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {join, resolve} from 'node:path';
import {createInterface} from 'node:readline';
import {setTimeout as delay} from 'node:timers/promises';

const [serial, predecessor, candidate, instrumentation, resume] = process.argv.slice(2);
assert(/^emulator-\d+$/.test(serial) && predecessor && candidate && instrumentation,
  'Provide an explicit emulator serial, published APK, production APK and instrumentation APK.');
const sdk = process.env.ANDROID_HOME;
assert(sdk && process.env.VAULTOR_BUILD_BUNDLE, 'Set SDK and verified Java host bundle paths.');
const adb = join(sdk, 'platform-tools', process.platform === 'win32' ? 'adb.exe' : 'adb');
const packageName = 'com.vaultor.app';
const instrument = `${packageName}.test/androidx.test.runner.AndroidJUnitRunner`;
const testClass = 'com.vaultorandroid.ProductionUpgradeTest';
const originalSha = '4b87dd8212f03c8db45395ea113e12761c2b1bb45185e1c7e5de6962aaba730b';
const sha256 = async path => createHash('sha256').update(await readFile(path)).digest('hex');
const candidateSha = await sha256(resolve(candidate));
const candidateFixture = '/data/local/tmp/vaultor-m26c-production.apk';
const run = (...args) => execFileSync(adb, ['-s', serial, ...args], {
  encoding: 'utf8', windowsHide: true, timeout: 180_000,
}).trim();
assert.equal(await sha256(resolve(predecessor)), originalSha, 'Published alpha.28 SHA-256 differs.');
assert.equal(run('shell', 'getprop', 'ro.hardware'), 'ranchu');
assert.equal(run('shell', 'getprop', 'sys.boot_completed'), '1');
const hasPredecessor = run('shell', 'pm', 'list', 'packages', packageName).split(/\r?\n/).includes(`package:${packageName}`);
if (hasPredecessor) {
  assert.equal(resume, '--resume-predecessor', 'Use a new emulator without an installed production profile.');
  const path = run('shell', 'pm', 'path', packageName);
  assert.match(path, /^package:\/data\/app\/[A-Za-z0-9_~=/.-]+\/base\.apk$/);
  assert.equal(run('shell', 'sha256sum', path.slice('package:'.length)).split(/\s+/)[0], originalSha,
    'Only an installed byte-identical alpha.28 can resume an unseeded run.');
}
const install = (path, ...options) => assert.match(run('install', ...options, resolve(path)), /Success/);
const owner = spawn(process.execPath, [join(import.meta.dirname, 'fixture-host.mjs')],
  {stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true});
let host;
const lines = createInterface({input: owner.stdout});
lines.on('line', line => {
  if (!line.startsWith('{"fixtureReady":true,')) return;
  host = JSON.parse(line);
});
let ownerError = '';
owner.stderr.on('data', chunk => { ownerError = (ownerError + chunk).slice(-3000); });
let log;
let reverse;
try {
  for (let attempt = 0; !host && attempt < 300 && owner.exitCode === null; attempt++) await delay(250);
  assert(host, 'Disposable Java fixture did not become ready. ' + ownerError);
  assert.match(host.address, /^https:\/\/127\.0\.0\.1:[0-9]+$/);
  reverse = `tcp:${host.port}`;
  run('reverse', reverse, reverse);
  if (!hasPredecessor) install(predecessor);
  install(instrumentation, '-r');
  run('push', resolve(candidate), candidateFixture);
  const installedUid = () => run('shell', 'cmd', 'package', 'list', 'packages', '-U', packageName)
    .split(/\r?\n/).find(line => line.startsWith(`package:${packageName} uid:`));
  const uid = installedUid();
  assert(uid, 'Baseline package UID missing.');
  log = spawn(adb, ['-s', serial, 'logcat', '-T', '1', '-s', 'ProductionUpgrade:I', '*:S'],
    {stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true});
  let sent = false;
  createInterface({input: log.stdout}).on('line', line => {
    const match = line.match(/\bPAIR (\d{6})\b/);
    if (match && !sent) {
      sent = true;
      owner.stdin.write(JSON.stringify({approve: match[1]}) + '\n');
    }
  });
  const seed = spawn(adb, ['-s', serial, 'shell', 'am', 'instrument', '-w',
    '-e', 'class', `${testClass}#seedPublishedAlpha28`, '-e', 'fixtureAddress', host.address,
    '-e', 'noteId', host.noteId, '-e', 'candidateSha256', candidateSha, instrument],
    {stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true});
  let seeded = '';
  seed.stdout.on('data', chunk => { seeded += chunk; });
  seed.stderr.on('data', chunk => { seeded += chunk; });
  const seedTimeout = setTimeout(() => seed.kill(), 180_000);
  try { assert.equal(await new Promise((accept, reject) => {
    seed.once('error', reject); seed.once('close', accept);
  }), 0, seeded); }
  finally { clearTimeout(seedTimeout); }
  assert(sent && /OK \(1 test\)/.test(seeded), seeded);
  run('reverse', '--remove', reverse);
  install(candidate, '-r');
  assert.equal(installedUid(), uid, 'Android assigned a new package UID.');
  const execute = name => assert.match(run('shell', 'am', 'instrument', '-w', '-e', 'class',
    `${testClass}#${name}`, instrument), /OK \(1 test\)/);
  execute('verifyInstallOverOffline');
  const start = run('shell', 'am', 'start', '-W', '-n', `${packageName}/com.vaultorandroid.MainActivity`);
  assert.match(start, /Status: ok/);
  run('shell', 'am', 'force-stop', packageName);
  execute('verifyInstallOverOffline');
  run('reverse', reverse, reverse);
  execute('reconnectToOriginalHost');
  console.log(JSON.stringify({serial, packageName, fromCode: 32, toCode: 36,
    predecessorSha256: originalSha, candidateSha256: candidateSha,
    retained: ['paired profile', 'saved offline note', 'Review draft', 'pending Review', 'collected original', 'reader preferences'],
    originalUpdaterVerification: true, originalHostReconnect: true, restartReadback: true}));
} finally {
  log?.kill();
  try { run('shell', 'rm', '-f', candidateFixture); } catch {}
  if (reverse) { try { run('reverse', '--remove', reverse); } catch {} }
  if (owner.exitCode === null) owner.stdin.end('{"stop":true}\n');
  lines.close();
}
