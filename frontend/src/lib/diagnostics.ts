import { CLIENT_BUILD, CLIENT_PROTOCOL, getAcceptedCapabilities } from './connection';
import { getConnection, transport } from './platform';
export type DiagnosticEvent = {
  id: string; timestamp: string; action: string; route: string;
  message: string; stack?: string; requestId?: string; build: string; serverBuild?: string; apiProtocolVersion: number; connectionEpoch: number;
};
const events: DiagnosticEvent[] = [];
let queue: DiagnosticEvent[] = [];
let sending = false;
let installed = false;
let failures = 0;
export const buildVersion = CLIENT_BUILD;
export function reportError(action: string, error: unknown, requestId?: string, notify = true) {
  const event: DiagnosticEvent = {
    id: crypto.randomUUID(), timestamp: new Date().toISOString(), action: action.slice(0, 120),
    route: window.location.pathname, build: buildVersion, requestId, serverBuild: getAcceptedCapabilities()?.serverBuild, apiProtocolVersion: CLIENT_PROTOCOL, connectionEpoch: getConnection().epoch,
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
export async function flushDiagnostics() {
  const epoch = getConnection().epoch;
  queue = queue.filter(event => event.connectionEpoch === epoch);
  if (sending || !queue.length || !getAcceptedCapabilities()) return;
  sending = true;
  const batch = queue.splice(0, 20);
  try {
    await transport.post('/diagnostics/events', batch, { signal: AbortSignal.timeout(5000) });
    failures = 0;
  } catch { failures++; if (failures < 3 && epoch === getConnection().epoch) queue = [...batch, ...queue].slice(-100); else failures = 0; }
  finally { sending = false; }
}
export function installDiagnostics() {
  if (installed) return;
  installed = true;
  window.addEventListener('error', e => reportError('browser.error', e.error ?? e.message));
  window.addEventListener('unhandledrejection', e => reportError('browser.rejection', e.reason));
  window.addEventListener('online', () => { failures = 0; });
  window.setInterval(() => void flushDiagnostics(), 3000);
}
