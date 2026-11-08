import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { marked } from '../frontend/node_modules/marked/lib/marked.esm.js';

export const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const slug = text => text.toLowerCase().replace(/[^\p{L}\p{N}\s-]/gu, '').trim().replace(/\s+/g, '-');
const platforms = ['windows', 'macos', 'browser', 'android'];
const version = /^\d+\.\d+\.\d+(?:-[a-z0-9.]+)?$/;
export function loadHelp() {
  const catalogue = JSON.parse(readFileSync(resolve(root, 'docs/help/catalogue.json'), 'utf8'));
  const files = Object.fromEntries(readdirSync(resolve(root, 'docs/help')).filter(p => p.endsWith('.md')).map(p => [p, readFileSync(resolve(root, 'docs/help', p), 'utf8')]));
  return { catalogue, files };
}
export function validateHelp(catalogue, files, evidenceExists = path => existsSync(resolve(root, path))) {
  const errors = [];
  const check = (condition, message) => { if (!condition) errors.push(message); };
  const unique = (values, label) => check(new Set(values).size === values.length, 'Duplicate ' + label);
  check(catalogue.schemaVersion === 1, 'Unsupported schema');
  check(version.test(catalogue.contentVersion ?? ''), 'Invalid Help content version');
  check(/^\d{4}-\d{2}-\d{2}$/.test(catalogue.reviewed), 'Invalid review date');
  unique(catalogue.areas, 'area');
  unique(catalogue.articles.map(a => a.id), 'article id');
  unique(catalogue.articles.map(a => a.path), 'article path');
  unique(catalogue.features.map(f => f.id), 'feature id');
  const articles = new Map(catalogue.articles.map(a => [a.id, a]));
  const featureIds = new Set(catalogue.features.map(f => f.id));
  const headings = new Map();
  const links = [];
  for (const article of catalogue.articles) {
    check(/^[a-z0-9-]+$/.test(article.id) && article.path === article.id + '.md', 'Unsafe article path: ' + article.path);
    check(Boolean(article.title) && catalogue.areas.includes(article.area), 'Invalid article metadata: ' + article.id);
    check(typeof files[article.path] === 'string' && files[article.path].length > 0, 'Missing article: ' + article.path);
    const ids = [];
    marked.walkTokens(marked.lexer(files[article.path] ?? ''), token => {
      if (token.type === 'heading') ids.push(slug(token.text));
      if (token.type === 'link') links.push([article, token.href]);
      check(!['html', 'image'].includes(token.type), 'Unsupported HTML/image in ' + article.id);
    });
    unique(ids, 'heading in ' + article.id);
    headings.set(article.id, new Set(ids));
  }
  check(Object.keys(files).every(path => catalogue.articles.some(a => a.path === path)), 'Uncatalogued Markdown file');
  for (const [article, href] of links) {
    if (/^https?:\/\//i.test(href)) {
      try { const url = new URL(href); check(!url.username && !url.password && href.length <= 8192, 'Unsafe external link: ' + href); } catch { errors.push('Invalid external URL: ' + href); }
      continue;
    }
    const match = /^(?:([a-z0-9-]+)\.md)?(?:#([\p{L}\p{N}-]+))?$/u.exec(href);
    const target = match?.[1] ?? article.id;
    check(Boolean(match) && Boolean(href) && articles.has(target), 'Broken/unsafe internal link: ' + href);
    if (match?.[2]) check(headings.get(target)?.has(match[2]), 'Missing heading: ' + href);
  }
  for (const feature of catalogue.features) {
    check(/^[a-z0-9-]+$/.test(feature.id) && Boolean(feature.name) && Boolean(feature.description), 'Invalid feature: ' + feature.id);
    check(articles.has(feature.article), 'Missing feature article: ' + feature.id);
    for (const field of ['areas', 'screens', 'tasks', 'keywords', 'evidence']) check(Array.isArray(feature[field]) && feature[field].length > 0 && feature[field].every(v => typeof v === 'string' && v.length), 'Invalid ' + field + ': ' + feature.id);
    check(feature.areas.every(a => catalogue.areas.includes(a)), 'Unknown category: ' + feature.id);
    check(Array.isArray(feature.limitations) && Array.isArray(feature.related) && feature.related.every(id => featureIds.has(id)), 'Invalid related/limitations: ' + feature.id);
    check(Object.keys(feature.availability).length === platforms.length && platforms.every(p => feature.availability[p]), 'Invalid platforms: ' + feature.id);
    for (const [platform, value] of Object.entries(feature.availability)) {
      check(platforms.includes(platform) && ['available', 'development', 'unsupported', 'deferred'].includes(value.status), 'Invalid availability: ' + feature.id);
      if (value.verifiedVersion) check(value.status === 'available' && version.test(value.verifiedVersion), 'Invalid verified version: ' + feature.id);
      if (value.introducedVersion) check(value.status === 'available' && version.test(value.introducedVersion), 'Invalid introduced version: ' + feature.id);
    }
    for (const path of feature.evidence) check(!path.includes('..') && !/^(?:[A-Za-z]:|[\\/])/.test(path) && evidenceExists(path), 'Missing/unsafe source evidence: ' + path);
  }
  for (const [platform, value] of Object.entries(catalogue.baseline)) check(platforms.includes(platform) && version.test(value), 'Invalid baseline');
  for (const screen of ['library', 'editor', 'collections', 'tags', 'sources', 'activity', 'settings', 'trash', 'workspaces', 'preview', 'review']) check(articles.has(catalogue.context[screen]), 'Broken contextual mapping: ' + screen);
  for (const id of Object.values(catalogue.context)) check(articles.has(id), 'Unknown contextual article');
  for (const area of catalogue.areas) check(catalogue.articles.some(a => a.area === area), 'Empty category: ' + area);
  return errors;
}
export function helpHashes(catalogue, files) {
  return Object.fromEntries(Object.entries({ 'catalogue.json': JSON.stringify(catalogue), ...files }).map(([path, content]) => [path, createHash('sha256').update(content).digest('hex')]));
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const { catalogue, files } = loadHelp();
    const errors = validateHelp(catalogue, files);
    if (process.argv.includes('--dist')) {
      const bundled = resolve(root, process.argv[process.argv.indexOf('--dist') + 1]);
      const metadata = JSON.parse(readFileSync(resolve(bundled, 'help/provenance.json'), 'utf8'));
      const expected = helpHashes(catalogue, files);
      for (const [path, hash] of Object.entries(expected)) {
        const bytes = readFileSync(resolve(bundled, 'help', path), 'utf8');
        const actual = createHash('sha256').update(path === 'catalogue.json' ? JSON.stringify(JSON.parse(bytes)) : bytes).digest('hex');
        if (hash !== actual || metadata.hashes[path] !== hash) errors.push('Stale/missing bundled Help: ' + path);
      }
    }
    if (errors.length) throw Error(errors.join('\n'));
    console.log(`Help validated: ${catalogue.features.length} features, ${catalogue.articles.length} articles; links, headings, source evidence and metadata valid.`);
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
