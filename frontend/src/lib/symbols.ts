export type SymbolItem = {
  symbol: string;
  name: string;
  keywords: string[];
  group: string;
};

const thinkingSymbols = defineGroup('thinking', [
  ['🧠', 'brain', ['mind', 'logic', 'thinking', 'idea']],
  ['💡', 'light_bulb', ['idea', 'insight', 'inspiration', 'thinking']],
  ['⚡', 'lightning', ['energy', 'spark', 'idea', 'fast']],
  ['🧩', 'puzzle_piece', ['logic', 'solve', 'piece', 'thinking']],
  ['🎯', 'target', ['goal', 'focus', 'aim', 'thinking']],
  ['🧭', 'compass', ['direction', 'plan', 'navigation', 'strategy']],
  ['🔬', 'microscope', ['research', 'detail', 'analysis', 'science']],
  ['🔭', 'telescope', ['vision', 'future', 'explore', 'thinking']],
  ['🧪', 'test_tube', ['experiment', 'science', 'lab', 'thinking']],
  ['⚙', 'gear', ['system', 'process', 'mechanism', 'logic']],
  ['🪄', 'magic_wand', ['idea', 'creative', 'spark', 'thinking']],
  ['🔎', 'inspect', ['analyze', 'detail', 'search', 'thinking']],
]);

const actionSymbols = defineGroup('actions', [
  ['✓', 'check', ['done', 'yes', 'accept', 'success']],
  ['✔', 'check_mark', ['complete', 'confirm', 'done', 'success']],
  ['✗', 'cross', ['no', 'remove', 'wrong', 'cancel']],
  ['✕', 'cross_mark', ['cancel', 'delete', 'close', 'wrong']],
  ['✏', 'edit', ['write', 'pencil', 'update', 'change']],
  ['📝', 'note_edit', ['write', 'compose', 'draft', 'edit']],
  ['🗑', 'delete', ['trash', 'remove', 'clear', 'cross']],
  ['➕', 'add', ['plus', 'new', 'create', 'insert']],
  ['➖', 'remove', ['minus', 'subtract', 'delete', 'less']],
  ['⬆', 'upload', ['send', 'push', 'up', 'actions']],
  ['⬇', 'download', ['pull', 'save', 'down', 'actions']],
  ['📤', 'share', ['send', 'export', 'actions', 'publish']],
  ['📥', 'inbox', ['receive', 'import', 'download', 'actions']],
  ['🔄', 'refresh', ['reload', 'sync', 'repeat', 'actions']],
  ['🔁', 'repeat', ['loop', 'again', 'cycle', 'actions']],
  ['🔀', 'shuffle', ['random', 'mix', 'switch', 'actions']],
  ['▶', 'play', ['start', 'run', 'continue', 'actions']],
  ['⏸', 'pause', ['hold', 'wait', 'actions', 'stop']],
  ['⏹', 'stop', ['end', 'halt', 'actions', 'pause']],
  ['🔍', 'search', ['find', 'lookup', 'query', 'actions']],
  ['🧹', 'clear', ['clean', 'reset', 'remove', 'actions']],
  ['🔒', 'lock', ['secure', 'private', 'protect', 'actions']],
  ['🔓', 'unlock', ['open', 'access', 'actions', 'secure']],
  ['📌', 'pin', ['attach', 'fix', 'keep', 'actions']],
  ['📍', 'location_pin', ['mark', 'place', 'position', 'actions']],
]);

const statusSymbols = defineGroup('status', [
  ['⚠', 'warning', ['alert', 'caution', 'attention', 'status']],
  ['⛔', 'blocked', ['stop', 'forbidden', 'closed', 'status']],
  ['❌', 'error', ['wrong', 'fail', 'cross', 'status']],
  ['✅', 'success', ['done', 'good', 'pass', 'status']],
  ['ℹ', 'info', ['information', 'note', 'details', 'status']],
  ['⏳', 'pending', ['waiting', 'progress', 'loading', 'status']],
  ['⌛', 'hourglass', ['time', 'wait', 'loading', 'status']],
  ['🟢', 'online', ['active', 'available', 'status', 'green']],
  ['🔴', 'offline', ['busy', 'unavailable', 'status', 'red']],
  ['🟡', 'paused_status', ['idle', 'pause', 'pending', 'status']],
  ['🔵', 'cold_status', ['info', 'calm', 'status', 'blue']],
  ['🔥', 'urgent', ['hot', 'important', 'alert', 'status']],
  ['⭐', 'star', ['favorite', 'important', 'highlight', 'status']],
  ['🏁', 'finished', ['done', 'complete', 'success', 'status']],
  ['🚧', 'work_in_progress', ['wip', 'building', 'pending', 'status']],
]);

