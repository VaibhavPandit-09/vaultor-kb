import { FileText, Paperclip, Box } from 'lucide-react';
export const resourceKinds = [
  { type: 'note', label: 'Note', plural: 'Notes', icon: FileText, action: 'Open note', mode: 'editor' },
  { type: 'file', label: 'File', plural: 'Files', icon: Paperclip, action: 'Preview file', mode: 'preview' },
] as const;
export function resourceKind(type: string) {
  return resourceKinds.find(kind => kind.type === type) ?? { type, label: type, plural: type, icon: Box, action: 'Open resource', mode: 'unsupported' };
}
