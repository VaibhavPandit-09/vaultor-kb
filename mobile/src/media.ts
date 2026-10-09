import type { Host } from './workspace';
import type { Doc } from './bridge';
export function hasPlacement(
  doc: Doc | undefined,
  id: string,
  depth = 0,
): boolean {
  if (!doc || depth > 80) return false;
  return (
    (['image', 'resourceLink'].includes(doc.type) &&
      (doc.attrs as { resourceId?: string } | undefined)?.resourceId === id) ||
    (doc.content?.some(node => hasPlacement(node, id, depth + 1)) ?? false)
  );
}
export type Placement = {
  resourceId: string;
  alt: string;
  caption: string;
  width: number;
  alignment: 'left' | 'center' | 'right';
};
export type MediaBinding = {
  hostId: string;
  scope: string;
  noteId: string;
  anchor: string;
  loadId: string;
};
export type MediaInput = {
  id: string;
  title: string;
  mime?: string;
  image?: boolean;
  bytes: number;
  text?: string;
  resourceId?: string;
  binding?: MediaBinding;
};
export const normalizePlacement = (value: Partial<Placement>): Placement => ({
  resourceId: String(value.resourceId ?? ''),
  alt: String(value.alt ?? '').slice(0, 2000),
  caption: String(value.caption ?? '').slice(0, 4000),
  width: Math.round(Math.max(20, Math.min(100, Number(value.width) || 100))),
  alignment: ['left', 'right'].includes(value.alignment ?? '')
    ? (value.alignment as 'left' | 'right')
    : 'center',
});
export interface MediaPort {
  call<T>(action: string, input?: object): Promise<T>;
  current(): {
    host?: Host;
    scope: string;
    noteId?: string;
    loadId: string;
    editable: boolean;
  };
  send(value: object): void;
  protect(): Promise<void>;
}
/** Serial ordered queue; native catalog retains bytes/UUIDs until the insertion is protected. */
export class MediaQueue {
  private running = false;
  private committing = new Set<string>();
  constructor(private port: MediaPort) {}
  async insert(items: MediaInput[], anchor: string) {
    if (this.running)
      throw Error('An insertion is already pending. Resolve it first.');
    const source = this.port.current();
    if (!source.editable || !source.host || !source.noteId)
      throw Error('Open an editable source note first.');
    this.running = true;
    try {
      for (const item of items) {
        const binding: MediaBinding = {
          hostId: source.host.hostId,
          scope: source.scope,
          noteId: source.noteId,
          anchor,
          loadId: source.loadId,
        };
        if (
          item.binding &&
          (item.binding.scope !== binding.scope ||
            item.binding.noteId !== binding.noteId)
        )
          throw Error(
            'This input belongs to another source note. Reopen that note.',
          );
        await this.port.call('bind', { id: item.id, binding });
        let ready = item;
        if (!item.text)
          ready = await this.port.call<MediaInput>('upload', {
            id: item.id,
            ...source.host,
            scope: source.scope,
          });
        const now = this.port.current();
        if (
          now.scope !== source.scope ||
          now.loadId !== source.loadId ||
          now.noteId !== source.noteId ||
          now.host?.epoch !== source.host.epoch ||
          !now.editable
        )
          throw Error(
            'Source changed. Original retained; reopen the source and choose Insert here.',
          );
        // Wait for mapped-anchor acknowledgement, not merely a posted bridge message.
        await new Promise<void>((resolve, reject) => {
          this.ack.set(item.id, {
            resolve,
            reject,
            timer: setTimeout(() => {
              this.ack.delete(item.id);
              reject(
                Error(
                  'Insertion not acknowledged. Original retained; retry Insert here.',
                ),
              );
            }, 10000),
          });
          this.port.send({
            type: 'mediaInsert',
            anchor,
            inputId: item.id,
            text: item.text,
            image: item.image,
            resourceId: ready.resourceId,
            title: item.title,
          });
        });
      }
    } finally {
      this.running = false;
    }
  }
  private ack = new Map<
    string,
    {
      resolve(): void;
      reject(error: Error): void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();
  commit(id: string, message: object) {
    return new Promise<void>((resolve, reject) => {
      this.ack.set(id, {
        resolve,
        reject,
        timer: setTimeout(() => {
          this.ack.delete(id);
          reject(
            Error('Placement change not acknowledged. Original retained.'),
          );
        }, 10000),
      });
      this.port.send({ ...message, inputId: id });
    });
  }
  async inserted(id: string, valid: boolean) {
    const pending = this.ack.get(id);
    if (!pending) return;
    clearTimeout(pending.timer);
    this.ack.delete(id);
    if (!valid) {
      pending.reject(
        Error('Insertion point removed. File retained; choose Insert here.'),
      );
      return;
    }
    this.committing.add(id);
    try {
      await this.port.protect();
      await this.port.call('remove', { id });
      pending.resolve();
    } catch {
      pending.reject(
        Error(
          'Image inserted, but recovery could not be written. Do not insert twice; retry protection before removing the pending input.',
        ),
      );
    } finally {
      this.committing.delete(id);
    }
  }
  cancel() {
    for (const p of this.ack.values()) {
      clearTimeout(p.timer);
      p.reject(Error('Source closed. Pending input retained.'));
    }
    this.ack.clear();
  }
}