const objectSymbols = defineGroup('objects', [
  ['📄', 'file', ['document', 'page', 'paper', 'objects']],
  ['📁', 'folder', ['directory', 'container', 'objects', 'file']],
  ['🔗', 'link', ['url', 'chain', 'connect', 'objects']],
  ['🗒', 'note', ['memo', 'page', 'document', 'objects']],
  ['📘', 'book', ['reference', 'read', 'manual', 'objects']],
  ['📚', 'books', ['library', 'reference', 'read', 'objects']],
  ['📎', 'paperclip', ['attach', 'clip', 'file', 'objects']],
  ['🗓', 'calendar', ['date', 'schedule', 'plan', 'objects']],
  ['🕒', 'clock', ['time', 'schedule', 'deadline', 'objects']],
  ['🔔', 'bell', ['notification', 'alert', 'ring', 'objects']],
  ['🏷', 'tag', ['label', 'category', 'mark', 'objects']],
  ['🗝', 'key', ['access', 'secure', 'unlock', 'objects']],
  ['✉', 'mail', ['message', 'email', 'send', 'objects']],
  ['☎', 'phone', ['call', 'contact', 'mobile', 'objects']],
  ['🖼', 'image', ['picture', 'photo', 'media', 'objects']],
  ['📷', 'camera', ['photo', 'capture', 'media', 'objects']],
  ['📊', 'bar_chart', ['metrics', 'analytics', 'data', 'objects']],
  ['📈', 'chart_up', ['growth', 'trend', 'up', 'objects']],
  ['📉', 'chart_down', ['decline', 'trend', 'down', 'objects']],
  ['🗃', 'card_box', ['archive', 'storage', 'objects', 'box']],
  ['📦', 'package', ['box', 'bundle', 'delivery', 'objects']],
  ['🗄', 'cabinet', ['archive', 'storage', 'objects', 'file']],
  ['🧾', 'receipt', ['invoice', 'bill', 'list', 'objects']],
  ['🗂', 'index_cards', ['organize', 'tabs', 'file', 'objects']],
  ['💾', 'save_disk', ['save', 'disk', 'store', 'objects']],
  ['🗺', 'map', ['location', 'route', 'guide', 'objects']],
  ['🌐', 'globe', ['world', 'web', 'internet', 'objects']],
  ['🗃️', 'archive', ['storage', 'box', 'save', 'objects']],
]);

const arrowSymbols = defineGroup('arrows', [
  ['→', 'arrow_right', ['right', 'forward', 'next', 'arrow']],
  ['←', 'arrow_left', ['left', 'back', 'previous', 'arrow']],
  ['↑', 'arrow_up', ['up', 'north', 'arrow', 'top']],
  ['↓', 'arrow_down', ['down', 'south', 'arrow', 'bottom']],
  ['⇒', 'double_arrow_right', ['implies', 'right', 'forward', 'arrow']],
  ['⇐', 'double_arrow_left', ['return', 'left', 'back', 'arrow']],
  ['⇑', 'double_arrow_up', ['up', 'north', 'arrow', 'double']],
  ['⇓', 'double_arrow_down', ['down', 'south', 'arrow', 'double']],
  ['↗', 'arrow_up_right', ['north_east', 'diagonal', 'arrow', 'up']],
  ['↘', 'arrow_down_right', ['south_east', 'diagonal', 'arrow', 'down']],
  ['↖', 'arrow_up_left', ['north_west', 'diagonal', 'arrow', 'up']],
  ['↙', 'arrow_down_left', ['south_west', 'diagonal', 'arrow', 'down']],
  ['↔', 'arrow_left_right', ['horizontal', 'swap', 'arrow', 'both']],
  ['↕', 'arrow_up_down', ['vertical', 'swap', 'arrow', 'both']],
  ['↩', 'return_arrow', ['reply', 'undo', 'arrow', 'return']],
  ['↪', 'arrow_hook_right', ['follow', 'link', 'arrow', 'branch']],
  ['⤴', 'arrow_turn_up', ['turn', 'up', 'arrow', 'curve']],
  ['⤵', 'arrow_turn_down', ['turn', 'down', 'arrow', 'curve']],
]);

