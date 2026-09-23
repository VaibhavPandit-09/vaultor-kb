// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { render, fireEvent, screen, cleanup } from '@testing-library/react';
import { pickFiles } from './filePicker';
import { captureImportTarget } from './importTarget';
import { classifyFile, convertText, readImportText } from './fileImports';
import SlashMenu from '../components/editor/SlashMenu';
import { SlashCommandExtension, slashCommandPluginKey } from '../components/editor/SlashCommandExtension';
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

it.each(['.md', '.csv', ''])('waits for activation key release for every picker type %s, cleans up on cancel', async accept => {
  const click = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => {});
  fireEvent.keyDown(window, { key: 'Enter' });
  const selected = pickFiles(accept);
  expect(click).not.toHaveBeenCalled();
  fireEvent.keyUp(window, { key: 'Enter' });
  expect(click).toHaveBeenCalledOnce();
  const input = document.querySelector('input[type=file]')!;
  fireEvent(input, new Event('cancel'));
  expect(await selected).toEqual([]);
  expect(document.querySelector('input[type=file]')).toBeNull();
});

it('mouse selection opens immediately, prevents duplicate pickers and returns all selected files', async () => {
  const click = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => {});
  const pending = pickFiles('', true);
  expect(click).toHaveBeenCalledOnce();
  await expect(pickFiles()).rejects.toThrow('already open');
  const input = document.querySelector('input[type=file]')!;
  const files = [new File(['a'], 'one.txt'), new File(['b'], 'two.pdf')];
  fireEvent.change(input, { target: { files } });
  expect(await pending).toEqual(files);
});

it.each(['/', '/uploa', '/upload markdown'])('captures the current full command %s and replaces it as one undo step', async command => {
  const editor = new Editor({ extensions: [StarterKit], content: `<p>Before</p><p>${command}</p>` });
  await vi.waitFor(() => expect(editor.isInitialized).toBe(true));
  try {
    const from = 9;
    const target = captureImportTarget(editor, { from, to: from + command.length });
    // Typing elsewhere must map the pending command rather than redirect insertion.
    editor.commands.insertContentAt(1, 'X');
    target.insert([{ type: 'paragraph', content: [{ type: 'text', text: 'Imported' }] }]);
    expect(editor.getText()).toContain('XBefore');
    expect(editor.getText()).toContain('Imported');
    expect(editor.getText()).not.toContain(command);
    editor.commands.undo();
    expect(editor.getText()).toContain(command);
    expect(editor.getText()).toContain('XBefore');
  } finally { editor.destroy(); }
});

it('rejects changed or closed targets and cancellation does not mutate the document', async () => {
  const editor = new Editor({ extensions: [StarterKit], content: '<p>/uploa</p>' });
  await vi.waitFor(() => expect(editor.isInitialized).toBe(true));
  const before = editor.getJSON();
  const cancelled = captureImportTarget(editor, { from: 1, to: 7 }); cancelled.dispose();
  expect(editor.getJSON()).toEqual(before);
  const target = captureImportTarget(editor, { from: 1, to: 7 });
  editor.commands.insertContentAt(3, 'changed');
  expect(() => target.insert([{ type: 'paragraph' }])).toThrow('location changed');
  target.dispose(); editor.destroy();
  expect(() => target.assertValid()).toThrow();
});

it('mouse command execution uses plugin range rather than stale menu props', () => {
  const editor = new Editor({ extensions: [StarterKit, SlashCommandExtension], content: '<p>/uploa</p>' });
  editor.view.dispatch(editor.state.tr.setMeta(slashCommandPluginKey, { active: true, query: 'uploa', range: { from: 1, to: 7 } }));
  const upload = vi.fn(); const close = vi.fn();
  const originalScroll = Element.prototype.scrollIntoView;
  Element.prototype.scrollIntoView = vi.fn();
  try {
    render(<SlashMenu editor={editor} range={{ from: 1, to: 2 }} query="uploa" selectedIndex={0} onClose={close} onUploadMd={upload} onUploadCsv={upload} />);
    fireEvent.click(screen.getByText('Upload Markdown'));
    expect(upload).toHaveBeenCalledWith(editor, { from: 1, to: 7 });
    expect(close.mock.invocationCallOrder[0]).toBeLessThan(upload.mock.invocationCallOrder[0]);
    expect(editor.getText()).toBe('/uploa');
  } finally { Element.prototype.scrollIntoView = originalScroll; editor.destroy(); }
});

it('classifies text imports and preserves asset references without embedding remote images', () => {
  expect(['a.md','a.txt','a.py','a.tsv','a.pdf'].map(name => classifyFile(name))).toEqual(['markdown','text','code','csv','binary']);
  const result = convertText('markdown', '# Title\n\n![diagram](images/a.png)\n\n[Local](other.md)');
  expect(result.warnings).toHaveLength(2);
  expect(JSON.stringify(result.doc)).toContain('images/a.png');
  expect(JSON.stringify(result.doc)).toContain('other.md');
  expect(result.doc.content?.[0].type).toBe('heading');
  expect(convertText('code', 'const x = 1').doc.content?.[0].type).toBe('codeBlock');
});

it('rejects binary/invalid encoding, excessive text and malformed CSV before creation', async () => {
  const file = new File([''], 'bad.txt');
  Object.defineProperty(file, 'arrayBuffer', { value: async () => new Uint8Array([0xff, 0x01]).buffer });
  await expect(readImportText(file)).rejects.toThrow('encoding');
  Object.defineProperty(file, 'size', { value: 6 * 1024 * 1024 });
  await expect(readImportText(file)).rejects.toThrow('5 MiB');
  expect(() => convertText('csv', 'a,b\n"unclosed')).toThrow('unclosed');
  const result = convertText('csv', 'a,b\n1,2\n,\n3,4\n');
  expect(result.doc.content?.[0].content).toHaveLength(4);
  expect(result.doc.content?.[0].attrs).toBeUndefined();
});
