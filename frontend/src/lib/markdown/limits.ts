// DOM/parser-free admission policy, shared by the renderer and worker.
export const LIMITS = { bytes: 1024 * 1024, interactiveBytes: 1024 * 1024, pasteUnits: 65536, renderNodes: 30000, rootBlocks: 8192, textBlockUnits: 16384, codeUnits: 16384, tableCells: 2000, nodes: 30000, depth: 64, historyBytes: 16 * 1024 * 1024, historyEntries: 65536 };
