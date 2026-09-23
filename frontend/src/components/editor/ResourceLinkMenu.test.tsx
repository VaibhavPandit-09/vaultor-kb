// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import ResourceLinkMenu from './ResourceLinkMenu';
import api from '../../lib/api';
vi.mock('../../lib/api', () => ({ default: { get: vi.fn() } }));
afterEach(() => { cleanup(); vi.resetAllMocks(); });
it('routes keyboard uploads to the originating editor when two link menus exist', async () => {
  vi.mocked(api.get).mockResolvedValue({ data: [] });
  const first = new Editor({ extensions: [StarterKit], content: '<p>[[one</p>' });
  const second = new Editor({ extensions: [StarterKit], content: '<p>[[two</p>' });
  const upload = vi.fn(); const noop = () => {};
  try {
    const ui = render(<>
      <ResourceLinkMenu editor={first} range={{ from: 1, to: 6 }} query="one" selectedIndex={1} onClose={noop} onUpdateFiltered={noop} onRequestFileUpload={upload} />
      <ResourceLinkMenu editor={second} range={{ from: 1, to: 6 }} query="two" selectedIndex={1} onClose={noop} onUpdateFiltered={noop} onRequestFileUpload={upload} />
    </>);
    await waitFor(() => expect(screen.getAllByText('Upload File')).toHaveLength(2));
    act(() => { window.__executeResourceLink?.(first.view); });
    expect(upload).toHaveBeenCalledWith(first, { from: 1, to: 6 });
    expect(first.getText()).toBe('[[one'); expect(second.getText()).toBe('[[two');
    ui.unmount();
    expect(window.__resourceLinkExecutors).toBeUndefined();
  } finally { first.destroy(); second.destroy(); }
});
