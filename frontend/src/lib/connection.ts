import { getConnection, transport } from './platform';
export const CLIENT_PROTOCOL = 2;
export const CLIENT_BUILD = import.meta.env.VITE_BUILD_VERSION || 'desktop-d7';
export type ServerCapabilities = { serverBuild: string; apiProtocolVersion: number; minimumClientProtocolVersion: number; authentication: boolean };
let accepted: { epoch: number; capabilities: ServerCapabilities } | undefined;
let pending: { epoch: number; promise: Promise<ServerCapabilities> } | undefined;
export function validateCapabilities(value: ServerCapabilities) {
  if (!value || !Number.isInteger(value.apiProtocolVersion) || !Number.isInteger(value.minimumClientProtocolVersion) || value.minimumClientProtocolVersion < 1 || value.minimumClientProtocolVersion > value.apiProtocolVersion || typeof value.serverBuild !== 'string') throw new Error('Server compatibility information is missing. Update the server before opening this workspace.');
  if (value.apiProtocolVersion < CLIENT_PROTOCOL) throw new Error('Update the server to open this workspace.');
  if (value.minimumClientProtocolVersion > CLIENT_PROTOCOL) throw new Error('Update this app to open this workspace.');
  return value;
}
export function getAcceptedCapabilities() { return accepted?.epoch === getConnection().epoch ? accepted.capabilities : undefined; }
export function ensureCompatible(): Promise<ServerCapabilities> {
  const epoch = getConnection().epoch;
  const cached = getAcceptedCapabilities(); if (cached) return Promise.resolve(cached);
  if (pending?.epoch === epoch) return pending.promise;
  const promise = transport.get<ServerCapabilities>('/capabilities', { timeout: 10000 }).then(({ data }) => {
    const capabilities = validateCapabilities(data);
    if (epoch !== getConnection().epoch) throw new Error('Connection changed during compatibility check.');
    accepted = { epoch, capabilities }; return capabilities;
  }).finally(() => { if (pending?.epoch === epoch) pending = undefined; });
  pending = { epoch, promise }; return promise;
}
