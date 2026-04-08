import { NodeViewWrapper, NodeViewContent } from '@tiptap/react';
import type { NodeViewProps } from '@tiptap/react';
import { createPortal } from 'react-dom';
import { useState, useCallback, useEffect, useRef } from 'react';
import { Copy, Check, ChevronDown } from 'lucide-react';
import { useAnchoredPortalPosition } from '../../lib/useAnchoredPortalPosition';

const LANGUAGES = [
  { value: '', label: 'Plain Text' },
  { value: 'javascript', label: 'JavaScript' },
  { value: 'typescript', label: 'TypeScript' },
  { value: 'python', label: 'Python' },
  { value: 'java', label: 'Java' },
  { value: 'go', label: 'Go' },
  { value: 'rust', label: 'Rust' },
  { value: 'c', label: 'C' },
  { value: 'cpp', label: 'C++' },
  { value: 'csharp', label: 'C#' },
  { value: 'ruby', label: 'Ruby' },
  { value: 'php', label: 'PHP' },
  { value: 'swift', label: 'Swift' },
  { value: 'kotlin', label: 'Kotlin' },
  { value: 'bash', label: 'Bash' },
  { value: 'shell', label: 'Shell' },
  { value: 'sql', label: 'SQL' },
  { value: 'html', label: 'HTML' },
  { value: 'css', label: 'CSS' },
  { value: 'json', label: 'JSON' },
  { value: 'xml', label: 'XML' },
  { value: 'yaml', label: 'YAML' },
  { value: 'markdown', label: 'Markdown' },
  { value: 'dockerfile', label: 'Dockerfile' },
  { value: 'graphql', label: 'GraphQL' },
  { value: 'diff', label: 'Diff' },
  { value: 'ini', label: 'INI' },
];

export default function CodeBlockView({ node, updateAttributes }: NodeViewProps) {
  const [copied, setCopied] = useState(false);
  const [showLangPicker, setShowLangPicker] = useState(false);
  const [langSearch, setLangSearch] = useState('');
  const codeRef = useRef<HTMLPreElement>(null);
  const languageTriggerRef = useRef<HTMLDivElement>(null);
  const languageMenuRef = useRef<HTMLDivElement>(null);
  const { position: langMenuPosition } = useAnchoredPortalPosition(showLangPicker, languageTriggerRef, {
    width: 220,
    minWidth: 220,
    offset: 8,
  });

  const currentLang = node.attrs.language || '';
  const displayLang = LANGUAGES.find(l => l.value === currentLang)?.label || currentLang || 'Plain Text';

  const handleCopy = useCallback(() => {
    const text = node.textContent;
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [node]);

  const handleLangSelect = useCallback((lang: string) => {
    updateAttributes({ language: lang });
    setShowLangPicker(false);
    setLangSearch('');
  }, [updateAttributes]);

  const filteredLangs = LANGUAGES.filter(l =>
    l.label.toLowerCase().includes(langSearch.toLowerCase()) ||
    l.value.toLowerCase().includes(langSearch.toLowerCase())
  );

  useEffect(() => {
    if (!showLangPicker) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target;
      if (
        target instanceof Node &&
        (languageTriggerRef.current?.contains(target) || languageMenuRef.current?.contains(target))
      ) {
        return;
      }

      setShowLangPicker(false);
    };

    document.addEventListener('mousedown', handlePointerDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
    };
  }, [showLangPicker]);

  return (
    <NodeViewWrapper className="relative group my-4">
      <div className="overflow-hidden rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-2)] shadow-[0_6px_16px_rgba(15,23,42,0.06)]">
        {/* Header bar */}
        <div className="flex items-center justify-between border-b border-[var(--border-subtle)] bg-[var(--surface-3)] px-4 py-2 text-xs">
          {/* Language selector */}
          <div ref={languageTriggerRef} className="relative">
            <button
              onClick={() => setShowLangPicker(!showLangPicker)}
              className="flex items-center gap-1.5 rounded-md px-2 py-1 text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-4)] hover:text-[var(--text-primary)]"
              contentEditable={false}
            >
              <span className="font-medium">{displayLang}</span>
              <ChevronDown size={12} />
            </button>

            {showLangPicker && langMenuPosition && createPortal(
              <div
                ref={languageMenuRef}
                className="overflow-hidden rounded-xl border border-[var(--border-strong)] bg-[var(--surface-2)] shadow-[0_20px_38px_rgba(15,23,42,0.14)]"
                style={{
                  position: 'fixed',
                  top: langMenuPosition.top,
                  left: langMenuPosition.left,
                  width: langMenuPosition.width,
                  maxHeight: langMenuPosition.maxHeight,
                  transform: langMenuPosition.placement === 'top' ? 'translateY(-100%)' : undefined,
                  zIndex: 1100,
                }}
                contentEditable={false}
              >
                <div className="border-b border-[var(--border-subtle)] p-1.5">
                  <input
                    type="text"
                    placeholder="Search..."
                    className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-3)] px-2.5 py-1.5 text-xs text-[var(--text-primary)] outline-none transition-all duration-150 placeholder:text-[var(--text-tertiary)] hover:border-[var(--border-strong)] focus:border-[var(--accent)] focus:shadow-[0_0_0_3px_rgba(59,130,246,0.12)]"
                    value={langSearch}
                    onChange={e => setLangSearch(e.target.value)}
                    autoFocus
                  />
                </div>
                <div className="max-h-48 overflow-y-auto p-1">
                  {filteredLangs.map(lang => (
                    <button
                      key={lang.value}
                      onClick={() => handleLangSelect(lang.value)}
                      className={`block w-full rounded-lg px-3 py-1.5 text-left text-xs transition-colors ${
                        lang.value === currentLang
                          ? 'bg-primary text-primary-foreground'
                          : 'text-[var(--text-primary)] hover:bg-[var(--surface-3)]'
                      }`}
                    >
                      {lang.label}
                    </button>
                  ))}
                </div>
              </div>,
              document.body,
            )}
          </div>

          {/* Copy button */}
          <button
            onClick={handleCopy}
            className="flex items-center gap-1.5 rounded-md px-2 py-1 text-[var(--text-tertiary)] transition-colors hover:bg-[var(--surface-4)] hover:text-[var(--text-primary)]"
            contentEditable={false}
          >
            {copied ? (
              <>
                <Check size={13} className="text-green-400" />
                <span className="text-green-400 font-medium">Copied</span>
              </>
            ) : (
              <>
                <Copy size={13} />
                <span className="font-medium">Copy</span>
              </>
            )}
          </button>
        </div>

        {/* Code content */}
        <pre ref={codeRef} className="overflow-x-auto bg-[var(--surface-2)] p-4 text-sm leading-relaxed !m-0 !rounded-none !border-0 text-[var(--text-primary)]">
          <NodeViewContent />
        </pre>
      </div>
    </NodeViewWrapper>
  );
}
