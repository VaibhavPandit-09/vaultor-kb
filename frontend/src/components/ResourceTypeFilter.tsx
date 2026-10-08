import { useState } from 'react';
import { ListFilter, Check } from 'lucide-react';
import LibraryPopover from './LibraryPopover';
import { collectionKind, resourceFilters, filterLabel } from '../lib/resourceKinds';

export default function ResourceTypeFilter({ value, onChange, collections = false, compact = false, label = 'Filter resource type' }: { value: string; onChange: (type: string) => void; collections?: boolean; compact?: boolean; label?: string }) {
  const [query, setQuery] = useState('');
  const kinds = [...(collections ? [collectionKind] : []), ...resourceFilters];
  const current = value === 'all' ? 'All types' : value === 'collection' && collections ? collectionKind.plural : filterLabel(value);
  const options = [{ type: 'all', plural: 'All types' }, ...kinds];
  // Preserve an unrecognized restored filter explicitly instead of silently broadening it.
  if (!options.some(option => option.type === value)) options.push({ type: value, plural: current });
  return <LibraryPopover label={label} className={compact ? 'sidebar-type-filter' : 'library-button'} trigger={<><ListFilter size={15}/>{(!compact || value !== 'all') && <span>{current}</span>}</>}>
    {close => <><input className="organization-input w-full" aria-label="Find a type" placeholder="Find a type…" value={query} onChange={event => setQuery(event.target.value)}/><div className="type-filter-options" role="group" aria-label="Types">{options.filter(option => option.plural.toLowerCase().includes(query.toLowerCase())).map(option => <button key={option.type} className="type-filter-option" aria-pressed={value === option.type} onClick={() => { onChange(option.type); setQuery(''); close(); }}><span>{option.plural}</span>{value === option.type && <Check size={15}/>}</button>)}</div>{!options.some(option => option.plural.toLowerCase().includes(query.toLowerCase())) && <p className="browse-feedback">No matching types.</p>}</>}
  </LibraryPopover>;
}
