import type { Resource } from '../types';
import { isPreviewResource } from '../types';

export type CommandStepType = 'root' | 'select' | 'confirm' | 'input';

export type PalettePreview =
  | { type: 'note'; title: string; subtitle?: string; snippet: string }
  | { type: 'file'; resource: Resource }
  | { type: 'text'; title: string; subtitle?: string; snippet: string };

export type CommandStepResult =
  | { type: 'push'; step: CommandStep; query?: string }
  | { type: 'execute'; action: () => void | Promise<void>; remember?: CommandMemory }
  | { type: 'noop' };

export type CommandItem = {
  id: string;
  title: string;
  subtitle?: string;
  section?: string;
  keywords?: string[];
  aliases?: string[];
  preview?: PalettePreview;
  scoreBoost?: number;
  onSelect: () => CommandStepResult | Promise<CommandStepResult>;
};

export type CommandStep = {
  id: string;
  type: CommandStepType;
  title: string;
  placeholder: string;
  initialQuery?: string;
  emptyState?: string;
  getItems: (query: string, context: CommandContext) => CommandItem[];
};

export type CommandMemory = {
  id: string;
  title: string;
  subtitle?: string;
  resume: (context: CommandContext) => CommandStepResult;
};

export type CommandUsage = Record<string, number>;

export type CommandContext = {
  resources: Resource[];
  activeNote: Resource | null;
  previewResource: Resource | null;
  openNotes: Resource[];
  sidebarCollapsed: boolean;
  openResource: (resourceId: string) => void;
  createNote: () => Promise<void>;
  uploadFile: () => void;
  toggleSidebar: () => void;
  openShortcuts: () => void;
  openSettings: () => void;
  closeActiveNote: () => void;
  closePreview: () => void;
  openDeleteFlow: (resourceId: string) => void | Promise<void>;
  renameResource: (resourceId: string, title: string) => void | Promise<void>;
};

type CommandDefinition = {
  id: string;
  title: string;
  keywords: string[];
  aliases?: string[];
  getInitialStep: (context: CommandContext) => CommandStepResult;
  isAvailable?: (context: CommandContext) => boolean;
  subtitle?: (context: CommandContext) => string | undefined;
  scoreBoost?: (context: CommandContext) => number;
  remember?: (context: CommandContext) => CommandMemory | undefined;
};

const ROOT_RESULT_LIMIT = 18;

