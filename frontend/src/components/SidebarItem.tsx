import type React from 'react';
import { Trash2 } from 'lucide-react';
import type { Resource } from '../types';
import { resourceKind } from '../lib/resourceKinds';

export default function SidebarItem({ resource, isActive, onClick, onDelete }: { resource: Resource; isActive: boolean; onClick: () => void; onDelete: (event: React.MouseEvent) => void }) {
  const Icon = resourceKind(resource.type).icon;
  return (
    <div
      className={`group mx-2 mb-0.5 flex cursor-pointer items-center justify-between rounded-lg border-l-2 px-3 py-1.5 transition-all ${
        isActive ? 'border-primary bg-primary/10' : 'border-transparent hover:bg-slate-100 dark:hover:bg-slate-800'
      }`}
    >
      <button onClick={onClick} title={resource.title} className="flex min-w-0 flex-1 items-center overflow-hidden pr-2 text-left">
        <Icon size={14} className={`mr-2 flex-shrink-0 ${isActive ? 'text-primary' : 'text-slate-400'}`} />
        <span className={`truncate text-[13px] ${isActive ? 'font-medium text-primary' : ''}`}>{resource.title}</span>
      </button>
      <button aria-label={`Delete ${resource.title}`} onClick={onDelete} className="flex-shrink-0 p-0.5 text-slate-400 opacity-0 transition-opacity hover:text-red-500 group-hover:opacity-100 focus:opacity-100"><Trash2 size={12} /></button>
    </div>
  );
}
