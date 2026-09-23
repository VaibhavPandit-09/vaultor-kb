// @vitest-environment jsdom
import { createRef } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import TableRow from '@tiptap/extension-table-row';
import TableCell from '@tiptap/extension-table-cell';
import TableHeader from '@tiptap/extension-table-header';
import { WorkspaceTable } from './WorkspaceTable';
import { TableWorkspace, ensureTableIdentity } from './TableWorkspace';
import TableControls from './TableControls';
import { tableOverlayHost, tableToolbarPosition, visibleEditorBounds } from './tableOverlayGeometry';
import { EscapeManagerProvider } from '../../lib/escape/EscapeManagerProvider';

const editors: Editor[] = [];
afterEach(() => { cleanup(); editors.splice(0).forEach(e => e.destroy()); vi.restoreAllMocks(); vi.unstubAllGlobals(); document.body.innerHTML = ''; Reflect.deleteProperty(document, 'fullscreenElement'); });

it('anchors to the table, follows its visible edge, clamps narrow panes and hides offscreen tables', () => {
  const pane = { top: 100, left: 100, right: 800, bottom: 700 };
  expect(tableToolbarPosition({ top: 300, left: 150, right: 750, bottom: 600 }, pane, 300, 40)).toMatchObject({ top: 236, left: 444 });
  expect(tableToolbarPosition({ top: 50, left: 150, right: 750, bottom: 600 }, pane, 300, 40)?.top).toBe(106);
  expect(tableToolbarPosition({ top: 300, left: 0, right: 750, bottom: 600 }, { ...pane, right: 330 }, 300, 40)).toMatchObject({ left: 106, maxWidth: 218 });
  expect(tableToolbarPosition({ top: -200, left: 150, right: 750, bottom: 50 }, pane, 300, 40)).toBeNull();
  expect(tableToolbarPosition({ top: 300, left: 150, right: 750, bottom: 332 }, pane, 300, 40)).not.toBeNull();
});

async function mountControls(fullscreen = false, status: 'saved' | 'saving' | 'failed' = 'saved') {
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => window.setTimeout(() => callback(0), 0));
  vi.stubGlobal('cancelAnimationFrame', (id: number) => window.clearTimeout(id));
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function(this: HTMLElement) {
    return { top: 300, left: 100, right: 700, bottom: 600, width: 600, height: 300, x: 100, y: 300, toJSON: () => ({}) };
  });
  const ref = createRef<HTMLDivElement>();
  const container = document.createElement('div');
  document.body.appendChild(container); ref.current = container;
  const editor = new Editor({ element: container, extensions: [StarterKit, WorkspaceTable, TableWorkspace, TableRow, TableCell, TableHeader], content: '<table><tr><th>Name</th><th>Value</th></tr><tr><td>A</td><td>1</td></tr></table><p>After</p>' });
  editors.push(editor); editor.commands.setTextSelection(4);
  if (fullscreen) Object.defineProperty(document, 'fullscreenElement', { configurable: true, get: () => container });
  const retry = vi.fn();
  const result = render(<EscapeManagerProvider><TableControls editor={editor} active containerRef={ref} noteTitle="Inventory" saveStatus={status} onRetrySave={retry} /></EscapeManagerProvider>);
  await screen.findByRole('toolbar');
  return { editor, container, ref, result, retry };
}

it('preserves the cell selection, uses separate popovers, and dismisses on Escape/outside click', async () => {
  const { editor, container } = await mountControls();
  const before = editor.state.selection.toJSON();
  const filter = screen.getByRole('button', { name: 'Filter' });
  fireEvent.mouseDown(filter); fireEvent.click(filter);
  await screen.findByRole('dialog', { name: 'Filter rows' });
  expect(editor.state.selection.toJSON()).toEqual(before);
  expect(container.querySelector('.table-tools')).toBeNull(); // Portal, not document content.
  fireEvent.keyDown(window, { key: 'Escape' });
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  fireEvent.click(screen.getByRole('button', { name: 'More' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Copy / export…' }));
  await screen.findByRole('dialog', { name: 'Copy / export' });
  expect(screen.queryByLabelText('Condition')).toBeNull();
  fireEvent.pointerDown(document.body);
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  act(() => editor.commands.setTextSelection(editor.state.doc.content.size - 1));
  await waitFor(() => expect(screen.queryByRole('toolbar')).toBeNull());
});

it('places both toolbar and popover inside the owning fullscreen editor', async () => {
  const { container } = await mountControls(true);
  expect(tableOverlayHost(container)).toBe(container);
  expect(container.contains(screen.getByRole('toolbar'))).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'Column' }));
  expect(container.contains(await screen.findByRole('dialog', { name: 'Column actions' }))).toBe(true);
  expect(tableOverlayHost(document.createElement('div'))).toBe(document.body);
});