const commandDefinitions: CommandDefinition[] = [
  {
    id: 'create_note',
    title: 'Create note',
    keywords: ['create', 'new', 'note', 'write'],
    aliases: ['new'],
    scoreBoost: () => 200,
    getInitialStep: (context) => ({
      type: 'execute',
      action: () => context.createNote(),
    }),
    remember: (context) => ({
      id: 'create_note',
      title: 'Create note',
      resume: () => ({
        type: 'execute',
        action: () => context.createNote(),
      }),
    }),
  },
  {
    id: 'upload_file',
    title: 'Upload file',
    keywords: ['upload', 'file', 'import'],
    getInitialStep: (context) => ({
      type: 'execute',
      action: () => context.uploadFile(),
    }),
    remember: (context) => ({
      id: 'upload_file',
      title: 'Upload file',
      resume: () => ({
        type: 'execute',
        action: () => context.uploadFile(),
      }),
    }),
  },
  {
    id: 'delete_resource',
    title: 'Delete resource',
    keywords: ['delete', 'remove', 'resource'],
    aliases: ['del', 'rm'],
    scoreBoost: () => 180,
    getInitialStep: (context) => ({
      type: 'push',
      step: buildDeleteSelectStep(context),
    }),
    remember: () => ({
      id: 'delete_resource',
      title: 'Continue delete',
      subtitle: 'Choose a resource to remove',
      resume: (context) => ({
        type: 'push',
        step: buildDeleteSelectStep(context),
      }),
    }),
  },
  {
    id: 'rename_active_note',
    title: 'Rename active note',
    keywords: ['rename', 'title', 'note'],
    aliases: ['mv'],
    isAvailable: (context) => Boolean(context.activeNote),
    scoreBoost: (context) => (context.activeNote ? 260 : 0),
    subtitle: (context) => context.activeNote?.title,
    getInitialStep: (context) => {
      if (!context.activeNote) {
        return { type: 'noop' };
      }
      return {
        type: 'push',
        step: buildRenameStep(context.activeNote),
        query: context.activeNote.title,
      };
    },
    remember: (context) => (
      context.activeNote
        ? {
            id: 'rename_active_note',
            title: 'Rename active note',
            subtitle: context.activeNote.title,
            resume: (resumeContext) => (
              resumeContext.activeNote
                ? { type: 'push', step: buildRenameStep(resumeContext.activeNote), query: resumeContext.activeNote.title }
                : { type: 'noop' }
            ),
          }
        : undefined
    ),
  },
  {
    id: 'close_active_note',
    title: 'Close active note',
    keywords: ['close', 'note', 'workspace'],
    isAvailable: (context) => Boolean(context.activeNote),
    scoreBoost: (context) => (context.activeNote ? 220 : 0),
    subtitle: (context) => context.activeNote?.title,
    getInitialStep: (context) => (
      context.activeNote
        ? { type: 'execute', action: () => context.closeActiveNote() }
        : { type: 'noop' }
    ),
  },
  {
    id: 'close_preview',
    title: 'Close preview',
    keywords: ['preview', 'close', 'panel', 'modal'],
    isAvailable: (context) => Boolean(context.previewResource),
    scoreBoost: (context) => (context.previewResource ? 240 : 0),
    subtitle: (context) => context.previewResource?.title,
    getInitialStep: (context) => (
      context.previewResource
        ? { type: 'execute', action: () => context.closePreview() }
        : { type: 'noop' }
    ),
  },
  {
    id: 'toggle_sidebar',
    title: 'Toggle sidebar',
    keywords: ['sidebar', 'navigation', 'panel'],
    getInitialStep: (context) => ({ type: 'execute', action: () => context.toggleSidebar() }),
    subtitle: (context) => context.sidebarCollapsed ? 'Expand navigation' : 'Collapse navigation',
  },
  {
    id: 'open_shortcuts',
    title: 'Open shortcuts',
    keywords: ['keyboard', 'shortcuts', 'help'],
    getInitialStep: (context) => ({ type: 'execute', action: () => context.openShortcuts() }),
  },
  {
    id: 'open_settings',
    title: 'Open settings',
    keywords: ['settings', 'preferences'],
    getInitialStep: (context) => ({ type: 'execute', action: () => context.openSettings() }),
  },
];

export function createRootStep(
  context: CommandContext,
  lastAction: CommandMemory | null,
  usage: CommandUsage,
): CommandStep {
  return {
    id: 'root',
    type: 'root',
    title: 'Command palette',
    placeholder: 'Type a command, resource, or intent...',
    emptyState: 'No commands matched your search.',
    getItems: (query) => {
      const commandItems = commandDefinitions
        .filter((command) => command.isAvailable ? command.isAvailable(context) : true)
        .map<CommandItem>((command) => ({
          id: command.id,
          title: command.title,
          subtitle: command.subtitle?.(context),
          section: context.activeNote ? 'Context' : 'Commands',
          keywords: command.keywords,
          aliases: command.aliases,
          scoreBoost: command.scoreBoost?.(context) ?? 0,
          onSelect: async () => {
            const result = command.getInitialStep(context);
            if (result.type === 'execute') {
              return {
                ...result,
                remember: result.remember ?? command.remember?.(context),
              };
            }

            return result;
          },
        }));

      const resourceItems = context.resources.map<CommandItem>((resource) => ({
        id: `resource-${resource.id}`,
        title: resource.title,
        subtitle: resource.type === 'note' ? 'Note' : 'File',
        section: resource.type === 'note' ? 'Notes' : 'Files',
        keywords: [resource.type, ...(resource.tags || []).map((tag) => tag.name)],
        aliases: resource.type === 'note' ? ['note'] : ['file'],
        preview: buildResourcePreview(resource),
        scoreBoost: getResourceContextBoost(resource, context),
        onSelect: async () => ({
          type: 'execute',
          action: () => context.openResource(resource.id),
          remember: {
            id: `resource-${resource.id}`,
            title: `Open ${resource.title}`,
            subtitle: resource.type === 'note' ? 'Open note' : 'Open file preview',
            resume: (resumeContext) => ({
              type: 'execute',
              action: () => resumeContext.openResource(resource.id),
            }),
          },
        }),
      }));

      const extraItems: CommandItem[] = [];
      if (lastAction) {
        extraItems.push({
          id: `continue-${lastAction.id}`,
          title: 'Continue last action',
          subtitle: lastAction.title,
          keywords: ['continue', 'last', 'recent'],
          scoreBoost: 320,
          onSelect: () => lastAction.resume(context),
        });
      }

      if (!query.trim()) {
        return getZeroStateItems([...extraItems, ...commandItems], usage).slice(0, 3);
      }

      return rankItems([...extraItems, ...commandItems, ...resourceItems], query, usage, lastAction?.id ?? null)
        .slice(0, ROOT_RESULT_LIMIT);
    },
  };
}

