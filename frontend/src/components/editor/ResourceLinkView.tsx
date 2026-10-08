import { type NodeViewProps, NodeViewWrapper } from '@tiptap/react';
import { resourceKind,resourcePresentation,resourceDescription } from '../../lib/resourceKinds';
import {useResourceSummary} from '../../lib/resourceSummaries';
import { openResourceLink } from '../../lib/resourceLinkNavigation';

export default function ResourceLinkView({ node, editor }: NodeViewProps) {
  const { resourceId, label, type } = node.attrs;
  const summary=useResourceSummary(resourceId);
  const kind = resourceKind(type), Icon = summary?resourcePresentation(summary).icon:kind.icon;
  return <NodeViewWrapper as="span" className="resource-link-node" contentEditable={false}>
    <button type="button" aria-label={`Open ${summary?resourceDescription(summary):kind.label} · ${label || 'resource'}`} className="resource-link-chip" title={kind.mode === 'editor' ? kind.action+' · Ctrl/Cmd-click for another pane' : kind.action}
      onClick={event => { event.preventDefault(); event.stopPropagation(); openResourceLink(editor, resourceId, event.ctrlKey || event.metaKey); }}>
      <Icon size={14} aria-hidden="true" /><span>{label || 'Resource'}</span>
    </button>
  </NodeViewWrapper>;
}
