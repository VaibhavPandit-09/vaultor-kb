import type { WorkspaceState } from './workspace';
import { sourcePresentation } from './sourcePresentation';
export type Locator =
  | { kind: 'resource' }
  | { kind: 'block'; path: string }
  | { kind: 'page'; page: number };
export type Evidence = {
  resourceId?: string;
  scope?: string;
  loadId?: number;
  quote: string;
  context: string;
  path?: string;
  revision: string;
  error?: string;
};
export type CaptureSeed = {
  scope: string;
  hostId: string;
  epoch: string;
  offline: boolean;
  resourceId: string;
  targetTitle: string;
  targetType: string;
  mimeType?: string;
  baseRevision: string;
  quote: string;
  context: string;
  locator: Locator;
  workspaceName: string;
};
export type CaptureItem = {
  id: string;
  version: number;
  state: 'draft' | 'queued';
  createdAt: string;
  source: {
    hostId: string;
    workspaceId: string;
    generation: string;
    address: string;
    workspaceName: string;
    targetTitle: string;
    targetType: string;
  };
  body: {
    generation: string;
    resourceId: string;
    comment: string;
    quote: string;
    context: string;
    baseRevision: string;
    locator: Locator;
  };
};
export function captureSeed(
  state: WorkspaceState,
  evidence?: Evidence,
  page?: number,
): CaptureSeed {
  if (
    !state.host ||
    !state.scope ||
    state.connection === 'revoked' ||
    state.unavailable ||
    state.busy
  )
    throw Error(
      'Source is unavailable. Keep the evidence and reconnect to its source.',
    );
  const target = state.preview ?? state.note;
  if (!target) throw Error('Open a saved resource first.');
  const scope: unknown = JSON.parse(state.scope);
  if (
    !Array.isArray(scope) ||
    scope.length !== 3 ||
    scope[0] !== state.host.hostId ||
    !scope.every(v => typeof v === 'string' && v.length > 0) ||
    (state.host.workspaceId && scope[1] !== state.host.workspaceId)
  )
    throw Error('Reading source changed.');
  let locator: Locator = { kind: 'resource' };
  if (evidence) {
    if (
      state.preview ||
      (evidence.resourceId !== undefined &&
        evidence.resourceId !== state.note?.id) ||
      (evidence.scope !== undefined && evidence.scope !== state.scope) ||
      (evidence.loadId !== undefined && evidence.loadId !== state.loadId) ||
      evidence.error ||
      evidence.revision !== state.note?.revision ||
      !evidence.quote ||
      evidence.quote.length > 4000 ||
      evidence.context.length > 4000
    )
      throw Error(
        evidence.error ||
          'Selection changed or exceeds 4000 characters. Select a shorter passage.',
      );
    if (evidence.path) {
      if (
        !/^\/[0-9]{1,5}(?:\/[0-9]{1,5}){0,63}$/.test(evidence.path) ||
        evidence.path.length > 301
      )
        throw Error('Unsupported passage locator.');
      let node: any = state.content;
      for (const index of evidence.path.slice(1).split('/'))
        node = node?.content?.[Number(index)];
      let budget = 20000;
      const text = (n: any, depth = 0): string => {
        if (--budget < 0 || depth > 64)
          throw Error('Passage is too complex to validate safely.');
        return typeof n?.text === 'string'
          ? n.text
          : Array.isArray(n?.content)
          ? n.content.map((child: any) => text(child, depth + 1)).join('')
          : '';
      };
      const savedText = text(node);
      if (
        !node ||
        !savedText.includes(evidence.quote) ||
        !savedText.includes(evidence.context)
      )
        throw Error('Passage no longer matches the saved source.');
      locator = {
        kind: 'block',
        path: evidence.path.slice(1).replace(/\//g, '.'),
      };
    }
  }
  if (page !== undefined) {
    if (
      !state.preview ||
      state.preview.mimeType !== 'application/pdf' ||
      !Number.isInteger(page) ||
      page < 1 ||
      page > 100000
    )
      throw Error('PDF page is not ready for capture.');
    locator = { kind: 'page', page };
  }
  return {
    scope: state.scope,
    ...state.host,
    offline: !!state.downloaded,
    resourceId: target.id,
    targetTitle: target.title,
    targetType: target.type,
    mimeType: 'mimeType' in target ? target.mimeType : undefined,
    baseRevision: target.revision ?? '',
    quote: evidence?.quote ?? '',
    context: evidence?.context ?? '',
    locator,
    workspaceName: sourcePresentation(state).workspace,
  };
}
export function locatorLabel(locator: Locator) {
  return locator.kind === 'page'
    ? `PDF page ${locator.page}`
    : locator.kind === 'block'
    ? `Note block ${locator.path}`
    : 'Whole resource';
}