function buildDeleteSelectStep(context: CommandContext): CommandStep {
  return {
    id: 'delete-select',
    type: 'select',
    title: 'Delete resource',
    placeholder: 'Choose a resource to delete...',
    emptyState: 'No resources matched.',
    getItems: (query) => rankItems(
      context.resources.map((resource) => ({
        id: `delete-target-${resource.id}`,
        title: resource.title,
        subtitle: resource.type === 'note' ? 'Note' : 'File',
        section: 'Targets',
        keywords: [resource.type, 'delete', ...(resource.tags || []).map((tag) => tag.name)],
        aliases: ['del', 'rm', 'remove'],
        preview: buildResourcePreview(resource),
        scoreBoost: resource.id === context.activeNote?.id ? 120 : 0,
        onSelect: async () => ({
          type: 'push',
          step: buildDeleteConfirmStep(context, resource),
        }),
      })),
      query,
      {},
      null,
    ),
  };
}

function buildDeleteConfirmStep(context: CommandContext, resource: Resource): CommandStep {
  return {
    id: `delete-confirm-${resource.id}`,
    type: 'confirm',
    title: 'Confirm delete',
    placeholder: 'Press Enter to continue...',
    emptyState: 'Confirm deletion.',
    getItems: () => [
      {
        id: `delete-confirm-action-${resource.id}`,
        title: `Delete "${resource.title}"`,
        subtitle: 'Open the delete flow for this resource',
        section: 'Confirm',
        preview: buildResourcePreview(resource),
        onSelect: async () => ({
          type: 'execute',
          action: () => context.openDeleteFlow(resource.id),
          remember: {
            id: `delete-resource-${resource.id}`,
            title: `Delete ${resource.title}`,
            subtitle: 'Delete flow',
            resume: (context) => ({
              type: 'execute',
              action: () => context.openDeleteFlow(resource.id),
            }),
          },
        }),
      },
    ],
  };
}

function buildRenameStep(resource: Resource): CommandStep {
  return {
    id: `rename-${resource.id}`,
    type: 'input',
    title: 'Rename note',
    placeholder: 'Type the new title...',
    initialQuery: resource.title,
    emptyState: 'Type a new title.',
    getItems: (query, context) => {
      const trimmed = query.trim();
      if (!trimmed) {
        return [];
      }

      return [
        {
          id: `rename-confirm-${resource.id}`,
          title: `Rename to "${trimmed}"`,
          subtitle: resource.title,
          section: 'Confirm',
          preview: buildResourcePreview(resource),
          onSelect: async () => ({
            type: 'execute',
            action: () => context.renameResource(resource.id, trimmed),
            remember: {
              id: `rename-${resource.id}`,
              title: `Rename ${resource.title}`,
              subtitle: `to ${trimmed}`,
              resume: (resumeContext) => ({
                type: 'push',
                step: buildRenameStep(resumeContext.activeNote ?? resource),
                query: trimmed,
              }),
            },
          }),
        },
      ];
    },
  };
}

function buildResourcePreview(resource: Resource): PalettePreview {
  if (isPreviewResource(resource.type)) {
    return { type: 'file', resource };
  }

  return {
    type: 'note',
    title: resource.title,
    subtitle: 'Note preview',
    snippet: extractSnippet(resource.content),
  };
}

function getResourceContextBoost(resource: Resource, context: CommandContext) {
  if (resource.id === context.activeNote?.id) {
    return 160;
  }

  if (resource.id === context.previewResource?.id) {
    return 140;
  }

  if (context.openNotes.some((note) => note.id === resource.id)) {
    return 100;
  }

  return 0;
}

