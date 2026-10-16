export type ThemePort = {
  prepareTheme(tag: number, token: string): Promise<boolean>;
  revealTheme(token: string, duration: number): Promise<void>;
  cancelTheme(): void;
};
/** Latest intent wins, including a slow native capture. A failed capture can
 * never prevent a preference commit. Native adds its own bounded watchdog. */
export class ThemeTransition {
  private ticket = 0;
  constructor(private port: ThemePort) {}
  cancel() {
    this.ticket++;
    this.port.cancelTheme();
  }
  async change(tag: number, duration: number, commit: () => void) {
    const token = String(++this.ticket);
    this.port.cancelTheme();
    let captured = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    if (duration) {
      try {
        captured = await Promise.race([
          this.port.prepareTheme(tag, token),
          new Promise<boolean>(resolve => {
            timer = setTimeout(() => resolve(false), 200);
          }),
        ]);
      } catch {
      } finally {
        clearTimeout(timer);
      }
    }
    if (token !== String(this.ticket)) return;
    if (!captured) this.port.cancelTheme();
    commit();
    if (captured) {
      // React/native layout commits before the old-palette overlay is revealed.
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          if (token === String(this.ticket))
            void this.port.revealTheme(token, duration).catch(() => {
              if (token === String(this.ticket)) this.port.cancelTheme();
            });
        }),
      );
    }
  }
}
