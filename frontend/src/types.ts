import type { JSONContent } from '@tiptap/core';
export interface Tag {
  id: string;
  name: string;
  color: string;
}

export type ResourceType = 'note' | 'file';

export interface Resource {
  id: string;
  type: ResourceType;
  title: string;
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
