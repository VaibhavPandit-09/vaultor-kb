import { Extension } from '@tiptap/react';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { lookupSymbolByName } from '../../lib/symbols';

type ReplacementTrigger = 'space' | 'enter';

type ReplacementRule = {
  regex: RegExp;
  triggers: ReplacementTrigger[];
  replace: string | ((match: RegExpExecArray) => string);
};

const textPatternRules: ReplacementRule[] = [
  { regex: /->$/, triggers: ['space'], replace: '→ ' },
  { regex: /=>$/, triggers: ['space'], replace: '⇒ ' },
  { regex: /<-$/, triggers: ['space'], replace: '← ' },
  { regex: /<=$/, triggers: ['space'], replace: '≤ ' },
  { regex: />=$/, triggers: ['space'], replace: '≥ ' },
  { regex: /!=$/, triggers: ['space'], replace: '≠ ' },
  { regex: /\.\.\.$/, triggers: ['space'], replace: '… ' },
  { regex: /--$/, triggers: ['space'], replace: '— ' },
];

const symbolSystemPluginKey = new PluginKey('symbolSystem');

export const SymbolSystemExtension = Extension.create({
  name: 'symbolSystem',

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: symbolSystemPluginKey,
        props: {
          handleTextInput(view, from, to, text) {
            if (text !== ' ') {
              return false;
            }

            const match = findReplacementMatch(view.state.doc.resolve(from), 'space');
            if (!match) {
              return false;
            }

            const tr = view.state.tr.insertText(match.replacement, match.from, to);
            view.dispatch(tr);
            return true;
          },

          handleKeyDown(view, event) {
            if (event.key !== 'Enter') {
              return false;
            }

            const match = findReplacementMatch(view.state.selection.$from, 'enter');
            if (!match) {
              return false;
            }

            const tr = view.state.tr.insertText(match.replacement, match.from, view.state.selection.to);
            view.dispatch(tr);
            return false;
          },
        },
      }),
    ];
  },
});

function findReplacementMatch(
  resolvedPosition: { start: () => number; parentOffset: number; parent: { textContent: string } },
  trigger: ReplacementTrigger,
) {
  const textBefore = resolvedPosition.parent.textContent.slice(0, resolvedPosition.parentOffset);
  const symbolMatch = findSymbolReplacement(textBefore, resolvedPosition.start(), trigger);
  if (symbolMatch) {
    return symbolMatch;
  }

  return findTextPatternReplacement(textBefore, resolvedPosition.start(), resolvedPosition.parentOffset, trigger);
}

function findSymbolReplacement(
  textBefore: string,
  parentStart: number,
  trigger: ReplacementTrigger,
) {
  if (trigger !== 'space' && trigger !== 'enter') {
    return null;
  }

  const match = /:([a-zA-Z0-9_+-]+):$/.exec(textBefore);
  if (!match) {
    return null;
  }

  if (match.index > 0 && /\S/.test(textBefore[match.index - 1])) {
    return null;
  }

  const symbolItem = lookupSymbolByName(match[1]);
  if (!symbolItem) {
    return null;
  }

  return {
    from: parentStart + match.index,
    replacement: trigger === 'space' ? `${symbolItem.symbol} ` : symbolItem.symbol,
  };
}

function findTextPatternReplacement(
  textBefore: string,
  parentStart: number,
  parentOffset: number,
  trigger: ReplacementTrigger,
) {
  if (trigger !== 'space') {
    return null;
  }

  for (const rule of textPatternRules) {
    if (!rule.triggers.includes(trigger)) {
      continue;
    }

    const match = rule.regex.exec(textBefore);
    if (!match) {
      continue;
    }

    const replacement = typeof rule.replace === 'function' ? rule.replace(match) : rule.replace;
    return {
      from: parentStart + parentOffset - match[0].length,
      replacement,
    };
  }

  return null;
}
