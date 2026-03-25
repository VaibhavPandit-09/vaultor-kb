import { useState, useEffect, useMemo } from 'react';
import { AlertTriangle } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import Papa from 'papaparse';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import api from '../lib/api';
import type { Resource } from '../types';

const MAX_PREVIEW_SIZE = 1 * 1024 * 1024; // 1MB

const CODE_EXTENSIONS: Record<string, string> = {
  js: 'javascript', jsx: 'jsx', ts: 'typescript', tsx: 'tsx',
  py: 'python', rb: 'ruby', java: 'java', go: 'go',
  rs: 'rust', c: 'c', cpp: 'cpp', h: 'c', cs: 'csharp',
  sh: 'bash', bash: 'bash', zsh: 'bash',
  json: 'json', yaml: 'yaml', yml: 'yaml', toml: 'toml',
  xml: 'xml', html: 'html', css: 'css', scss: 'scss',
  sql: 'sql', graphql: 'graphql', dockerfile: 'docker',
  kt: 'kotlin', swift: 'swift', r: 'r', lua: 'lua',
  php: 'php', pl: 'perl', ex: 'elixir', hs: 'haskell',
};

function getExtension(title: string): string {
  const parts = title.split('.');
  return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : '';
}

function getPreviewType(mime: string | null | undefined, title: string): string {
  if (!mime) return 'fallback';
  if (mime === 'application/pdf') return 'pdf';
  if (mime.startsWith('image/')) return 'image';
  if (mime === 'text/csv' || mime === 'application/csv') return 'csv';
  if (mime === 'text/markdown' || mime === 'text/x-markdown' || getExtension(title) === 'md') return 'markdown';
  
  const ext = getExtension(title);
  if (CODE_EXTENSIONS[ext]) return 'code';
  
  if (mime.startsWith('text/') || mime === 'application/json' || mime === 'application/xml' || mime === 'application/yaml') return 'text';
  
  return 'fallback';
}

/** Fetch raw file bytes as a blob URL through the authenticated API client */
function useAuthBlobUrl(resourceId: string, mimeType?: string | null) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let revoke: string | null = null;
    api.get(`/resources/${resourceId}/raw`, { responseType: 'blob' })
      .then(res => {
        const blob = new Blob([res.data], { type: mimeType || 'application/octet-stream' });
        const url = URL.createObjectURL(blob);
        revoke = url;
        setBlobUrl(url);
      })
      .catch(() => setError(true));

    return () => { if (revoke) URL.revokeObjectURL(revoke); };
  }, [resourceId, mimeType]);

  return { blobUrl, error };
}

/** Fetch raw text content through the authenticated API client */
function useAuthTextContent(resourceId: string) {
  const [content, setContent] = useState<string | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    api.get(`/resources/${resourceId}/raw`, { responseType: 'text' })
      .then(r => setContent(r.data))
      .catch(() => setError(true));
  }, [resourceId]);

  return { content, error };
}

interface FilePreviewProps {
  resource: Resource;
}

export default function FilePreview({ resource }: FilePreviewProps) {
  const tooLarge = (resource.size ?? 0) > MAX_PREVIEW_SIZE;
  const previewType = tooLarge ? 'fallback' : getPreviewType(resource.mimeType, resource.title);

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <div className="flex h-9 items-center gap-3 border-b border-white/5 px-4 text-[11px] text-slate-400">
        {resource.mimeType && <span>{resource.mimeType}</span>}
        {resource.size != null && <span>{formatSize(resource.size)}</span>}
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        <PreviewResolver type={previewType} resource={resource} tooLarge={tooLarge} />
      </div>
    </div>
  );
}

function PreviewResolver({ type, resource, tooLarge }: { type: string; resource: Resource; tooLarge: boolean }) {
  if (tooLarge) {
    return <FallbackViewer message="File too large for inline preview (> 1 MB)" />;
  }

  switch (type) {
    case 'pdf': return <PDFViewer resource={resource} />;
    case 'image': return <ImageViewer resource={resource} />;
    case 'csv': return <CSVViewer resourceId={resource.id} />;
    case 'markdown': return <MarkdownViewer resourceId={resource.id} />;
    case 'code': return <CodeViewer resourceId={resource.id} title={resource.title} />;
    case 'text': return <TextViewer resourceId={resource.id} />;
    default: return <FallbackViewer message="Preview not available for this file type" />;
  }
}

