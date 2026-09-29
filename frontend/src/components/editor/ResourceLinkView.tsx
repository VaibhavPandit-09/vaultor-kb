import { type NodeViewProps, NodeViewWrapper } from '@tiptap/react';
import { FileText, File } from 'lucide-react';
import { openResourceLink } from '../../lib/resourceLinkNavigation';

export default function ResourceLinkView({ node, editor }: NodeViewProps) {
  const { resourceId, label, type } = node.attrs;
  return <NodeViewWrapper as="span" className="resource-link-node" contentEditable={false}>
    <button type="button" aria-label={`Open ${label || 'resource'}`} className="resource-link-chip" title={type === 'note' ? 'Open note · Ctrl/Cmd-click for another pane' : 'Preview file'}
      onClick={event => { event.preventDefault(); event.stopPropagation(); openResourceLink(editor, resourceId, event.ctrlKey || event.metaKey); }}>
      {type === 'note' ? <FileText size={14} aria-hidden="true" /> : <File size={14} aria-hidden="true" />}<span>{label || 'Resource'}</span>
    </button>
  </NodeViewWrapper>;
}