it('ignores the former pane clipping rectangle while fullscreen', () => {
  const pane = document.createElement('div'), container = document.createElement('div');
  pane.style.overflowX = 'hidden'; pane.style.overflowY = 'auto';
  pane.appendChild(container); document.body.appendChild(pane);
  vi.spyOn(pane, 'getBoundingClientRect').mockReturnValue({ top: 100, left: 300, right: 600, bottom: 500 } as DOMRect);
  expect(visibleEditorBounds(container)).toMatchObject({ top: 100, left: 300, right: 600, bottom: 500 });
  Object.defineProperty(document, 'fullscreenElement', { configurable: true, get: () => container });
  expect(visibleEditorBounds(container)).toEqual({ top: 0, left: 0, right: window.innerWidth, bottom: window.innerHeight });
});

it('uses a dedicated expanded header with live save status, retry and a docked filter panel', async () => {
  const { editor, container, ref, result, retry } = await mountControls(true, 'saving');
  expect(screen.getByText('Inventory')).toBeTruthy();
  expect(container.querySelector('.table-tools')).toBeNull();
  expect(screen.getByRole('button', { name: 'Saving…' })).toBeTruthy();
  result.rerender(<EscapeManagerProvider><TableControls editor={editor} active containerRef={ref} noteTitle="Renamed inventory" saveStatus="failed" onRetrySave={retry} /></EscapeManagerProvider>);
  fireEvent.click(screen.getByRole('button', { name: 'Retry save' })); expect(retry).toHaveBeenCalledOnce();
  expect(screen.getByText('Renamed inventory')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Filters' }));
  expect(screen.getByRole('region', { name: 'Table filters' }).closest('.table-expanded-chrome')).toBeTruthy();
  fireEvent.pointerDown(editor.view.dom); expect(screen.getByRole('region', { name: 'Table filters' })).toBeTruthy();
  fireEvent.keyDown(window, { key: 'Escape' });
  await waitFor(() => expect(screen.queryByRole('region', { name: 'Table filters' })).toBeNull());
});

it('keeps the same document and history through expanded editing and return', async () => {
  const { editor, container } = await mountControls();
  const request = vi.fn(async () => {
    Object.defineProperty(document, 'fullscreenElement', { configurable: true, get: () => container });
    document.dispatchEvent(new Event('fullscreenchange'));
  });
  Object.defineProperty(container, 'requestFullscreen', { configurable: true, value: request });
  const exit = vi.fn(async () => { Reflect.deleteProperty(document, 'fullscreenElement'); document.dispatchEvent(new Event('fullscreenchange')); });
  Object.defineProperty(document, 'exitFullscreen', { configurable: true, value: exit });
  act(() => { ensureTableIdentity(editor); });
  const before = editor.getJSON();
  fireEvent.click(screen.getByRole('button', { name: 'Expand table' }));
  await screen.findByRole('button', { name: 'Return to note' });
  expect(editor.getJSON()).toEqual(before); // Entry does not resize or duplicate content.
  fireEvent.click(screen.getByRole('button', { name: 'Row' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Insert below' }));
  const changed = editor.getJSON(); expect(changed).not.toEqual(before);
  fireEvent.click(screen.getByRole('button', { name: 'Return to note' }));
  await screen.findByRole('button', { name: 'Expand table' });
  expect(editor.getJSON()).toEqual(changed); expect(exit).toHaveBeenCalledOnce();
  act(() => editor.commands.undo()); expect(editor.getJSON()).toEqual(before);
  Reflect.deleteProperty(document, 'exitFullscreen');
});
