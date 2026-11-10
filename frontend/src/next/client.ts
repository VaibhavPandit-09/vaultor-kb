import type {LinkedRequest} from './linkedTypes';
import { invoke } from '@tauri-apps/api/core';
import type { JSONContent } from '@tiptap/core';
export type Note = { id: string; title: string; content: JSONContent; revision: number; collections?: string[]; kind?: 'note'|'file' };
export type Summary = Omit<Note, 'content'> & { updatedAt: string };
export type Collection = { id: string; name: string; parentId: string | null };
export type ListCursor = { before: number; anchor: number; scope: string | null };
export type SearchOptions = { query: string; content: boolean; collection: string | null; order: 'created'|'updated'|'title';view?:string;tag?:string|null };
export type SearchCursor = { options: SearchOptions; generation: number; seq: number; key: string };
export type Cursor = ListCursor | SearchCursor;
export type Page = { items: Summary[]; next: Cursor | null; total: number };
export type MembershipReceipt = { requested: number; added: number; removed: number; unchanged: number };
export type Draft = { id: string; title: string; content: JSONContent; baseRevision: number; token: string; sequence: number };
export type DraftSummary = Omit<Draft, 'content'>;
export type Snapshot = { path: string; collections: Collection[]; settings: { theme?: 'light' | 'dark' | 'oled' } };
type Request =
  | { kind: 'snapshot' }
  | {kind:'media';request:Record<string,unknown>}
  | { kind:'organization'; request:Record<string,unknown> }
  | { kind: 'linked'; request: LinkedRequest }
  | { kind: 'open'|'new'; path: string }
  | { kind: 'list'; collection: string | null; cursor?: ListCursor | null; limit?: number }
  | { kind: 'search'; options: SearchOptions; cursor?: SearchCursor | null; limit?: number }
  | { kind: 'createCollection'; name: string; parentId?: string | null }
  | { kind: 'updateCollection'; id: string; name: string; parentId: string | null }
  | { kind: 'membership'; id: string; add: string | null; remove: string | null }
  | { kind: 'bulkMembership'; ids: string[]; add: string | null; remove: string | null }
  | { kind: 'memberships'; id: string }
  | { kind: 'createNote'; title: string; collection: string | null }
  | { kind: 'read'; id: string }
  | { kind: 'save'; id: string; title: string; content: JSONContent; revision: number; proof?: { token: string; sequence: number } }
  | ({ kind: 'draft' } & Draft)
  | { kind: 'drafts' }
  | { kind: 'readDraft'; id: string }
  | { kind: 'discardDraft'; id: string; token: string; sequence: number }
  | { kind: 'rebaseDraft'; id: string; token: string; sequence: number; revision: number }
  | { kind: 'setting'; key: 'theme'; value: string };
export function command<T>(request: Request): Promise<T> { return invoke<T>('workspace', { request }); }

export const org=<T,>(request:Record<string,unknown>)=>command<T>({kind:'organization',request});
