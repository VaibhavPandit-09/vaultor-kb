import { CLIENT_BUILD, CLIENT_PROTOCOL, getAcceptedCapabilities } from './connection';
import { getConnection, transport } from './platform';
export type DiagnosticCategory = 'layout'|'ui'|'application'|'save'|'recovery'|'integrity';
export type DiagnosticSeverity = 'info'|'warning'|'error'|'critical';
export type DiagnosticEvent = {
  category: DiagnosticCategory; severity: DiagnosticSeverity; occurrences: number;
  id: string; timestamp: string; action: string; route: string;
  message: string; stack?: string; requestId?: string; build: string; serverBuild?: string; apiProtocolVersion: number; connectionEpoch: number;
};
const events: DiagnosticEvent[] = [];
let queue: DiagnosticEvent[] = [];
let sending = false;
let installed = false;
let failures = 0;
export const buildVersion = CLIENT_BUILD;
export function reportError(action: string, error: unknown, requestId?: string, notify = true, classification?:{category:DiagnosticCategory;severity:DiagnosticSeverity}) {
  const category=classification?.category??(action.startsWith('render.')?'application':/^(get |post |put |patch |delete |file\.|code\.)/.test(action)?'ui':'application');
  const severity=classification?.severity??(action.startsWith('render.')?'critical':category==='ui'?'warning':'error');
  const event: DiagnosticEvent = {
    category,severity,occurrences:1,id: crypto.randomUUID(), timestamp: new Date().toISOString(), action: action.slice(0, 120),
    route: window.location.pathname, build: buildVersion, requestId, serverBuild: getAcceptedCapabilities()?.serverBuild, apiProtocolVersion: CLIENT_PROTOCOL, connectionEpoch: getConnection().epoch,
    message: (error instanceof Error ? error.message : String(error)).slice(0, 1000),
    stack: error instanceof Error ? error.stack?.slice(0, 6000) : undefined,
  };
  if(severity==='info')console.info(`[${event.id}] ${action}`,error);else if(severity==='warning')console.warn(`[${event.id}] ${action}`,error);else console.error(`[${event.id}] ${action}`, error);
  events.push(event); if (events.length > 100) events.shift();
  queue.push(event); queue = queue.slice(-100);
  if (notify && severity!=='info') window.dispatchEvent(new CustomEvent('vaultor:error', { detail: event }));
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
let layoutEvent:DiagnosticEvent|undefined,layoutAt=0;
/** Only the browser's exact delivery notification, never a thrown Error or rejection. */
export function browserLayoutNotification(event:ErrorEvent) {
 return event.error==null&&(!event.filename||event.filename===window.location.href.split('#')[0])&&!event.lineno&&!event.colno&&['ResizeObserver loop completed with undelivered notifications.','ResizeObserver loop limit exceeded'].includes(event.message);
}
export function reportBrowserError(event:ErrorEvent) {
 if(!browserLayoutNotification(event))return reportError('browser.error',event.error??event.message);
 const now=Date.now(),epoch=getConnection().epoch;
 if(layoutEvent&&layoutEvent.connectionEpoch===epoch&&now-layoutAt<10000){layoutEvent.occurrences++;return layoutEvent;}
 layoutAt=now;layoutEvent=reportError('browser.layout-delivery',event.message,undefined,false,{category:'layout',severity:'info'});return layoutEvent;
}
export function installDiagnostics() {
  if (installed) return;
  installed = true;
  window.addEventListener('error', e => {reportBrowserError(e);if(browserLayoutNotification(e))e.preventDefault();});
  window.addEventListener('unhandledrejection', e => reportError('browser.rejection', e.reason));
  window.addEventListener('online', () => { failures = 0; });
  window.setInterval(() => void flushDiagnostics(), 3000);
}
