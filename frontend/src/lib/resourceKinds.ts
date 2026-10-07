import { FileText, Paperclip, Box, Folder } from 'lucide-react';
import type { Resource } from '../types';
export const collectionKind = { type: 'collection', label: 'Collection', plural: 'Collections', icon: Folder };
export const resourceKinds = [
  { type: 'note', label: 'Note', plural: 'Notes', icon: FileText, action: 'Open note', mode: 'editor' },
  { type: 'file', label: 'File', plural: 'Files', icon: Paperclip, action: 'Preview file', mode: 'preview' },
] as const;
export function resourceKind(type: string) {
  return resourceKinds.find(kind => kind.type === type) ?? { type, label: type || 'Resource', plural: type || 'Resources', icon: Box, action: 'Unsupported resource type', mode: 'unsupported' };
}
export function resourceDescription(resource: Pick<Resource, 'type' | 'mimeType' | 'title'>) {
  const kind = resourceKind(resource.type);
  if (kind.mode !== 'preview') return kind.label;
  const mime = resource.mimeType ?? '';
  const format = mime === 'application/pdf' ? 'PDF' : mime.startsWith('image/') ? 'Image' : mime.startsWith('audio/') ? 'Audio' : mime.startsWith('video/') ? 'Video' : mime.startsWith('text/') ? 'Text' : '';
  return format ? `${kind.label} · ${format}` : kind.label;
}
