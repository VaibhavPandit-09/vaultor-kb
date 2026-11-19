import {invoke} from '@tauri-apps/api/core';
import type {Editor, JSONContent, Range} from '@tiptap/core';
import {captureImportTarget,type ImportTarget} from '../lib/importTarget';

export type EditorFileReview = {target: ImportTarget; content: JSONContent[]; format: 'table' | 'markdown'};

export async function prepareEditorFile(editor: Editor, range: Range, format: 'table' | 'markdown'): Promise<EditorFileReview | undefined> {
  const target = captureImportTarget(editor, range);
  let worker: Worker | undefined;
  let prepared = false;
  try {
    const source = await invoke<string | null>('pick_editor_text', {format});
    if (source === null) return;
    target.assertValid();
    const importer = new Worker(new URL('./editorImport.worker.ts', import.meta.url), {type: 'module'});
    worker = importer;
    const content = await new Promise<JSONContent[]>((resolve, reject) => {
      importer.onmessage = ({data}: MessageEvent<{content?: JSONContent[]; error?: string}>) => {
        if (data.content) resolve(data.content);
        else reject(new Error(data.error ?? 'Could not read editor content'));
      };
      importer.onerror = () => reject(new Error('The editor file parser could not finish'));
      importer.postMessage({format, source});
    });
    target.assertValid();
    editor.schema.nodeFromJSON({type:'doc',content}).check();
    prepared = true;
    return {target,content,format};
  } finally {
    worker?.terminate();
    if (!prepared) target.dispose();
  }
}