const mathSymbols = defineGroup('math', [
  ['±', 'plus_minus', ['plus', 'minus', 'math', 'variance']],
  ['≠', 'not_equal', ['neq', 'different', 'math', 'compare']],
  ['≤', 'less_equal', ['lte', 'math', 'compare', 'smaller']],
  ['≥', 'greater_equal', ['gte', 'math', 'compare', 'bigger']],
  ['≈', 'approximately', ['approx', 'similar', 'math', 'close']],
  ['∞', 'infinity', ['endless', 'forever', 'math', 'loop']],
  ['√', 'square_root', ['root', 'math', 'radical', 'sqrt']],
  ['∑', 'summation', ['sum', 'sigma', 'math', 'total']],
  ['∏', 'product', ['multiply', 'math', 'pi', 'total']],
  ['∫', 'integral', ['calculus', 'math', 'area', 'integration']],
  ['π', 'pi', ['ratio', 'circle', 'math', 'constant']],
  ['∆', 'delta', ['change', 'triangle', 'math', 'difference']],
  ['∂', 'partial', ['derivative', 'math', 'calculus', 'part']],
  ['×', 'multiply', ['times', 'math', 'product', 'cross']],
  ['÷', 'divide', ['division', 'math', 'split', 'ratio']],
  ['∈', 'element_of', ['belongs', 'set', 'math', 'membership']],
  ['∉', 'not_element_of', ['set', 'math', 'membership', 'not']],
  ['⊂', 'subset', ['set', 'contained', 'math', 'inside']],
  ['⊃', 'superset', ['set', 'contains', 'math', 'outside']],
  ['∧', 'logical_and', ['and', 'logic', 'math', 'boolean']],
  ['∨', 'logical_or', ['or', 'logic', 'math', 'boolean']],
  ['¬', 'logical_not', ['not', 'logic', 'math', 'boolean']],
]);

const punctuationSymbols = defineGroup('punctuation', [
  ['…', 'ellipsis', ['dots', 'pause', 'continue', 'punctuation']],
  ['—', 'em_dash', ['dash', 'long_dash', 'punctuation', 'break']],
  ['–', 'en_dash', ['dash', 'range', 'punctuation', 'mid_dash']],
  ['•', 'bullet', ['dot', 'list', 'point', 'punctuation']],
  ['·', 'middle_dot', ['dot', 'separator', 'punctuation', 'center']],
  ['§', 'section', ['legal', 'paragraph', 'punctuation', 'law']],
  ['¶', 'paragraph', ['pilcrow', 'section', 'punctuation', 'text']],
  ['©', 'copyright', ['legal', 'rights', 'punctuation', 'mark']],
  ['®', 'registered', ['legal', 'brand', 'punctuation', 'mark']],
  ['™', 'trademark', ['brand', 'legal', 'punctuation', 'mark']],
  ['′', 'prime', ['minutes', 'apostrophe', 'math', 'punctuation']],
  ['″', 'double_prime', ['seconds', 'quotes', 'math', 'punctuation']],
  ['«', 'quote_left_double', ['quote', 'left', 'punctuation', 'angle']],
  ['»', 'quote_right_double', ['quote', 'right', 'punctuation', 'angle']],
  ['‹', 'quote_left_single', ['quote', 'left', 'punctuation', 'angle']],
  ['›', 'quote_right_single', ['quote', 'right', 'punctuation', 'angle']],
]);

const emotionSymbols = defineGroup('emotions', [
  ['🙂', 'smile', ['happy', 'calm', 'friendly', 'emotion']],
  ['😀', 'grin', ['happy', 'joy', 'emotion', 'face']],
  ['😂', 'joy', ['laugh', 'tears', 'emotion', 'funny']],
  ['😉', 'wink', ['playful', 'emotion', 'face', 'signal']],
  ['😎', 'cool', ['sunglasses', 'chill', 'emotion', 'face']],
  ['😍', 'love', ['heart_eyes', 'emotion', 'like', 'adore']],
  ['🥳', 'party', ['celebrate', 'emotion', 'festive', 'yay']],
  ['🤔', 'thinking_face', ['hmm', 'wonder', 'emotion', 'thinking']],
  ['😴', 'sleep', ['tired', 'rest', 'emotion', 'face']],
  ['😕', 'confused', ['unclear', 'emotion', 'face', 'question']],
  ['😢', 'cry', ['sad', 'tears', 'emotion', 'face']],
  ['😡', 'angry', ['mad', 'upset', 'emotion', 'face']],
  ['😱', 'shock', ['surprised', 'fear', 'emotion', 'face']],
  ['👏', 'clap', ['applause', 'approve', 'emotion', 'gesture']],
  ['🙏', 'pray', ['thanks', 'please', 'emotion', 'gesture']],
  ['👋', 'wave', ['hello', 'bye', 'emotion', 'gesture']],
  ['🤝', 'handshake', ['agree', 'deal', 'emotion', 'gesture']],
  ['🚀', 'rocket', ['launch', 'fast', 'emotion', 'growth']],
  ['🎉', 'celebration', ['party', 'success', 'emotion', 'confetti']],
  ['❤️', 'heart', ['love', 'like', 'emotion', 'favorite']],
]);

