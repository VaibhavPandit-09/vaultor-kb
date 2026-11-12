import ResourceLinkChip from './ResourceLinkChip';
import { type NodeViewProps, NodeViewWrapper } from '@tiptap/react';
import { resourceKind,resourcePresentation,resourceDescription } from '../../lib/resourceKinds';
import {useResourceSummary} from '../../lib/resourceSummaries';
import { openResourceLink } from '../../lib/resourceLinkNavigation';

export default function ResourceLinkView({ node, editor }: NodeViewProps) {
  const { resourceId, label, type } = node.attrs;
  const summary=useResourceSummary(resourceId);
  const kind = resourceKind(type), Icon = summary?resourcePresentation(summary).icon:kind.icon;
  return <NodeViewWrapper as="span" className="resource-link-node" contentEditable={false}>
    <ResourceLinkChip label={label} description={summary?resourceDescription(summary):kind.label} icon={Icon} action={kind.mode==='editor'?kind.action+' · Ctrl/Cmd-click for another pane':kind.action} onOpen={beside=>openResourceLink(editor,resourceId,beside)}/>
  </NodeViewWrapper>;
}
