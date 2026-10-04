import { SwitchBlockedError } from './desktop';
import type { Identity } from './sessionStore';

/** An offline source must not trap a clean client. Local recovery is checked by the caller. */
export async function inspectWorkspaceDeparture(options: {
  desktop: boolean;
  keepDrafts: boolean;
  unsavedNotes: () => boolean;
  activity: () => Promise<{ active: number }>;
  identity: () => Promise<Identity>;
}): Promise<Identity | undefined> {
  const [activity, identity] = await Promise.allSettled([
    options.desktop ? options.activity() : Promise.resolve({ active: 0 }), options.identity(),
  ]);
  if (activity.status === 'fulfilled' && activity.value.active) {
    throw new SwitchBlockedError('Wait for active imports/exports to finish before leaving the workspace.');
  }
  if (identity.status === 'rejected') {
    if (!options.keepDrafts && options.unsavedNotes()) {
      throw new SwitchBlockedError('The current server is unavailable. Keep drafts and switch to retain your unsaved notes locally.', true);
    }
    return undefined;
  }
  if (activity.status === 'rejected' && !options.keepDrafts) {
    throw new SwitchBlockedError('Cannot verify server operations. Retry or keep recoverable drafts.', true);
  }
  return identity.value;
}
