import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

export function managedFixture(bytes) {
  const paragraph = index => ({
    type: 'paragraph',
    content: [{ type: 'text', text: `Paragraph ${index}. Vaultor comparable managed-note benchmark. ` +
      'Writing, reading and organizing knowledge. '.repeat(12) }],
  });
  const doc = { type: 'doc', content: [] };
  let size = JSON.stringify(doc).length;
  while (size < bytes - 700) {
    const node = paragraph(doc.content.length);
    size += JSON.stringify(node).length + Number(doc.content.length > 0);
    doc.content.push(node);
  }
  doc.content.at(-1).content[0].text += 'z'.repeat(bytes - size);
  assert.equal(Buffer.byteLength(JSON.stringify(doc)), bytes);
  return doc;
}

export async function openManagedNote(evaluate, architecture, id, title, marker) {
  const pane = architecture === 'tauri-rust' ? 'data-note-id' : 'data-note-pane';
  const scope = `document.querySelector(${JSON.stringify(`[${pane}="${id}"]`)})`;
  const rowSelector = architecture === 'tauri-rust' ? '[data-row-open]' : '.workspace-view .library-view button';
  const selected = architecture === 'tauri-rust'
    ? 'Boolean(editor)'
    : "document.querySelector('.note-title[data-active=true]')?.textContent.trim() === title";
  return evaluate(`(async () => {
    const title = ${JSON.stringify(title)};
    const visible = node => !node.closest('[hidden],[inert]') && node.getClientRects().length > 0;
    const row = [...document.querySelectorAll(${JSON.stringify(rowSelector)})].find(node =>
      (node.title === title || node.getAttribute('aria-label') === title || node.textContent.trim() === title) && visible(node));
    if (!row) throw Error('Missing visible Library row: ' + title);
    const start = performance.now();
    row.click();
    while (performance.now() - start < 20_000) {
      const editor = ${scope}?.querySelector('.tiptap');
      if (${selected} && editor?.contentEditable === 'true' && visible(editor) &&
          editor.lastElementChild?.textContent.includes(${JSON.stringify(marker)})) {
        await new Promise(resolve => requestAnimationFrame(resolve));
        return performance.now() - start;
      }
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    throw Error('Usable editor unavailable for ' + title);
  })()`);
}

export async function qualifyManagedHistory(evaluate, selector, record) {
  const result = await evaluate(`(async () => {
    const pane = document.querySelector(${JSON.stringify(selector)});
    const editor = pane?.querySelector('.tiptap')?.editor;
    if (!editor?.isEditable) throw Error('Active editor unavailable for history');
    const edited = editor.state.doc;
    const frame = () => new Promise(resolve => requestAnimationFrame(resolve));
    const startedUndo = performance.now();
    if (!editor.commands.undo() || editor.state.doc.eq(edited)) throw Error('Undo did not change the edited document');
    await frame();
    const undo = performance.now() - startedUndo;
    const startedRedo = performance.now();
    if (!editor.commands.redo() || !editor.state.doc.eq(edited)) throw Error('Redo did not restore the complete edited document');
    await frame();
    const redo = performance.now() - startedRedo;
    const status = () => [...pane.querySelectorAll('button[aria-label]')].map(node => node.getAttribute('aria-label'));
    while (performance.now() - startedRedo < 20_000) {
      const labels = status();
      if (labels.some(label => /Save failed|review required/i.test(label))) throw Error('Save failed after Redo');
      if (labels.includes('All changes saved')) return {undo, redo, saved:performance.now() - startedRedo};
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    throw Error('Save indicator did not reach Saved');
  })()`);
  record('undo', result.undo, 'Tiptap command through first rAF, with document change verified.');
  record('redo', result.redo, 'Tiptap command through first rAF, with complete document restoration verified.');
  record('redo_to_saved_indicator', result.saved, 'Final Redo through Saved indicator, includes autosave delay and 10 ms polls. Restart readback validates persistence.');
}

