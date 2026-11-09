import { invoke } from '@tauri-apps/api/core';
import type { JSONContent } from '@tiptap/core';
export type Note = { id: string; title: string; content: JSONContent; revision: number };
export type Summary = Omit<Note, 'content'> & { updatedAt: string };
export type Snapshot = { path: string; collections: { id: string; name: string }[]; settings: { theme?: 'light' | 'dark' | 'oled' } };
type Request =
  | { kind: 'snapshot' }
  | { kind: 'open'; path: string }
  | { kind: 'list'; collection: string | null }
  | { kind: 'createCollection'; name: string }
  | { kind: 'createNote'; title: string; collection: string | null }
  | { kind: 'read'; id: string }
  | { kind: 'save'; id: string; title: string; content: JSONContent; revision: number }
  | { kind: 'setting'; key: 'theme'; value: string };
export function command<T>(request: Request): Promise<T> { return invoke<T>('workspace', { request }); }
