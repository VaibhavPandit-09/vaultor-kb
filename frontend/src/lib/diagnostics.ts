export type DiagnosticEvent = {
  id: string; timestamp: string; action: string; route: string;
  message: string; stack?: string; requestId?: string; build: string;
};
const events: DiagnosticEvent[] = [];
let queue: DiagnosticEvent[] = [];
let sending = false;
let installed = false;
let failures = 0;
export const buildVersion = 'modernization-1';
export function reportError(action: string, error: unknown, requestId?: string, notify = true) {
  const event: DiagnosticEvent = {
    id: crypto.randomUUID(), timestamp: new Date().toISOString(), action: action.slice(0, 120),
    route: window.location.pathname, build: buildVersion, requestId,
    message: (error instanceof Error ? error.message : String(error)).slice(0, 1000),
    stack: error instanceof Error ? error.stack?.slice(0, 6000) : undefined,
  };
  console.error(`[${event.id}] ${action}`, error);
  events.push(event); if (events.length > 100) events.shift();
  queue.push(event); queue = queue.slice(-100);
  if (notify) window.dispatchEvent(new CustomEvent('vaultor:error', { detail: event }));
  return event;
}
export const getLocalDiagnostics = () => [...events];
async function flush() {
  if (sending || !queue.length) return;
  sending = true;
  const batch = queue.splice(0, 20);
  try {
    const response = await fetch('/api/diagnostics/events', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(batch),
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) throw new Error('Diagnostic delivery failed');
    failures = 0;
  } catch { failures++; if (failures < 3) queue = [...batch, ...queue].slice(-100); else failures = 0; }
  finally { sending = false; }
}
export function installDiagnostics() {
  if (installed) return;
  installed = true;
  window.addEventListener('error', e => reportError('browser.error', e.error ?? e.message));
  window.addEventListener('unhandledrejection', e => reportError('browser.rejection', e.reason));
  window.addEventListener('online', () => { failures = 0; });
  window.setInterval(() => void flush(), 3000);
}
