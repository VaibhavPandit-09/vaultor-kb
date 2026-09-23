import { notifyResourceChange } from './resourceEvents';

/** Only the last activation in a burst matters for recency; writes never overlap. */
export class RecencyRecorder {
  private latest: string | null = null;
  private pending: string | null = null;
  private timer?: ReturnType<typeof setTimeout>;
  private running: AbortController | null = null;
  private ready = false;
  private generation = 0;
  private write: (id: string, signal: AbortSignal) => Promise<unknown>;
  private changed: (error: string) => void;
  constructor(write: (id: string, signal: AbortSignal) => Promise<unknown>, changed: (error: string) => void) { this.write=write; this.changed=changed; }
  open(id: string, retry = false) {
    if (this.latest === id && !retry) return;
    this.latest = id; this.pending = id; this.ready = false;
    notifyResourceChange({kind:'opened',id,phase:'pending'});
    clearTimeout(this.timer);
    this.timer = setTimeout(() => { this.ready = true; void this.flush(); }, 300);
  }
  retry() { if (this.latest) this.open(this.latest, true); }
  reset() { this.generation++; clearTimeout(this.timer); this.pending = this.latest = null; this.ready = false; this.running?.abort(); this.running = null; }
  private async flush() {
    if (this.running || !this.ready || !this.pending) return;
    const id = this.pending, generation = this.generation;
    this.pending = null;
    const request = new AbortController(); this.running = request;
    let error = '';
    try { await this.write(id, request.signal); }
    catch { error = 'Could not update Recent.'; }
    finally {
      if (generation === this.generation) {
        this.running = null;
        if (!this.pending) { this.changed(error); notifyResourceChange({kind:'opened',id,phase:'settled'}); }
        else void this.flush();
      }
    }
  }
}
