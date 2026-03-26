import { NodeViewWrapper, NodeViewContent } from '@tiptap/react';
import type { NodeViewProps } from '@tiptap/react';
import { useState, useCallback, useRef } from 'react';
import { Copy, Check, ChevronDown } from 'lucide-react';

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

  return (
    <NodeViewWrapper className="relative group my-4">
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50 shadow-sm dark:border-slate-700 dark:bg-slate-950">
        {/* Header bar */}
        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-100 px-4 py-2 text-xs dark:border-slate-700 dark:bg-slate-900">
          {/* Language selector */}
          <div className="relative">
            <button
              onClick={() => setShowLangPicker(!showLangPicker)}
              className="flex items-center gap-1.5 rounded-md px-2 py-1 text-slate-500 transition-colors hover:bg-slate-200 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-700 dark:hover:text-white"
              contentEditable={false}
            >
              <span className="font-medium">{displayLang}</span>
              <ChevronDown size={12} />
            </button>

            {showLangPicker && (
              <div
                className="absolute left-0 top-full z-50 mt-1 w-48 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-xl dark:border-slate-600 dark:bg-slate-800"
                contentEditable={false}
              >
                <div className="border-b border-slate-200 p-1.5 dark:border-slate-700">
                  <input
                    type="text"
                    placeholder="Search..."
                    className="w-full rounded border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-slate-700 outline-none placeholder:text-slate-400 focus:border-[var(--accent)] dark:border-slate-600 dark:bg-slate-900 dark:text-white dark:placeholder:text-slate-500"
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
                      className={`block w-full text-left px-3 py-1.5 rounded text-xs transition-colors ${
                        lang.value === currentLang
                          ? 'bg-indigo-600 text-white'
                          : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700'
                      }`}
                    >
                      {lang.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Copy button */}
          <button
            onClick={handleCopy}
            className="flex items-center gap-1.5 rounded-md px-2 py-1 text-slate-400 transition-colors hover:bg-slate-200 hover:text-slate-700 dark:hover:bg-slate-700 dark:hover:text-white"
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
        <pre ref={codeRef} className="overflow-x-auto p-4 text-sm leading-relaxed !m-0 !rounded-none !border-0 text-slate-800 dark:text-slate-100">
          <NodeViewContent />
        </pre>
      </div>
    </NodeViewWrapper>
  );
}
