import axios from 'axios';

/** Backpressure before IPC; never retries a request or relaxes main-process admission. */
export class RequestSlots {
  private active = 0;
  private waiting: (() => void)[] = [];
  private maximum: number;
  constructor(maximum: number) { this.maximum = maximum; }
  acquire(signal: AbortSignal): Promise<() => void> {
    return new Promise((resolve, reject) => {
      const abort = () => {
        this.waiting = this.waiting.filter(item => item !== start);
        signal.removeEventListener('abort', abort);
        reject(new axios.CanceledError('Queued request cancelled'));
      };
      const start = () => {
        if (signal.aborted) { abort(); return; }
        signal.removeEventListener('abort', abort);
        this.active++;
        let released = false;
        resolve(() => {
          if (released) return; released = true;
          this.active--;
          this.waiting.shift()?.();
        });
      };
      if (signal.aborted) { abort(); return; }
      if (this.active < this.maximum) start();
      else { this.waiting.push(start); signal.addEventListener('abort', abort, {once:true}); }
    });
  }
}
