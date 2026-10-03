import { useEffect, useState, type ReactNode } from 'react';
import { ensureCompatible } from '../lib/connection';
export default function ConnectionGate({ children }: { children: ReactNode }) {
  const [attempt, setAttempt] = useState(0), [ready, setReady] = useState(false), [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    ensureCompatible().then(() => { if (active) setReady(true); }).catch(e => { if (active) setError(e instanceof Error ? e.message : 'Cannot connect to the server.'); });
    return () => { active = false; };
  }, [attempt]);
  if (ready) return children;
  return <main className="min-h-screen bg-background text-foreground flex items-center justify-center p-6"><div role="status" className="max-w-lg rounded-2xl border border-border p-6"><h1 className="text-xl font-semibold">{error ? 'Workspace unavailable' : 'Connecting to workspace…'}</h1>{error && <><p role="alert" className="my-4">{error}</p><button className="library-button" onClick={() => { setError(''); setAttempt(value => value + 1); }}>Retry</button></>}</div></main>;
}
