/**
 * Parses CSV text into a Tiptap-compatible HTML table string.
 * Handles quoted fields, commas inside quotes, and newlines.
 */
export function csvToTableHtml(csv: string): string {
  const rows = parseCsvRows(csv);
  if (rows.length === 0) return '<p>Empty CSV</p>';

  let html = '<table><tbody>';
  rows.forEach((row, rowIndex) => {
    html += '<tr>';
    row.forEach(cell => {
      const tag = rowIndex === 0 ? 'th' : 'td';
      html += `<${tag}>${escapeHtml(cell.trim())}</${tag}>`;
    });
    html += '</tr>';
  });
  html += '</tbody></table>';
  return html;
}

function parseCsvRows(csv: string): string[][] {
  const rows: string[][] = [];
  let current = '';
  let inQuotes = false;
  let row: string[] = [];

  for (let i = 0; i < csv.length; i++) {
    const char = csv[i];
    const next = csv[i + 1];

    if (inQuotes) {
      if (char === '"' && next === '"') {
        current += '"';
        i++; // skip escaped quote
      } else if (char === '"') {
        inQuotes = false;
      } else {
        current += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ',') {
        row.push(current);
        current = '';
      } else if (char === '\n') {
        row.push(current);
        current = '';
        if (row.some(c => c.trim() !== '')) rows.push(row);
        row = [];
      } else if (char === '\r') {
        // skip \r
      } else {
        current += char;
      }
    }
  }

  // Last field and row
  row.push(current);
  if (row.some(c => c.trim() !== '')) rows.push(row);

  // Normalize column count
  const maxCols = Math.max(...rows.map(r => r.length));
  return rows.map(r => {
    while (r.length < maxCols) r.push('');
    return r;
  });
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