const BASE_SYMBOLS = [
  ...thinkingSymbols,
  ...actionSymbols,
  ...statusSymbols,
  ...objectSymbols,
  ...arrowSymbols,
  ...mathSymbols,
  ...punctuationSymbols,
  ...emotionSymbols,
];

const aliasIndex = new Map<string, SymbolItem>();

export const SYMBOL_CATALOG: SymbolItem[] = BASE_SYMBOLS.flatMap((item) => {
  const aliases = buildAliases(item);
  return aliases.map((alias) => {
    const aliasItem = {
      symbol: item.symbol,
      name: alias,
      keywords: item.keywords,
      group: item.group,
    };

    if (!aliasIndex.has(alias)) {
      aliasIndex.set(alias, item);
    }

    return aliasItem;
  });
});

const indexedSymbols = BASE_SYMBOLS.map((item) => ({
  item,
  searchText: buildAliases(item).join(' '),
}));

export function searchSymbols(query: string, limit = 40): SymbolItem[] {
  const normalizedQuery = normalizeSymbolName(query);
  if (!normalizedQuery) {
    return BASE_SYMBOLS.slice(0, limit);
  }

  return indexedSymbols
    .map(({ item, searchText }) => ({
      item,
      score: rankSymbol(item, searchText, normalizedQuery),
    }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score || left.item.name.localeCompare(right.item.name))
    .slice(0, limit)
    .map((entry) => entry.item);
}

export function lookupSymbolByName(name: string) {
  return aliasIndex.get(normalizeSymbolName(name)) ?? null;
}

export function formatSymbolName(name: string) {
  return name.replace(/[_-]+/g, ' ');
}

export function isSymbolSearchQuery(query: string) {
  const normalized = query.trim().toLowerCase();
  return normalized === 'symbol'
    || normalized.startsWith('symbol ')
    || normalized === 'emoji'
    || normalized.startsWith('emoji ')
    || normalized === 'icon'
    || normalized.startsWith('icon ');
}

export function extractSymbolSearchTerm(query: string) {
  const normalized = query.trim();
  return normalized.replace(/^(symbol|emoji|icon)\s*/i, '');
}

function defineGroup(group: string, entries: Array<[string, string, string[]]>) {
  return entries.map(([symbol, name, keywords]) => ({ symbol, name, keywords, group }));
}

function buildAliases(item: SymbolItem) {
  const aliases = new Set<string>();
  const addAlias = (value: string) => {
    const normalized = normalizeSymbolName(value);
    if (!normalized) {
      return;
    }

    aliases.add(normalized);
    aliases.add(normalized.replace(/_/g, '-'));
    aliases.add(normalized.replace(/_/g, ' '));
  };

  addAlias(item.name);
  addAlias(`${item.group}_${item.name}`);
  item.keywords.forEach(addAlias);

  item.name.split('_').forEach(addAlias);
  item.keywords.forEach((keyword) => {
    normalizeSymbolName(keyword).split('_').forEach(addAlias);
  });

  return [...aliases];
}

function normalizeSymbolName(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_')
    .replace(/_+/g, '_');
}

function rankSymbol(item: SymbolItem, searchText: string, normalizedQuery: string) {
  const exactName = item.name === normalizedQuery ? 500 : 0;
  const exactKeyword = item.keywords.some((keyword) => normalizeSymbolName(keyword) === normalizedQuery) ? 320 : 0;
  const nameStartsWith = item.name.startsWith(normalizedQuery) ? 240 : 0;
  const keywordStartsWith = item.keywords.some((keyword) => normalizeSymbolName(keyword).startsWith(normalizedQuery)) ? 200 : 0;
  const groupExact = item.group === normalizedQuery ? 150 : 0;
  const includesScore = searchText.includes(normalizedQuery) ? 120 : 0;
  const fuzzy = getFuzzyScore(searchText, normalizedQuery);

  return exactName + exactKeyword + nameStartsWith + keywordStartsWith + groupExact + includesScore + fuzzy;
}

function getFuzzyScore(text: string, query: string) {
  if (!query) {
    return 0;
  }

  let score = 0;
  let queryIndex = 0;

  for (let index = 0; index < text.length && queryIndex < query.length; index += 1) {
    if (text[index] === query[queryIndex]) {
      score += index > 0 && text[index - 1] === query[queryIndex - 1] ? 8 : 4;
      queryIndex += 1;
    }
  }

  return queryIndex === query.length ? score : 0;
}
