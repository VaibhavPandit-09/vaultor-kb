import { NodeViewWrapper } from '@tiptap/react';
import { FileText, File } from 'lucide-react';

export default function ResourceLinkView(props: any) {
  const { node } = props;
  const { resourceId, label, type } = node.attrs;

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if ((window as any).__openResource) {
      (window as any).__openResource(resourceId, type, label);
    }
  };

  return (
    <NodeViewWrapper as="span" className="inline-flex items-center mx-0.5 px-1 py-0.5 bg-primary/10 text-primary rounded cursor-pointer hover:bg-primary/20 transition-colors text-sm font-medium border border-primary/20 align-baseline group" onClick={handleClick}>
      {type === 'note' ? <FileText size={14} className="mr-1 opacity-70 group-hover:opacity-100" /> : <File size={14} className="mr-1 opacity-70 group-hover:opacity-100" />}
      {label || 'Resource'}
    </NodeViewWrapper>
  );
}
