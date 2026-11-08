import { useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ArrowLeft, BookOpen, Search } from 'lucide-react';
import AppModal from './AppModal';
import { articles, catalogue, headingId, helpArticle, helpExcerpt, helpLink, searchHelp, type HelpPlatform } from '../../lib/help';
import { getShortcutCategories, isMac } from '../../lib/shortcuts';
import { useSettings } from '../../lib/settings';
import { getPlatform } from '../../lib/platform';
import './HelpCenter.css';

type Location = { article: string; hash: string; query: string; area: string; scroll: number };
const location = (article = ''): Location => ({ article: helpArticle(article)?.id ?? '', hash: '', query: '', area: '', scroll: 0 });
function text(children: ReactNode): string {
  if (typeof children === 'string' || typeof children === 'number') return String(children);
  if (Array.isArray(children)) return children.map(text).join('');
  if (children && typeof children === 'object' && 'props' in children) return text((children.props as { children?: ReactNode }).children);
  return '';
}
export default function HelpCenter({ open, topic, onClose }: { open: boolean; topic: string; onClose: () => void }) {
  return open ? <HelpReader key={topic} topic={topic} onClose={onClose} /> : null;
}
function HelpReader({ topic, onClose }: { topic: string; onClose: () => void }) {
  const [current, setCurrent] = useState(() => location(topic));
  const [history, setHistory] = useState<Location[]>([]);
  const [copied, setCopied] = useState('');
  const root = useRef<HTMLDivElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  // After AppModal registers ownership, legacy parent surfaces can safely yield focus.
  useLayoutEffect(() => { root.current?.querySelector('input')?.focus({ preventScroll: true }); }, []);
  const { resolvedShortcuts } = useSettings();
  const platform: HelpPlatform = window.vaultorDesktop ? isMac ? 'macos' : 'windows' : 'browser';
  const shortcuts = useMemo(() => getShortcutCategories(resolvedShortcuts, Boolean(getPlatform().resourceClipboard)), [resolvedShortcuts]);
  const shortcutText = shortcuts.flatMap(group => group.items.map(item => item.description + ' ' + item.keys.join('+'))).join(' ');
  const results = useMemo(() => searchHelp(current.query, shortcutText), [current.query, shortcutText]);
  const article = helpArticle(current.article);
  const scrollBody = () => root.current?.closest('.app-modal-body') as HTMLElement | null;
  function show(next: Location, back = false) {
    if (!back) setHistory(previous => [...previous, { ...current, scroll: scrollBody()?.scrollTop ?? 0 }].slice(-50));
    setCurrent(next); setCopied('');
    requestAnimationFrame(() => {
      heading.current?.focus({ preventScroll: true });
      const target = next.hash ? root.current?.querySelector<HTMLElement>('[id="' + next.hash + '"]') : null;
      if (target) target.scrollIntoView({ block: 'start' }); else scrollBody()?.scrollTo?.({ top: next.scroll });
    });
  }
  const openArticle = (id: string, hash = '') => show({ ...location(id), hash });
  function follow(href: string) {
    const link = helpLink(href, current.article);
    if (link && 'article' in link) openArticle(link.article, link.hash);
  }
  const headingComponent = (level: 1 | 2 | 3 | 4 | 5 | 6, children: ReactNode) => {
    const Tag = `h${level}` as const;
    return <Tag id={headingId(text(children))}>{children}</Tag>;
  };
  return <AppModal open title="Help Center" onClose={onClose} widthClassName="max-w-4xl">
    <div ref={root} className="help-center">
      <nav className="help-navigation" aria-label="Help navigation">
        <button type="button" className="library-button" disabled={!history.length} onClick={() => { const previous = history.at(-1); if (previous) { setHistory(value => value.slice(0, -1)); show(previous, true); } }}><ArrowLeft size={15} />Back</button>
        <button type="button" className="library-button" onClick={() => show(location())}><BookOpen size={15} />Help home</button>
        <span className="help-platform">{platform === 'macos' ? 'Mac Apple Silicon' : platform === 'windows' ? 'Windows' : 'Browser'} · Help {catalogue.contentVersion}</span>
      </nav>
      <label className="help-search"><Search size={16} /><input autoFocus aria-label="Search Help" placeholder="Search features, tasks or shortcuts…" value={current.query} onChange={event => setCurrent(value => ({ ...value, query: event.target.value }))} onKeyDown={event => { if (event.key === 'ArrowDown') { event.preventDefault(); root.current?.querySelector<HTMLButtonElement>('[data-help-result]')?.focus(); } }} /></label>
      <h2 ref={heading} tabIndex={-1} className="help-title">{current.query.trim() ? 'Help search results' : article?.title ?? 'How can Vaultor help?'}</h2>
      {current.query.trim() ? <section aria-label="Help search results"><p role="status">{results.length} {results.length === 1 ? 'topic' : 'topics'}</p>{results.map(result => <button type="button" data-help-result className="help-result" key={result.id} onClick={() => openArticle(result.id)}><strong>{result.title}</strong><span>{helpExcerpt(result.content)}</span></button>)}{!results.length && <p>No topics match. Try fewer words or browse Help home.</p>}</section> : article ? <>
        <div className="help-article-tools"><button type="button" className="library-button" onClick={() => { void getPlatform().writeClipboard(article.content).then(() => setCopied('Article copied.')).catch(() => setCopied('Copy unavailable. Select the text and use Copy.')); }}>Copy article</button><span role="status">{copied}</span></div>
        <details><summary>On this page</summary><ul>{article.content.split('\n').filter(line => /^## /.test(line)).map(line => <li key={line}><button type="button" className="help-link" onClick={() => openArticle(article.id, headingId(line.slice(3)))}>{line.slice(3)}</button></li>)}</ul></details>
        <article className="help-prose"><ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml components={{
          h1: ({ children }) => headingComponent(1, children), h2: ({ children }) => headingComponent(2, children), h3: ({ children }) => headingComponent(3, children), h4: ({ children }) => headingComponent(4, children), h5: ({ children }) => headingComponent(5, children), h6: ({ children }) => headingComponent(6, children),
          a: ({ href, children }) => { const link = helpLink(href ?? '', article.id); return link && 'external' in link ? <a href={link.external} target="_blank" rel="noopener noreferrer">{children}</a> : link ? <button type="button" className="help-link" onClick={() => follow(href!)}>{children}</button> : <span>{children}</span>; },
          img: ({ alt }) => <span>{alt}</span>,
        }}>{article.content.replace(/^# [^\n]+\n/, '')}</ReactMarkdown></article>
        {article.id === 'shortcuts' && <section aria-label="Current keyboard bindings">{shortcuts.map(group => <section key={group.category}><h3>{group.category}</h3><dl className="help-shortcuts">{group.items.map(item => <div key={item.description}><dt>{item.description}</dt><dd><kbd>{item.keys.join(' + ')}</kbd></dd></div>)}</dl></section>)}</section>}
        <section aria-label="Documented capabilities"><h3>Capabilities and availability</h3>{catalogue.features.filter(feature => feature.article === article.id).map(feature => <div key={feature.id} className="help-capability"><strong>{feature.name}</strong><span>{feature.availability[platform].status}{'verifiedVersion' in feature.availability[platform] ? ' · verified ' + feature.availability[platform].verifiedVersion : ''}</span>{feature.limitations.map(item => <p key={item}>{item}</p>)}</div>)}</section>
        <nav aria-label="Related Help" className="help-related"><h3>Related topics</h3>{[...new Set([...article.content.matchAll(/\]\(([a-z0-9-]+)\.md/g)].map(match => match[1]))].map(id => <button key={id} className="help-link" onClick={() => openArticle(id)}>{helpArticle(id)?.title}</button>)}</nav>
      </> : <>
        <p>Practical, offline instructions for your knowledge workspace. Help stays separate from your notes.</p>
        <div className="help-start">{['getting-started', 'shortcuts', 'platforms', 'whats-new'].map(id => <button className="library-button" key={id} onClick={() => openArticle(id)}>{helpArticle(id)?.title}</button>)}</div>
        <label>Browse by area <select value={current.area} onChange={event => setCurrent(value => ({ ...value, area: event.target.value }))}><option value="">All areas</option>{catalogue.areas.map(area => <option key={area}>{area}</option>)}</select></label>
        <div className="help-topics">{articles.filter(item => !current.area || item.area === current.area).map(item => <button data-help-result type="button" className="help-result" key={item.id} onClick={() => openArticle(item.id)}><strong>{item.title}</strong><span>{item.area}</span></button>)}</div>
        <h3>Browse by task</h3><div className="help-tasks">{catalogue.features.map(feature => <button type="button" className="help-link" key={feature.id} onClick={() => openArticle(feature.article)}>{feature.name}<small> · {feature.availability[platform].status}</small></button>)}</div>
      </>}
    </div>
  </AppModal>;
}
