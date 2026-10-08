import { FileText, Paperclip, Box, Folder, ImageIcon, FileType, Music, Video, FileCode } from 'lucide-react';
import type { Resource } from '../types';
export const collectionKind = { type: 'collection', label: 'Collection', plural: 'Collections', icon: Folder };
export const resourceKinds = [
  { type: 'note', label: 'Note', plural: 'Notes', icon: FileText, action: 'Open note', mode: 'editor' },
  { type: 'file', label: 'File', plural: 'Files', icon: Paperclip, action: 'Preview file', mode: 'preview' },
] as const;
export const fileCategories = [
  {type:'image',label:'Image',plural:'Images',icon:ImageIcon},
  {type:'pdf',label:'PDF',plural:'PDFs',icon:FileType},
  {type:'audio',label:'Audio',plural:'Audio',icon:Music},
  {type:'video',label:'Video',plural:'Video',icon:Video},
  {type:'text',label:'Text file',plural:'Text files',icon:FileCode},
  {type:'other',label:'File',plural:'Other files',icon:Paperclip},
] as const;
export const resourceFilters=[...resourceKinds,...fileCategories];
export function resourceFilter(value:string) {return fileCategories.some(c=>c.type===value)?{type:'file',category:value}:{type:value};}
export function filterLabel(value:string) {return resourceFilters.find(c=>c.type===value)?.plural??resourceKind(value).plural;}
export function resourcePresentation(resource:Pick<Resource,'type'|'mimeType'>) {
  const kind=resourceKind(resource.type);if(resource.type!=='file')return kind;
  const mime=(resource.mimeType??'').toLowerCase().split(';')[0];
  const category=mime.startsWith('image/')?'image':mime==='application/pdf'?'pdf':mime.startsWith('audio/')?'audio':mime.startsWith('video/')?'video':mime.startsWith('text/')||['application/json','application/xml','application/javascript'].includes(mime)?'text':'other';
  return {...kind,...fileCategories.find(c=>c.type===category)!};
}
export function resourceKind(type: string) {
  return resourceKinds.find(kind => kind.type === type) ?? { type, label: type || 'Resource', plural: type || 'Resources', icon: Box, action: 'Unsupported resource type', mode: 'unsupported' };
}
export function resourceDescription(resource: Pick<Resource, 'type' | 'mimeType' | 'title'>) {
  const kind = resourcePresentation(resource);
  if(resource.type!=='file')return kind.label;
  const mime=(resource.mimeType??'').split(';')[0],format=mime.split('/')[1]?.replace(/^x-/,'').toUpperCase();
  return format&&format!=='OCTET-STREAM'&&format!==kind.label.toUpperCase()?`${kind.label} · ${format}`:kind.label;
}
