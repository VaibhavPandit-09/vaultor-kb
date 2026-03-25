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
      <div className="rounded-xl overflow-hidden border border-slate-700 bg-slate-900 dark:bg-slate-950">
        {/* Header bar */}
        <div className="flex items-center justify-between px-4 py-2 bg-slate-800 dark:bg-slate-900 border-b border-slate-700 text-xs">
          {/* Language selector */}
          <div className="relative">
            <button
              onClick={() => setShowLangPicker(!showLangPicker)}
              className="flex items-center gap-1.5 px-2 py-1 rounded-md text-slate-300 hover:text-white hover:bg-slate-700 transition-colors"
              contentEditable={false}
            >
              <span className="font-medium">{displayLang}</span>
              <ChevronDown size={12} />
            </button>

            {showLangPicker && (
              <div
                className="absolute top-full left-0 mt-1 z-50 w-48 bg-slate-800 border border-slate-600 rounded-lg shadow-2xl overflow-hidden"
                contentEditable={false}
              >
                <div className="p-1.5 border-b border-slate-700">
                  <input
                    type="text"
                    placeholder="Search..."
                    className="w-full px-2 py-1 bg-slate-900 border border-slate-600 rounded text-xs text-white placeholder:text-slate-500 outline-none focus:border-indigo-500"
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
                          : 'text-slate-300 hover:bg-slate-700'
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
            className="flex items-center gap-1.5 px-2 py-1 rounded-md text-slate-400 hover:text-white hover:bg-slate-700 transition-colors"
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
        <pre ref={codeRef} className="!m-0 !rounded-none !border-0 p-4 text-sm leading-relaxed overflow-x-auto text-slate-100">
          <NodeViewContent />
        </pre>
      </div>
    </NodeViewWrapper>
  );
}
