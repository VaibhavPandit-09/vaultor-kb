import { describe, expect, it, vi } from 'vitest';
import { inspectWorkspaceDeparture } from './workspaceDeparture';
const offline = () => Promise.reject(new Error('Host stopped'));
const base = () => ({ desktop: true, keepDrafts: false, unsavedNotes: () => false, activity: offline, identity: offline });
describe('leaving an unavailable workspace', () => {
  it('allows a clean offline source without requiring explicit draft retention', async () => {
    await expect(inspectWorkspaceDeparture(base())).resolves.toBeUndefined();
  });
  it('requires explicit retention for dirty notes and allows that retry', async () => {
    await expect(inspectWorkspaceDeparture({ ...base(), unsavedNotes: () => true })).rejects.toMatchObject({ canKeepDrafts: true });
    await expect(inspectWorkspaceDeparture({ ...base(), unsavedNotes: () => true, keepDrafts: true })).resolves.toBeUndefined();
  });
  it('never bypasses a known active transfer, even with keep drafts', async () => {
    await expect(inspectWorkspaceDeparture({ ...base(), keepDrafts: true, activity: async () => ({ active: 1 }) })).rejects.toThrow('active imports/exports');
  });
  it('retains the operation guard when identity is reachable but activity fails', async () => {
    await expect(inspectWorkspaceDeparture({ ...base(), identity: async () => ({ id: 'w', generation: 'g' }) })).rejects.toThrow('Cannot verify server operations');
  });
  it('checks current draft state after requests settle', async () => {
    const unsavedNotes = vi.fn(() => true);
    await expect(inspectWorkspaceDeparture({ ...base(), unsavedNotes })).rejects.toMatchObject({ canKeepDrafts: true });
    expect(unsavedNotes).toHaveBeenCalledOnce();
  });
});
