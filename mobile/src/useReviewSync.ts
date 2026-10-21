import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AppState,
  NativeEventEmitter,
  NativeModules,
  PermissionsAndroid,
  Platform,
} from 'react-native';
const native = NativeModules.VaultorNative;
/** Foreground catch-up is explicit/reliable; completion in background is best effort. */
export function useReviewSync() {
  const [revision, setRevision] = useState(0),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const pending = useRef(false),
    alive = useRef(true);
  const sync = useCallback(async (manual = false, refresh = false) => {
    if (pending.current || (!manual && AppState.currentState !== 'active'))
      return;
    pending.current = true;
    if (alive.current) {
      setBusy(true);
      setError('');
    }
    try {
      if (
        manual &&
        Number(Platform.Version) >= 37 &&
        !(await PermissionsAndroid.check(
          PermissionsAndroid.PERMISSIONS.ACCESS_LOCAL_NETWORK,
        ))
      ) {
        const result = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.ACCESS_LOCAL_NETWORK,
        );
        if (result !== 'granted')
          throw Error(
            'Local-network permission is required to reach the source. Evidence remains protected.',
          );
      }
      await native.reviewSync(
        manual ? 'now' : refresh ? 'refresh' : 'catchUp',
        '{}',
      );
    } catch (e) {
      if (alive.current)
        setError(
          (e as Error).message ||
            'Delivery is unavailable. Evidence is retained.',
        );
    } finally {
      pending.current = false;
      if (alive.current) {
        setRevision(v => v + 1);
        void native
          .reviewSync('state', '{}')
          .then((raw: string) => {
            if (alive.current) setBusy(!!JSON.parse(raw).busy);
          })
          .catch(() => {
            if (alive.current) setBusy(false);
          });
      }
    }
  }, []);
  useEffect(() => {
    alive.current = true;
    let refresh: ReturnType<typeof setTimeout> | undefined;
    const events = new NativeEventEmitter(native).addListener(
      'VaultorReviewsChanged',
      (...args) => {
        const kind = args[0];
        if (refresh) clearTimeout(refresh);
        refresh = setTimeout(() => {
          if (alive.current) {
            setRevision(v => v + 1);
            void native
              .reviewSync('state', '{}')
              .then((raw: string) => {
                if (alive.current) setBusy(!!JSON.parse(raw).busy);
              })
              .catch(() => {});
          }
        }, 80);
        if (kind === 'queued') void sync();
      },
    );
    const state = AppState.addEventListener('change', value => {
      if (value === 'active') void sync();
    });
    const timer = setInterval(() => void sync(), 30000);
    void sync();
    return () => {
      alive.current = false;
      if (refresh) clearTimeout(refresh);
      events.remove();
      state.remove();
      clearInterval(timer);
    };
  }, [sync]);
  const manual = useCallback(() => void sync(true), [sync]);
  const catchUp = useCallback(() => void sync(), [sync]);
  const refresh = useCallback(() => void sync(false, true), [sync]);
  return {
    revision,
    busy,
    error,
    sync: manual,
    catchUp,
    refresh,
  };
}
