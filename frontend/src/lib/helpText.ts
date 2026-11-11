export function helpExcerpt(content: string) {
  return (content.split('\n').find(line => line.length > 60 && !line.startsWith('#')) ?? '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/[*_`]/g, '').slice(0, 240);
}
export function headingId(text: string) {
  return text.toLowerCase().replace(/[^\p{L}\p{N}\s-]/gu, '').trim().replace(/\s+/g, '-');
}
