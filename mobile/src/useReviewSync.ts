import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AppState,
  NativeEventEmitter,
  NativeModules,
  PermissionsAndroid,
  Platform,
} from 'react-native';
import { ReviewSyncRunner, type ReviewSyncMode } from './reviewSyncRunner';
const native = NativeModules.VaultorNative;
/** Native owns persistence/admission. JS schedules bounded foreground opportunities. */
export function useReviewSync() {
  const [revision, setRevision] = useState(0),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const runner = useRef<ReviewSyncRunner | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    const state = () =>
      void native
        .reviewSync('state', '{}')
        .then((raw: string) => {
          if (alive) setBusy(!!JSON.parse(raw).busy);
        })
        .catch(() => {
          if (alive) setBusy(false);
        });
    const owner = new ReviewSyncRunner(async mode => {
      if (AppState.currentState !== 'active') return;
      if (alive) {
        setBusy(true);
        setError('');
      }
      try {
        if (
          mode === 'now' &&
          Number(Platform.Version) >= 37 &&
          !(await PermissionsAndroid.check(
            PermissionsAndroid.PERMISSIONS.ACCESS_LOCAL_NETWORK,
          ))
        ) {
          const granted = await PermissionsAndroid.request(
            PermissionsAndroid.PERMISSIONS.ACCESS_LOCAL_NETWORK,
          );
          if (granted !== 'granted')
            throw Error(
              'Local-network permission is required to reach the source. Evidence remains protected.',
            );
        }
        await native.reviewSync(mode, '{}');
      } catch (e) {
        if (alive)
          setError(
            (e as Error).message ||
              'Delivery is unavailable. Evidence is retained.',
          );
      } finally {
        if (alive) {
          setRevision(v => v + 1);
          state();
        }
      }
    });
    runner.current = owner;
    let refresh: ReturnType<typeof setTimeout> | undefined;
    const events = new NativeEventEmitter(native).addListener(
      'VaultorReviewsChanged',
      kind => {
        if (refresh) clearTimeout(refresh);
        refresh = setTimeout(() => {
          if (alive) {
            setRevision(v => v + 1);
            state();
          }
        }, 80);
        if (kind === 'queued') void owner.request('catchUp');
      },
    );
    const app = AppState.addEventListener('change', value => {
      if (value === 'active') void owner.request('opportunity');
    });
    const timer = setInterval(() => void owner.request('catchUp'), 30000);
    void owner.request('opportunity');
    return () => {
      alive = false;
      owner.stop();
      if (runner.current === owner) runner.current = undefined;
      if (refresh) clearTimeout(refresh);
      events.remove();
      app.remove();
      clearInterval(timer);
    };
  }, []);
  const request = useCallback((mode: ReviewSyncMode) => {
    void runner.current?.request(mode);
  }, []);
  const sync = useCallback(() => request('now'), [request]);
  const catchUp = useCallback(() => request('catchUp'), [request]);
  const refresh = useCallback(() => request('refresh'), [request]);
  const reconnect = useCallback(() => request('opportunity'), [request]);
  return { revision, busy, error, sync, catchUp, refresh, reconnect };
}