export async function measureTitleSearch({ evaluate, cdp, wait, record, architecture }) {
  const selector = architecture === 'tauri-rust'
    ? '.next-library-region:not([hidden]) [data-row-open]'
    : '.workspace-view:not([hidden]) .library-view [data-resource-row] button[title]';
  await evaluate(`(() => {
    const library = [...document.querySelectorAll('button')].find(button =>
      button.textContent.trim() === 'Library' && button.getClientRects().length);
    if (!library) throw Error('Visible Library navigation unavailable');
    library.click();
  })()`);
  await wait(`document.querySelectorAll(${JSON.stringify(selector)}).length >= 90`, 'Library rows before title search');
  for (let i = 0; i < 12; i++) {
    const title = `Bench note ${String((i * 17) % 100).padStart(3, '0')}`;
    await evaluate(`(() => {
      const field = [...document.querySelectorAll('input[aria-label="Search items"]')].find(node => node.getClientRects().length);
      if (!field) throw Error('Visible Library search input unavailable');
      field.focus();
      field.select();
      field.addEventListener('beforeinput', () => { window.m25SearchStart = performance.now(); }, {once:true});
    })()`);
    await cdp('Input.insertText',{text:title});
    const elapsed = await evaluate(`(async () => {
      const rows = () => [...document.querySelectorAll(${JSON.stringify(selector)})].filter(node =>
        node.getClientRects().length && /^Bench note \\d{3}$/.test(node.title));
      const end = performance.now() + 8_000;
      while (performance.now() < end) {
        const matches = rows();
        if (matches.length === 1 && matches[0].title === ${JSON.stringify(title)}) {
          await new Promise(resolve => requestAnimationFrame(resolve));
          return performance.now() - window.m25SearchStart;
        }
        await new Promise(resolve => setTimeout(resolve,10));
      }
      throw Error('Expected one visible title search result');
    })()`);
    assert(Number.isFinite(elapsed), 'Native title query must deliver beforeinput');
    if (i >= 2) record('title-search', i - 1, 'visible_result', elapsed, 'ms', 'beforeinput to sole matching Library title plus rAF. Includes debounce and 10 ms polls.');
  }
}

// Bounded probe for the protected managed-note publication step. Runs after
// launch has verified the disposable workspace, with no editor or host active.
export async function measureDraftCommit({ evaluate, record, report, content, wire }) {
  const result = await evaluate(`(async () => {
    const content = ${JSON.stringify(content)};
    const note = await benchRequest({kind:'createNote', title:'M25 protected commit'});
    const proof = {token:${JSON.stringify(randomUUID())}, sequence:0};
    let revision = note.revision;
    const samples = [];
    for (let i = 0; i < 24; i++) {
      proof.sequence++;
      content.content[0].content[0].text = 'Protected publication pass ' + i;
      const draft = {kind:'draft', id:note.id, baseRevision:revision, title:note.title, content, ...proof};
      const startDraft = performance.now();
      await benchRequest(draft);
      const draftMs = performance.now() - startDraft;
      const request = ${wire === 'receipt'
        ? "{kind:'commitDraft', id:note.id, revision, proof}"
        : "{kind:'save', id:note.id, revision, title:note.title, content, proof}"};
      const startCommit = performance.now();
      const receipt = await benchRequest(request);
      const commitMs = performance.now() - startCommit;
      if (receipt.revision !== revision + 1) throw Error('Invalid durable revision receipt');
      revision = receipt.revision;
      const saved = await benchRequest({kind:'read', id:note.id});
      const normalized = value => Array.isArray(value) ? value.map(normalized) : value && typeof value === 'object'
        ? Object.fromEntries(Object.keys(value).sort().map(key => [key, normalized(value[key])])) : value;
      if (saved.revision !== revision || JSON.stringify(normalized(saved.content)) !== JSON.stringify(normalized(content)))
        throw Error('Committed content differs from the protected document');
      if ((await benchRequest({kind:'drafts'})).length) throw Error('Committed journal was not cleared');
      if (i >= 4) samples.push({draftMs, commitMs, commitRequestBytes:JSON.stringify(request).length});
    }
    return samples;
  })()`);
  assert.equal(result.length, 20);
  for (const [index, sample] of result.entries()) {
    record('managed-draft-ipc', index + 1, 'protect', sample.draftMs, 'ms', 'Renderer IPC enqueue through durable draft receipt.');
    record('managed-draft-ipc', index + 1, 'commit', sample.commitMs, 'ms', 'Renderer IPC enqueue through SQLite commit and revision receipt.');
    record('managed-draft-ipc', index + 1, 'commit_request_json', sample.commitRequestBytes, 'bytes', 'ASCII request JSON before transport envelope.');
  }
  report.checks.push('Validated each revision, complete committed document and cleared draft after 24 protected publications');
}
