import {headingId,helpExcerpt} from './helpText';
export {headingId,helpExcerpt};
import catalogue from '../../../docs/help/catalogue.json';

export { catalogue };
export type HelpPlatform = 'windows' | 'macos' | 'browser' | 'android';
export type HelpArticle = typeof catalogue.articles[number];
const raw = import.meta.glob('../../../docs/help/*.md', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
export const articles = catalogue.articles.map(article => ({ ...article, content: raw['../../../docs/help/' + article.path] ?? '' }));
export const helpArticle = (id: string) => articles.find(article => article.id === id);
export const contextualHelp = (screen: string) => (catalogue.context as Record<string, string>)[screen] ?? '';
export function requestHelp(screen: string) {
  window.dispatchEvent(new CustomEvent('vaultor:help', { detail: screen }));
}
export function helpLink(href: string, current: string): { article: string; hash: string } | { external: string } | null {
  if (/^https?:\/\//i.test(href)) {
    try { const url = new URL(href); return !url.username && !url.password && href.length <= 8192 ? { external: url.href } : null; } catch { return null; }
  }
  const match = /^(?:([a-z0-9-]+)\.md)?(?:#([\p{L}\p{N}-]+))?$/u.exec(href);
  if (!match || !href) return null;
  const article = match[1] ?? current;
  return helpArticle(article) ? { article, hash: match[2] ?? '' } : null;
}
const normalize = (value: string) => value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
// Built once from the exact eagerly bundled content, never from a server or workspace.
const index = articles.map(article => {
  const features = catalogue.features.filter(feature => feature.article === article.id);
  return { article, title: normalize(article.title), metadata: normalize(features.map(f => [f.name, ...f.screens, ...f.tasks, ...f.keywords].join(' ')).join(' ')), body: normalize(article.content) };
});
export function searchHelp(query: string, shortcutText = '') {
  const terms = normalize(query).split(' ').filter(Boolean);
  if (!terms.length) return [];
  return index.map(item => {
    const metadata = item.metadata + (item.article.id === 'shortcuts' ? ' ' + normalize(shortcutText) : '');
    const score = terms.reduce((sum, term) => sum + (item.title.includes(term) ? 8 : 0) + (metadata.includes(term) ? 5 : 0) + (item.body.includes(term) ? 1 : 0), 0);
    const matches = terms.filter(term => (item.title + ' ' + metadata + ' ' + item.body).includes(term)).length;
    return { ...item.article, score: score + (matches === terms.length ? 25 : 0), matches };
  }).filter(item => item.matches >= Math.max(1, Math.ceil(terms.length * .6))).sort((a, b) => b.score - a.score || a.title.localeCompare(b.title));
}
