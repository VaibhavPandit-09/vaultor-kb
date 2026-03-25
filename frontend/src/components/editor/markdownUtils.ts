/**
 * Markdown ↔ HTML conversion using the `marked` library.
 * Tiptap natively parses HTML, so the flow is:
 *   Paste/Upload → raw markdown → marked → HTML → Tiptap's setContent/insertContent
 * This is far more robust than hand-rolled parsers.
 */
import { marked } from 'marked';

// Configure marked for clean output
marked.setOptions({
  gfm: true,
  breaks: false,
});

/** Convert raw markdown string to HTML that Tiptap can parse */
export function markdownToHtml(md: string): string {
  return marked.parse(md, { async: false }) as string;
}

/**
 * Convert Tiptap JSON doc back to markdown string (for export).
 * This is a best-effort converter for the block types we support.
 */
export function tiptapToMarkdown(doc: any): string {
  if (!doc?.content) return '';
  return doc.content.map((node: any) => nodeToMarkdown(node)).join('\n\n');
}

function nodeToMarkdown(node: any): string {
  switch (node.type) {
    case 'heading': {
      const level = node.attrs?.level || 1;
      const prefix = '#'.repeat(level);
      return `${prefix} ${inlineToMarkdown(node.content)}`;
    }
    case 'paragraph':
      return inlineToMarkdown(node.content);
    case 'bulletList':
      return (node.content || [])
        .map((item: any) => {
          const text = item.content?.map((c: any) => inlineToMarkdown(c.content)).join('\n  ') || '';
          return `- ${text}`;
        })
        .join('\n');
    case 'orderedList':
      return (node.content || [])
        .map((item: any, i: number) => {
          const text = item.content?.map((c: any) => inlineToMarkdown(c.content)).join('\n  ') || '';
          return `${i + 1}. ${text}`;
        })
        .join('\n');
    case 'codeBlock': {
      const lang = node.attrs?.language || '';
      return '```' + lang + '\n' + (node.content?.[0]?.text || '') + '\n```';
    }
    case 'blockquote':
      return (node.content || [])
        .map((p: any) => `> ${inlineToMarkdown(p.content)}`)
        .join('\n');
    case 'horizontalRule':
      return '---';
    default:
      return inlineToMarkdown(node.content);
  }
}

function inlineToMarkdown(content?: any[]): string {
  if (!content) return '';
  return content.map((node: any) => {
    if (node.type === 'hardBreak') return '\n';
    let text = node.text || '';
    if (node.marks) {
      for (const mark of node.marks) {
        switch (mark.type) {
          case 'bold': text = `**${text}**`; break;
          case 'italic': text = `*${text}*`; break;
          case 'code': text = `\`${text}\``; break;
          case 'strike': text = `~~${text}~~`; break;
        }
      }
    }
    return text;
  }).join('');
}
