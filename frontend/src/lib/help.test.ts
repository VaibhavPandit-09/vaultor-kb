import { describe, expect, it } from 'vitest';
import { articles, catalogue, contextualHelp, headingId, helpLink, searchHelp } from './help';
describe('bundled Help', () => {
  it('bundles every canonical article with no workspace access', () => {
    expect(articles).toHaveLength(catalogue.articles.length);
    expect(articles.every(article => article.content.startsWith('# '))).toBe(true);
  });
  for (const [query, id] of [
    ['select multiple notes', 'interactions'], ['drag and drop', 'interactions'],
    ['linked markdown', 'linked-sources'], ['recover deleted note', 'recovery'],
    ['keyboard shortcuts', 'shortcuts'], ['import folder', 'transfers'],
    ['copy resource', 'interactions'], ['open in another pane', 'navigation'],
    ['delete multiple notes', 'recovery'], ['drag note into another note', 'notes'],
  ]) it('finds ' + query, () => expect(searchHelp(query).slice(0, 4).map(item => item.id)).toContain(id));
  it('indexes resolved shortcut text', () => expect(searchHelp('Ctrl+Shift+J', 'Close active note Ctrl+Shift+J').map(item => item.id)).toContain('shortcuts'));
  it('has useful empty and unknown-context behavior', () => {
    expect(searchHelp('')).toEqual([]);
    expect(searchHelp('zzzznonexistent')).toEqual([]);
    expect(contextualHelp('missing')).toBe('');
    expect(contextualHelp('editor')).toBe('notes');
  });
  it('restricts links to bundled targets or safe external URLs', () => {
    for (const value of ['../notes.md', '/notes.md', 'file:///etc/passwd', 'javascript:alert(1)', 'data:text/html,hi', 'https://user:pass@example.com', 'unknown.md', '//example.com', 'notes.md?path=x']) expect(helpLink(value, 'notes')).toBeNull();
    expect(helpLink('notes.md#links-and-mentions', 'library')).toEqual({ article: 'notes', hash: 'links-and-mentions' });
    expect(helpLink('#images', 'notes')).toEqual({ article: 'notes', hash: 'images' });
    expect(helpLink('https://github.com', 'notes')).toEqual({ external: 'https://github.com/' });
    expect(headingId('Copy, paste & links')).toBe('copy-paste-links');
  });
});
