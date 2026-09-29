import { type NodeViewProps, NodeViewWrapper } from '@tiptap/react';
import { FileText, File } from 'lucide-react';
import { openResourceLink } from '../../lib/resourceLinkNavigation';

export default function ResourceLinkView({ node, editor }: NodeViewProps) {
  const { resourceId, label, type } = node.attrs;
  return <NodeViewWrapper as="span" className="inline-flex align-baseline" contentEditable={false}>
    <button type="button" aria-label={`Open ${label || 'resource'}`} className="inline-flex items-center mx-0.5 px-1 py-0.5 bg-primary/10 text-primary rounded hover:bg-primary/20 transition-colors text-sm font-medium border border-primary/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
      onClick={event => { event.preventDefault(); event.stopPropagation(); openResourceLink(editor, resourceId, event.ctrlKey || event.metaKey); }}>
      {type === 'note' ? <FileText size={14} className="mr-1 opacity-70" /> : <File size={14} className="mr-1 opacity-70" />}{label || 'Resource'}
    </button>
  </NodeViewWrapper>;
}
