/** Native HTML and table paste keep their existing owners. Ask before
 * converting explicit Markdown or text with clear Markdown syntax. */
export function markdownClipboard(clipboard:Pick<DataTransfer,'getData'>) {
  const markdown=clipboard.getData('text/markdown');
  if(markdown.trim())return markdown;
  if(clipboard.getData('text/html').trim())return null;
  const text=clipboard.getData('text/plain');
  if(!text||text.length>1024*1024)return null;
  const unmistakable=/^ {0,3}(?:#{1,6}\s+\S|(?:```|~~~)[^\r\n]*$|[-*+] \[[ xX]\] )/m.test(text)||
    /\|[^\r\n]+\r?\n[ :|-]*-{3}[ :|-]*\|/m.test(text)||
    /\*\*[^*\r\n]+\*\*|\[[^\]\r\n]+\]\(https?:\/\/[^)]+\)/.test(text);
  const listOrQuote=text.split(/\r?\n/).filter(line=>/^ {0,3}(?:[-*+] |\d+[.)] |> )\S/.test(line)).length>=2;
  return unmistakable||listOrQuote?text:null;
}
