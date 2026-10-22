import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, NativeEventEmitter, NativeModules } from 'react-native';
import type { ImportItem } from './imports';
const native = NativeModules.VaultorNative;
export const importCall = async <T = unknown>(
  action: string,
  value: object = {},
): Promise<T> =>
  JSON.parse(await native.collectedImports(action, JSON.stringify(value)));
/** Foreground opportunities only. Native journal is authoritative across process death. */
export function useImportQueue() {
  const [items, setItems] = useState<ImportItem[]>([]),
    [error, setError] = useState(''),
    [incoming, setIncoming] = useState(0),
    [busy, setBusy] = useState(false);
  const seen = useRef(new Set<string>()),
    running = useRef(false),
    followup = useRef(false),
    alive = useRef(true);
  const refresh = useCallback(async () => {
    try {
      const rows = await importCall<ImportItem[]>('list');
      if (!alive.current) return;
      const fresh = rows.some(
        r =>
          !seen.current.has(r.id) &&
          ['acquiring', 'collected', 'acquisitionInterrupted'].includes(
            r.state,
          ) &&
          (r.createdAt ?? Date.now()) > Date.now() - 60000,
      );
      rows.forEach(r => seen.current.add(r.id));
      setItems(rows);
      setError('');
      if (fresh) setIncoming(n => n + 1);
    } catch (e) {
      if (alive.current)
        setError(
          (e as Error).message ||
            'Import queue cannot be read. Keep app data and retry.',
        );
    }
  }, []);
  const sync = useCallback(
    async (force = false) => {
      if (AppState.currentState !== 'active') return;
      if (running.current) {
        followup.current = true;
        return;
      }
      running.current = true;
      if (alive.current) setBusy(true);
      try {
        do {
          followup.current = false;
          await importCall('sync', { force });
        } while (
          followup.current &&
          alive.current &&
          AppState.currentState === 'active'
        );
      } catch (e) {
        if (alive.current) setError((e as Error).message);
      } finally {
        running.current = false;
        if (alive.current) {
          setBusy(false);
          await refresh();
        }
      }
    },
    [refresh],
  );
  useEffect(() => {
    alive.current = true;
    void refresh();
    void sync();
    const event = new NativeEventEmitter(native).addListener(
      'VaultorImportsChanged',
      () => void refresh(),
    );
    const app = AppState.addEventListener('change', state => {
      if (state === 'active') {
        void refresh();
        void sync();
      }
    });
    const timer = setInterval(() => void sync(), 30000);
    return () => {
      alive.current = false;
      clearInterval(timer);
      event.remove();
      app.remove();
    };
  }, [refresh, sync]);
  return { items, error, incoming, busy, refresh, sync };
}
