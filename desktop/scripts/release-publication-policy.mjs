/** Published assets are immutable; only explicit missing-platform delivery/retries are admitted. */
export function checkPublicationMode(release, addPlatform) {
  if (release && !release.draft && !addPlatform) throw new Error('Published releases require --add-platform to add a missing verified platform; existing bytes cannot change.');
  if (addPlatform && !release) throw new Error('Create the draft release first; --add-platform requires an existing release.');
}
export function checkIdenticalAsset(local, remote, name) {
  if (local !== remote) throw new Error(`Existing release asset differs: ${name}. Use a new version; do not overwrite.`);
}