function getZeroStateItems(commandItems: CommandItem[], usage: CommandUsage) {
  const contextual = commandItems
    .filter((item) => item.id === 'rename_active_note' || item.id === 'close_active_note' || item.id === 'close_preview')
    .sort((left, right) => (right.scoreBoost ?? 0) - (left.scoreBoost ?? 0));

  const recent = [...commandItems]
    .sort((left, right) => (usage[right.id] ?? 0) - (usage[left.id] ?? 0))
    .filter((item) => (usage[item.id] ?? 0) > 0);

  const deduped: CommandItem[] = [];
  const seen = new Set<string>();

  const seedItems = [
    ...commandItems.filter((item) => item.id.startsWith('continue-')),
    ...contextual,
    ...recent,
  ];

  seedItems.forEach((item) => {
    if (seen.has(item.id)) {
      return;
    }
    seen.add(item.id);
    deduped.push(item);
  });

  return deduped;
}

function rankItems(
  items: CommandItem[],
  query: string,
  usage: CommandUsage,
  lastActionId: string | null,
) {
  const normalizedQuery = query.trim().toLowerCase();
  const intentBias = normalizedQuery.includes('note') ? 'note' : normalizedQuery.includes('file') ? 'file' : null;

  const ranked = items
    .map((item) => {
      const haystack = [item.title, item.subtitle || '', ...(item.keywords || []), ...(item.aliases || [])].join(' ').toLowerCase();
      const usageBoost = (usage[item.id] ?? 0) * 8;
      const recentBoost = lastActionId && item.id.includes(lastActionId) ? 80 : 0;
      const matchScore = getMatchScore(item, normalizedQuery, haystack);
      const intentBoost = intentBias && haystack.includes(intentBias) ? 40 : 0;
      return {
        ...item,
        totalScore: (item.scoreBoost ?? 0) + usageBoost + recentBoost + intentBoost + matchScore,
      };
    })
    .filter((item) => !normalizedQuery || item.totalScore > 0);

  ranked.sort((left, right) => right.totalScore - left.totalScore || left.title.localeCompare(right.title));
  return ranked;
}

function getMatchScore(item: CommandItem, query: string, haystack: string) {
  if (!query) {
    return 100;
  }

  if (item.aliases?.some((alias) => alias.toLowerCase() === query)) {
    return 260;
  }

  if (item.title.toLowerCase() === query) {
    return 240;
  }

  if (item.title.toLowerCase().startsWith(query)) {
    return 220;
  }

  if (haystack.includes(query)) {
    return 160;
  }

  const queryTokens = query.split(/\s+/).filter(Boolean);
  if (queryTokens.length > 0 && queryTokens.every((token) => haystack.includes(token))) {
    return 120;
  }

  return getFuzzyScore(item.title.toLowerCase(), query);
}

function getFuzzyScore(text: string, query: string) {
  let score = 0;
  let lastMatchIndex = -1;

  for (const character of query) {
    const nextIndex = text.indexOf(character, lastMatchIndex + 1);
    if (nextIndex === -1) {
      return 0;
    }
    score += nextIndex === lastMatchIndex + 1 ? 18 : 8;
    lastMatchIndex = nextIndex;
  }

  return score;
}

function extractSnippet(content: Resource['content']) {
  if (!content) {
    return 'No content yet.';
  }

  const raw = typeof content === 'string' ? content : JSON.stringify(content);
  try {
    const parsed = typeof content === 'string' ? JSON.parse(content) : content;
    return flattenTiptapText(parsed).slice(0, 280) || raw.slice(0, 280);
  } catch {
    return raw.replace(/\s+/g, ' ').slice(0, 280);
  }
}

function flattenTiptapText(node: unknown): string {
  if (!node || typeof node !== 'object') {
    return '';
  }

  const typedNode = node as { text?: string; content?: unknown[] };
  const ownText = typedNode.text ?? '';
  const childText = Array.isArray(typedNode.content)
    ? typedNode.content.map((child) => flattenTiptapText(child)).join(' ')
    : '';

  return `${ownText} ${childText}`.replace(/\s+/g, ' ').trim();
}
