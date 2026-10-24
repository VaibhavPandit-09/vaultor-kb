// DOM/parser-free admission policy, shared by the renderer and worker.
export const LIMITS = { bytes: 1024 * 1024, interactiveBytes: 256 * 1024, codeUnits: 16384, tableCells: 2000, nodes: 30000, depth: 64, historyBytes: 16 * 1024 * 1024, historyEntries: 65536 };
