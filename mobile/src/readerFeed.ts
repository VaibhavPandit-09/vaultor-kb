// Normal notifications reconcile data; only connection closure resumes the stream.
export class ReaderFeed {
  private active = true;
  private disposed = false;
  private cursor = '';
  private timer?: ReturnType<typeof setTimeout>;
  private retry = 1000;
  private ticket = 0;
  constructor(
    private port: {
      start(cursor: string): Promise<void>;
      stop(): void;
      reconnect(): Promise<void>;
      reconcile(): Promise<void>;
      reviews?(): void;
      error(e: unknown): void;
    },
  ) {}
  start() {
    const ticket = this.ticket;
    if (!this.active || this.disposed) return;
    void this.port.start(this.cursor).catch(() => {
      if (ticket === this.ticket) this.schedule();
    });
  }
  private schedule() {
    if (this.timer) clearTimeout(this.timer);
    if (!this.active || this.disposed) return;
    this.timer = setTimeout(() => void this.resume(), this.retry);
    this.retry = Math.min(30000, this.retry * 2);
  }
  private async resume() {
    const ticket = this.ticket;
    try {
      await this.port.reconnect();
      if (ticket === this.ticket && this.active && !this.disposed) this.start();
    } catch (e) {
      this.port.error(e);
      if (ticket === this.ticket) this.schedule();
    }
  }
  receive(event: any) {
    if (!this.active || this.disposed) return;
    if (event.closed) {
      this.schedule();
      return;
    }
    const m = event.event;
    if (
      !m ||
      typeof m.cursor !== 'string' ||
      m.cursor.length > 128 ||
      ![
        'reviews',
        'reset',
        'resources',
        'workspace',
        'host-restart',
        'operation',
        'organization',
        'settings',
        'tags',
      ].includes(m.kind)
    )
      return;
    this.cursor = m.cursor;
    this.retry = 1000;
    if (m.kind === 'reviews') {
      this.port.reviews?.();
      return;
    }
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      if (this.active && !this.disposed)
        void this.port.reconcile().catch(e => this.port.error(e));
    }, 250);
  }
  foreground(active: boolean) {
    this.active = active;
    this.ticket++;
    if (this.timer) clearTimeout(this.timer);
    if (active) void this.resume();
    else this.port.stop();
  }
  dispose() {
    this.disposed = true;
    this.active = false;
    this.ticket++;
    if (this.timer) clearTimeout(this.timer);
    this.port.stop();
  }
}
