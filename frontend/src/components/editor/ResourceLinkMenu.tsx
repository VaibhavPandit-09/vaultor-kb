import React, { useState, useEffect, useCallback } from 'react';
import { Editor } from '@tiptap/react';
import { FileText, File, Search } from 'lucide-react';
import api from '../../lib/api';

interface ResourceLinkMenuProps {
  editor: Editor;
  range: { from: number; to: number };
  query: string;
  selectedIndex: number;
  onClose: () => void;
  onUpdateFiltered: (count: number) => void;
}

export default function ResourceLinkMenu({ editor, range, query, selectedIndex, onClose, onUpdateFiltered }: ResourceLinkMenuProps) {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  useEffect(() => {
    let active = true;
    const fetchResources = async () => {
      setLoading(true);
      try {
        const { data } = await api.get(`/resources/search?q=${encodeURIComponent(query)}`);
        if (active) {
          const fetchedItems = (data || []).map((r: any) => ({ ...r, virtual: false }));
          const hasExact = fetchedItems.some((r: any) => r.title.toLowerCase() === query.trim().toLowerCase());
          
          if (!hasExact && query.trim().length > 0) {
            fetchedItems.push({ id: 'create-note', type: 'note', title: `Create Note "${query}"`, virtual: true });
            fetchedItems.push({ id: 'create-file', type: 'file', title: `Upload File`, virtual: true });
          }
          
          setItems(fetchedItems);
          onUpdateFiltered(fetchedItems.length);
        }
      } catch (e) {
        console.error('Failed to fetch resources', e);
      } finally {
        if (active) setLoading(false);
      }
    };
    
    const timer = setTimeout(fetchResources, 150);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [query, onUpdateFiltered]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) {
      onClose();
      return;
    }
    try {
      const formData = new FormData();
      formData.append('file', file);
      const { data } = await api.post('/resources/file', formData);
      if (editor) {
        editor.chain().focus()
          .deleteRange(range)
          .insertContent({
            type: 'resourceLink',
            attrs: { resourceId: data.id, label: data.title, type: data.type }
          })
          .insertContent(' ')
          .run();
        onClose();
      }
    } catch (err) {
      console.error('File upload failed', err);
    }
  };

  const selectItem = useCallback(async (index: number) => {
    const item = items[index];
    if (!item) return;

    let resourceId = item.id;
    let label = item.title;
    let type = item.type;

    if (item.virtual) {
      if (type === 'file') {
        fileInputRef.current?.click();
        return;
      }
      try {
        const { data } = await api.post('/resources', {
          type: 'note',
          title: query.trim(),
          content: { type: 'doc', content: [] },
        });
        resourceId = data.id;
        label = data.title;
        type = data.type;
      } catch (e) {
        console.error('Failed to create resource inline', e);
        return;
      }
    }

    if (editor) {
      editor.chain().focus()
        .deleteRange(range)
        .insertContent({
          type: 'resourceLink',
          attrs: { resourceId, label, type }
        })
        .insertContent(' ')
        .run();
      onClose();
    }
  }, [items, editor, range, query, onClose]);

  useEffect(() => {
    (window as any).__executeResourceLink = () => {
      selectItem(selectedIndex);
    };
  }, [selectedIndex, selectItem]);

  return (
    <div className="w-64 bg-slate-900 border border-slate-700/50 rounded-xl shadow-2xl py-2 flex flex-col max-h-80 overflow-y-auto z-50 animate-in fade-in zoom-in-95 duration-100 tippy-box">
      <input type="file" className="hidden" ref={fileInputRef} onChange={handleFileUpload} />
      <div className="px-3 py-1.5 mb-1 flex justify-between items-center text-xs font-semibold text-slate-400 border-b border-slate-700/50">
        <span className="flex items-center"><Search size={12} className="mr-1.5" /> Link Resource</span>
        {loading && <span className="animate-pulse">Searching...</span>}
      </div>
      
      {items.length === 0 && !loading && (
        <div className="px-3 py-4 text-center text-sm text-slate-500">
          No resources found
        </div>
      )}
      
      {items.map((item, index) => (
        <button
          key={item.id}
          className={`w-full flex items-center px-3 py-2 text-sm text-left transition-colors ${
            index === selectedIndex ? 'bg-primary/20 text-blue-400 font-medium' : 'text-slate-300 hover:bg-slate-800'
          }`}
          onClick={() => selectItem(index)}
        >
          {item.type === 'note' ? <FileText size={16} className={`mr-3 ${item.virtual ? 'text-green-400' : 'opacity-70'}`} /> : <File size={16} className={`mr-3 ${item.virtual ? 'text-green-400' : 'opacity-70'}`} />}
          <div className={`flex-1 truncate ${item.virtual ? 'italic text-slate-400' : ''}`}>
            {item.virtual ? item.title : item.title}
          </div>
          <div className="text-[10px] ml-2 uppercase opacity-50 font-semibold tracking-wider">
             {item.virtual ? 'New' : item.type}
          </div>
        </button>
      ))}
    </div>
  );
}
