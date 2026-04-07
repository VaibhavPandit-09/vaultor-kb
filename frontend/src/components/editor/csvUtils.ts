import type { JSONContent } from '@tiptap/core';
import type { Editor } from '@tiptap/react';
import type { Resource } from '../../types';

type CsvImportBlocks = {
  tableContent: JSONContent[];
  fallbackContent: JSONContent[];
};

type ResourceReference = Pick<Resource, 'id' | 'title' | 'type'>;

const DELIMITER_CANDIDATES = [',', '\t', ';'] as const;

export function buildCsvImportBlocks(resource: ResourceReference, csv: string): CsvImportBlocks {
  const normalizedCsv = normalizeCsvText(csv);
  const rows = parseCsvRows(normalizedCsv);
  const tableNode = buildCsvTableNode(resource, rows);

  return {
    tableContent: [tableNode],
    fallbackContent: [
      createResourceReferenceParagraph(resource),
      createCsvCodeBlock(normalizedCsv),
    ],
  };
}

export function chooseSafeCsvContent(editor: Editor, resource: ResourceReference, csv: string): JSONContent[] {
  const blocks = buildCsvImportBlocks(resource, csv);

  if (isValidEditorContent(editor, blocks.tableContent)) {
    return blocks.tableContent;
  }

  if (isValidEditorContent(editor, blocks.fallbackContent)) {
    return blocks.fallbackContent;
  }

  return [
    createResourceReferenceParagraph(resource),
    createParagraph(normalizeCsvText(csv) || 'CSV import completed.'),
  ];
}

export function normalizeCsvText(csv: string) {
  return csv
    .replace(/^\uFEFF/, '')
    .replace(/\r\n?/g, '\n');
}

export function isValidEditorContent(editor: Editor, content: JSONContent[]) {
  try {
    editor.schema.nodeFromJSON({
      type: 'doc',
      content,
    });
    return true;
  } catch {
    return false;
  }
}

function buildCsvTableNode(resource: ResourceReference, rows: string[][]): JSONContent {
  const safeRows = rows.length > 0 ? rows : [['']];

  return {
    type: 'table',
    attrs: {
      sourceResourceId: resource.id,
      sourceResourceTitle: resource.title,
      sourceResourceType: resource.type,
    },
    content: safeRows.map((row, rowIndex) => ({
      type: 'tableRow',
      content: row.map((cell) => ({
        type: rowIndex === 0 ? 'tableHeader' : 'tableCell',
        content: [createParagraph(cell)],
      })),
    })),
  };
}

function createResourceReferenceParagraph(resource: ResourceReference): JSONContent {
  return {
    type: 'paragraph',
    content: [
      { type: 'text', text: 'CSV source: ' },
      {
        type: 'resourceLink',
        attrs: {
          resourceId: resource.id,
          label: resource.title,
          type: resource.type,
        },
      },
    ],
  };
}

function createCsvCodeBlock(csv: string): JSONContent {
  return {
    type: 'codeBlock',
    attrs: {
      language: 'csv',
    },
    content: csv
      ? [{ type: 'text', text: csv }]
      : [],
  };
}

function createParagraph(text = ''): JSONContent {
  return {
    type: 'paragraph',
    content: text ? [{ type: 'text', text }] : [],
  };
}

function parseCsvRows(csv: string): string[][] {
  if (!csv.trim()) {
    return [['']];
  }

  const delimiter = detectDelimiter(csv);
  const rows: string[][] = [];
  let currentCell = '';
  let currentRow: string[] = [];
  let inQuotes = false;

  for (let index = 0; index < csv.length; index += 1) {
    const char = csv[index];
    const next = csv[index + 1];

    if (inQuotes) {
      if (char === '"' && next === '"') {
        currentCell += '"';
        index += 1;
        continue;
      }

      if (char === '"') {
        inQuotes = false;
        continue;
      }

      currentCell += char;
      continue;
    }

    if (char === '"') {
      inQuotes = true;
      continue;
    }

    if (char === delimiter) {
      currentRow.push(currentCell);
      currentCell = '';
      continue;
    }

    if (char === '\n') {
      currentRow.push(currentCell);
      currentCell = '';
      pushNormalizedRow(rows, currentRow);
      currentRow = [];
      continue;
    }

    currentCell += char;
  }

  currentRow.push(currentCell);
  pushNormalizedRow(rows, currentRow);

  const nonEmptyRows = rows.filter((row) => row.some((cell) => cell.trim().length > 0));
  const safeRows = nonEmptyRows.length > 0 ? nonEmptyRows : [['']];
  const columnCount = Math.max(1, ...safeRows.map((row) => row.length));

  return safeRows.map((row) => {
    const normalizedRow = [...row];
    while (normalizedRow.length < columnCount) {
      normalizedRow.push('');
    }

    return normalizedRow.map((cell) => cell ?? '');
  });
}

function pushNormalizedRow(rows: string[][], row: string[]) {
  if (row.length === 0) {
    return;
  }

  rows.push(row.map((cell) => cell ?? ''));
}

function detectDelimiter(csv: string) {
  const lines = csv
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 5);

  if (lines.length === 0) {
    return ',';
  }

  let bestDelimiter = ',';
  let bestScore = -1;

  DELIMITER_CANDIDATES.forEach((delimiter) => {
    const counts = lines.map((line) => countDelimiterOccurrences(line, delimiter));
    const positiveCounts = counts.filter((count) => count > 0);
    if (positiveCounts.length === 0) {
      return;
    }

    const total = positiveCounts.reduce((sum, count) => sum + count, 0);
    const consistency = positiveCounts.length === lines.length ? 4 : 0;
    const score = total + consistency;

    if (score > bestScore) {
      bestScore = score;
      bestDelimiter = delimiter;
    }
  });

  return bestDelimiter;
}

function countDelimiterOccurrences(line: string, delimiter: string) {
  let count = 0;
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];

    if (char === '"' && next === '"') {
      index += 1;
      continue;
    }

    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }

    if (!inQuotes && char === delimiter) {
      count += 1;
    }
  }

  return count;
}
