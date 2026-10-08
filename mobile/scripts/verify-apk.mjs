import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, mkdir, copyFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
const root = resolve(import.meta.dirname, '..');
const trust = JSON.parse(
  await readFile(join(root, 'release-trust.json'), 'utf8'),
);
const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
const lock = JSON.parse(
  await readFile(join(root, 'package-lock.json'), 'utf8'),
);
const gradle = await readFile(join(root, 'android/app/build.gradle'), 'utf8');
const expectedCode = Number(/versionCode\s+(\d+)/.exec(gradle)?.[1]);
const expectedName = /versionName\s+"([^"]+)"/.exec(gradle)?.[1];
if (
  lock.version !== pkg.version ||
  lock.packages[''].version !== pkg.version ||
  expectedName !== pkg.version ||
  !Number.isSafeInteger(expectedCode) ||
  expectedCode < 1
)
  throw Error('Package/lock/Gradle release versions disagree.');
const sdk = process.env.ANDROID_HOME;
if (!sdk) throw Error('Set ANDROID_HOME to the verified SDK.');
const apk = resolve(
  process.argv[2] ||
    join(root, 'android/app/build/outputs/apk/release/app-release.apk'),
);
const tools = join(sdk, 'build-tools/37.0.0');
const run = (name, args) =>
  execFileSync(join(tools, name), args, { encoding: 'utf8' });
if (!process.env.JAVA_HOME) throw Error('Set JAVA_HOME to the Android JDK.');
const signer = execFileSync(
  join(
    process.env.JAVA_HOME,
    'bin',
    process.platform === 'win32' ? 'java.exe' : 'java',
  ),
  [
    '-jar',
    join(tools, 'lib/apksigner.jar'),
    'verify',
    '--verbose',
    '--print-certs',
    apk,
  ],
  { encoding: 'utf8' },
);
const fingerprints = [
  ...signer.matchAll(/certificate SHA-256 digest: ([a-f0-9]+)/gi),
].map(m => m[1].toLowerCase());
const fingerprint = fingerprints[0];
if (!fingerprint || fingerprints.some(value => value !== trust.signerSha256))
  throw Error('Original APK signing identity mismatch.');
const info = run(process.platform === 'win32' ? 'aapt.exe' : 'aapt', [
  'dump',
  'badging',
  apk,
]);
const identity =
  /package: name='([^']+)' versionCode='([0-9]+)' versionName='([^']+)'/.exec(
    info,
  );
if (
  !identity ||
  identity[1] !== trust.applicationId ||
  identity[3] !== pkg.version ||
  Number(identity[2]) !== expectedCode
)
  throw Error('APK identity/version mismatch.');
if (!info.includes(`sdkVersion:'${trust.minimumApi}'`))
  throw Error('Minimum Android API mismatch.');
if (!info.includes("targetSdkVersion:'37'"))
  throw Error('Target Android API mismatch.');
if (info.includes('application-debuggable'))
  throw Error('Debug APK cannot be published.');
run(process.platform === 'win32' ? 'zipalign.exe' : 'zipalign', [
  '-c',
  '-P',
  '16',
  '4',
  apk,
]);
if (!info.includes("'arm64-v8a'") || !info.includes("'x86_64'"))
  throw Error('Phone and emulator ABIs are required.');
const bytes = await readFile(apk),
  sha = createHash('sha256').update(bytes).digest('hex');
const name = `Vaultor-Android-${pkg.version}.apk`,
  out = join(root, 'releases', pkg.version);
await mkdir(out, { recursive: true });
await copyFile(apk, join(out, name));
await writeFile(join(out, 'SHA256SUMS.txt'), `${sha}  ${name}\n`);
const manifest = {
  sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: root,
    encoding: 'utf8',
  }).trim(),
  applicationId: identity[1],
  versionName: identity[3],
  versionCode: Number(identity[2]),
  minimumApi: trust.minimumApi,
  apiProtocol: trust.apiProtocol,
  signerSha256: fingerprint,
  sha256: sha,
  size: bytes.length,
  apk: name,
};
await writeFile(
  join(out, 'android-release.json'),
  JSON.stringify(manifest, null, 2) + '\n',
);
console.log(JSON.stringify(manifest, null, 2));
