// @vitest-environment jsdom
import { StrictMode } from 'react';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { Table } from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableCell from '@tiptap/extension-table-cell';
import TableHeader from '@tiptap/extension-table-header';
import { render, cleanup } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { getItems } from './SlashMenu';
import { markdownToHtml } from './markdownUtils';
import BlockEditor from './BlockEditor';
import { EscapeManagerProvider } from '../../lib/escape/EscapeManagerProvider';
afterEach(cleanup);

it('parses pasted lists/code/tables with valid nullable ordered-list attributes', () => {
  const editor = new Editor({ extensions: [StarterKit, Table, TableRow, TableCell, TableHeader], content: markdownToHtml('1. Are the passwords base64encoded?\n2. Multiple to, cc, bcc?\n\n---\n\n**Worker-Sharing Formula**\n\n1. Initial allocation\n2. Remaining demand\n\n```\nR × demand / total\n```\n\n| Calculation | MANUAL | CURRENT | BACKLOG |\n|---|---|---|---|\n| Additional share | 0.667 | 0.667 | 0.667 |\n| **Final target** | **2** | **2** | **1** |') });
  try {
    const doc = editor.getJSON();
    expect(doc.content?.find(n => n.type === 'orderedList')?.attrs).toMatchObject({ start: 1, type: null });
    expect(doc.content?.some(n => n.type === 'table')).toBe(true);
    expect(doc.content?.some(n => n.type === 'codeBlock')).toBe(true);
  } finally { editor.destroy(); }
});

it('opens CSV and Markdown pickers without scheduling editor focus behind the dialog', () => {
  for (const id of ['upload-csv', 'upload-markdown']) {
    const editor = new Editor({ extensions: [StarterKit], content: '<p>/csv</p>' });
    const focus = vi.spyOn(window, 'requestAnimationFrame');
    const upload = vi.fn(() => expect(editor.getText()).toBe('/csv'));
    try {
      getItems(upload, upload).find(item => item.id === id)!.action(editor, { from: 1, to: 5 });
      expect(upload).toHaveBeenCalledOnce();
      expect(focus).not.toHaveBeenCalled();
    } finally { focus.mockRestore(); editor.destroy(); }
  }
});

it('mounts and unmounts the editor in StrictMode without reading an unavailable view', () => {
  const noop = () => {};
  const result = render(<StrictMode><EscapeManagerProvider><BlockEditor noteTitle="Test note" saveStatus="saved" onRetrySave={() => {}} noteId="test" content={{ type: 'doc', content: [{ type: 'paragraph' }] }} autosaveDelay={0} isActive interactionLocked={false} shouldRestoreFocus={false} onUpdate={noop} onSelectionChange={noop} onActivate={noop} onFocusRestored={noop} onRequestMdUpload={noop} onRequestCsvUpload={noop} onRequestLinkUpload={noop} /></EscapeManagerProvider></StrictMode>);
  expect(result.container.querySelector('.tiptap')).toBeTruthy();
  expect(() => result.unmount()).not.toThrow();
});
