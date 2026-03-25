export interface Tag {
  id: string;
  name: string;
}

export type ResourceType = 'note' | 'file';

export interface Resource {
  id: string;
  type: ResourceType;
  title: string;
  content?: string | null;
  filePath?: string | null;
  mimeType?: string | null;
  size?: number | null;
  createdAt: string;
  updatedAt: string;
  lastOpenedAt?: string | null;
  tags: Tag[];
}

export interface AuthStatus {
  isSetup: boolean;
}

export function isPreviewResource(type: ResourceType) {
  return type === 'file';
}
