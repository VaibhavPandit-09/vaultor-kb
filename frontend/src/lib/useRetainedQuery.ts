import { useEffect, useState } from 'react';
import { affectsScope, subscribeResourceChanges, type RefreshScope } from './resourceEvents';

/** Same-query refreshes retain rows. Criteria changes never display another query's results. */
export function useRetainedQuery<T>(key: string, enabled: boolean, scope: RefreshScope, fetcher: (key: string, signal: AbortSignal) => Promise<T>) {
  const [revision, refresh] = useState(0);
  const [state, setState] = useState<{ key: string; data: T | null; pending: boolean; error: string }>({ key: '', data: null, pending: true, error: '' });
  useEffect(() => {
    let controller: AbortController | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const load = async (clear = false) => {
      controller?.abort();
      const request = new AbortController(); controller = request;
      setState(previous => ({ key, data: !clear && previous.key === key ? previous.data : null, pending: true, error: '' }));
      try {
        const data = await fetcher(key, request.signal);
        if (!request.signal.aborted) setState({ key, data, pending: false, error: '' });
      } catch (error) {
        if (!request.signal.aborted) setState(previous => ({ key, data: previous.key === key ? previous.data : null, pending: false, error: (error as {response?:{data?:{detail?:string}}})?.response?.data?.detail ?? (error instanceof Error ? error.message : 'Could not refresh. Retry.') }));
      }
    };
    if (enabled) void load();
    const unsubscribe = subscribeResourceChanges(change => {
      if (!enabled) {
        if(change.kind === 'workspace') setState({key,data:null,pending:true,error:''});
        return;
      }
      if (!affectsScope(change, scope)) return;
      controller?.abort(); clearTimeout(timer);
      if (change.kind === 'opened') {
        // Activation invalidates an older read immediately. Read again only after recency is persisted.
        if (change.phase === 'settled') timer = setTimeout(() => void load(), 150);
      } else void load(change.kind === 'workspace');
    });
    return () => { unsubscribe(); controller?.abort(); clearTimeout(timer); };
  }, [key, enabled, scope, fetcher, revision]);
  const matching = state.key === key;
  const data = matching ? state.data : null;
  return { data, error: matching ? state.error : '', loading: !matching || (state.pending && data === null), refreshing: matching && state.pending && data !== null, retry: () => refresh(value => value + 1) };
}