function PDFViewer({ resource }: { resource: Resource }) {
  const { blobUrl, error } = useAuthBlobUrl(resource.id, 'application/pdf');
  if (error) return <FallbackViewer message="Failed to load PDF" />;
  if (!blobUrl) return <LoadingSpinner />;
  return <iframe src={`${blobUrl}#toolbar=0`} className="h-full min-h-[calc(100vh-9rem)] w-full bg-white" title="PDF Preview" />;
}

function ImageViewer({ resource }: { resource: Resource }) {
  const { blobUrl, error } = useAuthBlobUrl(resource.id, resource.mimeType);
  if (error) return <FallbackViewer message="Failed to load image" />;
  if (!blobUrl) return <LoadingSpinner />;
  return (
    <div className="flex min-h-full items-center justify-center bg-background">
      <img src={blobUrl} alt={resource.title} className="max-h-full max-w-full object-contain" />
    </div>
  );
}

function TextViewer({ resourceId }: { resourceId: string }) {
  const { content, error } = useAuthTextContent(resourceId);
  if (error) return <FallbackViewer message="Failed to load file content" />;
  if (content === null) return <LoadingSpinner />;
  return (
    <pre className="min-h-full whitespace-pre-wrap break-words bg-background px-4 py-3 text-sm font-mono">
      {content}
    </pre>
  );
}

function MarkdownViewer({ resourceId }: { resourceId: string }) {
  const { content, error } = useAuthTextContent(resourceId);
  if (error) return <FallbackViewer message="Failed to load markdown" />;
  if (content === null) return <LoadingSpinner />;
  return (
    <div className="prose prose-slate dark:prose-invert max-w-none px-6 py-5">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
    </div>
  );
}

function CSVViewer({ resourceId }: { resourceId: string }) {
  const { content, error } = useAuthTextContent(resourceId);

  const parsed = useMemo(() => {
    if (!content) return null;
    return Papa.parse(content, { header: true, skipEmptyLines: true });
  }, [content]);

  if (error) return <FallbackViewer message="Failed to load CSV" />;
  if (!parsed) return <LoadingSpinner />;
  if (!parsed.data.length) return <div className="text-slate-400 text-sm">Empty CSV file</div>;

  const headers = parsed.meta.fields || [];
  const rows = parsed.data as Record<string, string>[];

  return (
    <div className="overflow-auto">
      <table className="w-full text-sm">
        <thead className="sticky top-0 bg-slate-100 dark:bg-slate-800">
          <tr>
            {headers.map((h, i) => (
              <th key={i} className="border-b border-white/5 px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider whitespace-nowrap">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, 500).map((row, ri) => (
            <tr key={ri} className="border-b border-white/5 transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/30">
              {headers.map((h, ci) => (
                <td key={ci} className="px-4 py-2.5 whitespace-nowrap">{row[h]}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length > 500 && <div className="p-3 text-xs text-slate-400 text-center">Showing first 500 of {rows.length} rows</div>}
    </div>
  );
}

function CodeViewer({ resourceId, title }: { resourceId: string; title: string }) {
  const { content, error } = useAuthTextContent(resourceId);
  const lang = CODE_EXTENSIONS[getExtension(title)] || 'text';

  if (error) return <FallbackViewer message="Failed to load code" />;
  if (content === null) return <LoadingSpinner />;

  return (
    <div className="overflow-auto">
      <SyntaxHighlighter
        language={lang}
        style={oneDark}
        customStyle={{ margin: 0, borderRadius: 0, fontSize: '0.8125rem', minHeight: '100%' }}
        showLineNumbers
      >
        {content}
      </SyntaxHighlighter>
    </div>
  );
}

function FallbackViewer({ message }: { message: string }) {
  return (
    <div className="flex min-h-full flex-col items-center justify-center py-16 text-slate-400">
      <AlertTriangle size={48} className="mb-4 opacity-30" />
      <p className="text-sm">{message}</p>
    </div>
  );
}

function LoadingSpinner() {
  return <div className="flex min-h-full items-center justify-center text-sm text-slate-400 animate-pulse">Loading preview...</div>;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
