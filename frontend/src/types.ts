import type { JSONContent } from '@tiptap/core';
export interface Tag {
  id: string;
  name: string;
  color: string;
}

// Unknown server types remain identifiable without being dispatched as files.
export type ResourceType = 'note' | 'file' | (string & {});

export interface Resource {
  id: string;
  type: ResourceType;
  title: string;
  revision?: string;
  searchSnippet?: {text:string;highlights:{start:number;end:number}[]};
  favorite?: boolean;
  collections?: {id: string; name: string}[];
  content?: JSONContent | string | null;
  filePath?: string | null;
  mimeType?: string | null;
  size?: number | null;
  createdAt: string;
  updatedAt: string;
  lastOpenedAt?: string | null;
  tags: Tag[];
}

export type ResourceSummary = Omit<Resource, 'content' | 'filePath'>;

export function isPreviewResource(type: ResourceType) {
  return type === 'file';
}
