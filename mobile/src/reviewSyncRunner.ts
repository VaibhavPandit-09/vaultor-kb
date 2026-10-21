export type ReviewSyncMode = 'catchUp' | 'refresh' | 'opportunity' | 'now';
const priority: Record<ReviewSyncMode, number> = {
  catchUp: 0,
  refresh: 1,
  opportunity: 2,
  now: 3,
};
/** Keep one follow-up when a Review arrives after an in-flight native snapshot. */
export class ReviewSyncRunner {
  private pending?: ReviewSyncMode;
  private running?: Promise<void>;
  private stopped = false;
  constructor(
    private readonly execute: (mode: ReviewSyncMode) => Promise<void>,
  ) {}
  request(mode: ReviewSyncMode): Promise<void> {
    if (this.stopped) return Promise.resolve();
    if (!this.pending || priority[mode] > priority[this.pending])
      this.pending = mode;
    if (!this.running)
      this.running = Promise.resolve().then(async () => {
        try {
          while (this.pending && !this.stopped) {
            const next = this.pending;
            this.pending = undefined;
            await this.execute(next);
          }
        } finally {
          this.running = undefined;
        }
      });
    return this.running;
  }
  stop() {
    this.stopped = true;
    this.pending = undefined;
  }
}
