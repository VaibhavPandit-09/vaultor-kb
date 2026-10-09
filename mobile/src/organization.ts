import type { ResourceSummary, BrowseRow } from './browse';
import { HostError, type MobileWorkspace } from './workspace';
export type Collection = {
  id: string;
  name: string;
  favorite: boolean;
  count: number;
};
export type Target = {
  kind: 'resource' | 'collection' | 'new-collection' | 'bulk';
  id: string;
  title: string;
  resources?: ResourceSummary[];
  resource?: ResourceSummary;
};
export type Pending = { scope: string; key: string; id: string; body: any };
export type LifecycleAction = 'trash' | 'restore' | 'purge';
export type LifecycleResult = {
  resourceId: string;
  operationId: string;
  status: string;
  detail?: string;
  warnings?: string[];
};
export type Reference = ResourceSummary & {
  available: boolean;
  trashed: boolean;
  occurrences: { path: string; kind: string; label: string }[];
  noteLinks: number;
  fileLinks: number;
  images: number;
  otherLinks: number;
};
export type ReferencePage = {
  items: Reference[];
  totalItems: number;
  totalPages: number;
  totalOccurrences: number;
  sourceRevision: string;
};
export const targetFor = (row: BrowseRow): Target => ({
  ...row,
  resource: row.resource,
});
/** Captures a workspace/connection. A dismissed or superseded sheet cannot target another host. */
export class Organization {
  readonly scope: string;
  private readonly epoch?: string;
  private running = new Set<string>();
  private definitiveFailures = new Set<string>();
  constructor(readonly model: MobileWorkspace) {
    this.scope = model.state.scope;
    this.epoch = model.state.host?.epoch;
  }
  check() {
    if (
      !this.scope ||
      this.model.state.scope !== this.scope ||
      this.model.state.host?.epoch !== this.epoch
    )
      throw Error('Workspace changed. Reopen Actions.');
  }
  async api(path: string, method = 'GET', body?: unknown, revision?: string) {
    this.check();
    const r = await this.model.organizationApi(path, method, body, revision);
    this.check();
    return r;
  }
  async exclusive<T>(key: string, action: () => Promise<T>) {
    this.check();
    if (this.running.has(key)) throw Error('This action is already pending.');
    this.running.add(key);
    try {
      return await action();
    } finally {
      this.running.delete(key);
    }
  }
  pending(key: string) {
    this.check();
    return this.model.organizationStorage<Pending | null>('getOrganization', {
      scope: this.scope,
      key,
    });
  }
  private async remember(key: string, body: (id: string) => any) {
    let p = await this.pending(key);
    this.check();
    if (!p) {
      const id = await this.model.operationId();
      this.check();
      p = { scope: this.scope, key, id, body: body(id) };
      await this.model.organizationStorage('putOrganization', p);
      this.check();
    }
    return p;
  }
  async acknowledge(p: Pending) {
    this.check();
    await this.model.organizationStorage('ackOrganization', {
      scope: this.scope,
      key: p.key,
      id: p.id,
    });
    this.check();
  }
  async metadata(target: Target): Promise<any> {
    if (target.kind === 'collection')
      return this.api('/collections/' + target.id);
    if (target.resource?.trashedAt) return target.resource;
    return this.api('/resources/' + target.id + '/summary');
  }
  async list(
    kind: 'collections' | 'resources' | 'tags/browse',
    q = '',
    page = 0,
  ) {
    return this.api(
      '/' +
        kind +
        '?page=' +
        page +
        '&size=100&q=' +
        encodeURIComponent(q.slice(0, 100)),
    );
  }
  async createCollection(name: string) {
    return this.exclusive('create', async () => {
      name = name.trim();
      if (!name || name.length > 100)
        throw Error('Enter a name of 1–100 characters.');
      const p = await this.remember('collection:create', () => ({
        name,
        resourceIds: [],
      }));
      let result;
      try {
        result = await this.api(
          '/collections/creations/' + p.id,
          'PUT',
          p.body,
        );
      } catch (error) {
        if (
          error instanceof HostError &&
          error.status === 409 &&
          error.code === 'CONFLICT'
        ) {
          // Name conflict is definitive only after this UUID is confirmed absent.
          // Busy/transport failures and an existing UUID retain their exact payload.
          try {
            await this.api('/collections/' + p.id);
          } catch (lookup) {
            if (lookup instanceof HostError && lookup.status === 404) {
              await this.acknowledge(p);
              throw Error(
                'A collection with this name already exists. Choose another name.',
              );
            }
          }
        }
        throw error;
      }
      await this.acknowledge(p);
      await this.model.organizationChanged();
      return result as Collection;
    });
  }
  async rename(target: Target, title: string, revision?: string) {
    return this.exclusive('rename:' + target.id, async () => {
      title = title.trim();
      const limit = target.kind === 'collection' ? 100 : 500;
      if (!title || title.length > limit)
        throw Error('Enter a name of 1–' + limit + ' characters.');
      if (target.kind === 'collection')
        await this.api('/collections/' + target.id, 'PUT', { name: title });
      else {
        await this.model.prepareResource(target.id);
        this.check();
        const fresh = await this.metadata(target);
        if (
          revision &&
          fresh.revision !== revision &&
          (this.model.state.note?.id !== target.id ||
            this.model.state.note.revision !== fresh.revision)
        )
          throw Error('Resource changed. Reopen Actions to review it.');
        await this.api(
          '/resources/' + target.id + '/title',
          'PATCH',
          { title },
          '"' + fresh.revision + '"',
        );
      }
      if (
        target.kind === 'collection' &&
        this.model.state.browse.collection?.id === target.id
      )
        this.model.updateBrowse({
          ...this.model.state.browse,
          collection: { id: target.id, name: title },
        });
      await this.model.organizationChanged(
        target.kind === 'resource' ? target.id : undefined,
      );
    });
  }
  async pin(target: Target, favorite: boolean) {
    await this.api(
      '/' +
        (target.kind === 'collection' ? 'collections' : 'resources') +
        '/' +
        target.id +
        '/favorite',
      'PUT',
      { favorite },
    );
    await this.model.organizationChanged();
  }
  async membership(ids: string[], collectionId: string, add: boolean) {
    if (!ids.length || ids.length > 100) throw Error('Choose 1–100 resources.');
    await this.api('/organization/memberships', 'POST', {
      resourceIds: ids,
      kind: 'collection',
      targetId: collectionId,
      action: add ? 'add' : 'remove',
    });
    await this.model.organizationChanged();
  }
  async tag(id: string, name: string, add: boolean, tagId?: string) {
    name = name.trim();
    if (!name || name.length > 100)
      throw Error('Tag must contain 1–100 characters.');
    // Names belong in JSON: the host deliberately rejects encoded API path segments.
    const tag = add ? await this.api('/tags', 'POST', { name }) : { id: tagId };
    if (!tag.id) throw Error('Refresh the tag before removing its membership.');
    await this.api('/organization/memberships', 'POST', {
      resourceIds: [id],
      kind: 'tag',
      targetId: tag.id,
      action: add ? 'add' : 'remove',
    });
    await this.model.organizationChanged();
  }
  async deleteCollection(id: string) {
    await this.api('/collections/' + id, 'DELETE');
    if (this.model.state.browse.collection?.id === id)
      this.model.updateBrowse({
        ...this.model.state.browse,
        collection: undefined,
        page: 0,
        scroll: 0,
      });
    await this.model.organizationChanged();
  }
  async review(
    resources: ResourceSummary[],
    action: LifecycleAction,
    keep = false,
  ) {
    const result: { resource: ResourceSummary; sources: number }[] = [];
    for (const resource of resources) {
      this.check();
      if (action === 'trash')
        await this.model.prepareResource(resource.id, keep);
      this.check();
      const fresh =
        action === 'trash'
          ? await this.api('/resources/' + resource.id + '/summary')
          : resource;
      if (!fresh.revision)
        throw Error('No resource revision. Refresh this page.');
      const usage = await this.api('/resources/' + resource.id + '/usage');
      result.push({ resource: fresh, sources: usage.sources });
    }
    return result;
  }
  async lifecycle(
    resource: ResourceSummary,
    action: LifecycleAction,
  ): Promise<LifecycleResult> {
    return this.exclusive(action + ':' + resource.id, async () => {
      const key = 'lifecycle:' + resource.id + ':' + action;
      let p = await this.pending(key);
      if (action === 'purge' && resource.cleanupPending) {
        const body = await this.api(
          '/resources/' + resource.id + '/lifecycle-pending',
        );
        if (
          body.resourceId !== resource.id ||
          body.action !== 'purge' ||
          !/^[a-f0-9-]{36}$/i.test(body.operationId ?? '')
        )
          throw Error(
            'Invalid cleanup identity. Refresh Trash before retrying.',
          );
        // Another device may have committed the durable intent after our request
        // failed. The server's committed identity owns cleanup from that point.
        if (p && p.id !== body.operationId) {
          await this.acknowledge(p);
          p = null;
        }
        if (p && p.body.revision !== body.revision)
          throw Error('Cleanup identity changed unexpectedly. Refresh Trash.');
        if (!p) {
          p = { scope: this.scope, key, id: body.operationId, body };
          await this.model.organizationStorage('putOrganization', p);
        }
      }
      p =
        p ??
        (await this.remember(key, id => ({
          operationId: id,
          resourceId: resource.id,
          action,
          revision: resource.revision,
        })));
      const [result] = await this.api('/resources/lifecycle', 'PUT', [p.body]);
      if (
        !result ||
        result.operationId !== p.id ||
        result.resourceId !== resource.id
      )
        throw Error('Uncertain lifecycle reply. Retry the same operation.');
      if (result.status === 'failed') this.definitiveFailures.add(key);
      else this.definitiveFailures.delete(key);
      if (['trashed', 'restored', 'purged'].includes(result.status))
        await this.acknowledge(p);
      if (result.status !== 'failed')
        await this.model
          .organizationChanged(resource.id, action !== 'restore')
          .catch(e => this.model.report(e));
      return result;
    });
  }
  async reviewLatest(resource: ResourceSummary, action: LifecycleAction) {
    const key = 'lifecycle:' + resource.id + ':' + action;
    const p = await this.pending(key);
    // A committed purge is irreversible; its original request must never be replaced.
    if (resource.cleanupPending)
      throw Error('Retry the existing permanent deletion.');
    if (p && !this.definitiveFailures.has(key))
      throw Error('Outcome is uncertain. Retry the existing operation first.');
    if (p) await this.acknowledge(p);
    this.definitiveFailures.delete(key);
  }
  async references(
    id: string,
    direction: 'incoming' | 'outgoing',
    page: number,
  ): Promise<ReferencePage> {
    return this.api(
      '/resources/' +
        id +
        '/references?direction=' +
        direction +
        '&page=' +
        page +
        '&size=30',
    );
  }
}
