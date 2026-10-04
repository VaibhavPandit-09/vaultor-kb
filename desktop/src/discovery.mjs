import { Bonjour } from 'bonjour-service';
import { hostname } from 'node:os';
import { privateIP } from './network.mjs';

export function serviceItems(services) {
  const items = new Map();
  for (const service of services) {
    const id = service.txt?.hostId;
    if (typeof id !== 'string' || !/^[\w-]{1,80}$/.test(id) || !Number.isInteger(service.port) || service.port < 1 || service.port > 65535 || String(service.txt?.protocol) !== '1') continue;
    for (const address of (service.addresses || []).filter(privateIP).slice(0, 8)) {
      const key = id + ':' + address; if (items.size >= 64) break;
      items.set(key, { hostId: id, name: String(service.name || 'Nearby host').slice(0, 100), address: `https://${address}:${service.port}` });
    }
  }
  return [...items.values()];
}
export class Discovery {
  error = ''; browser = null; published = null;
  constructor() { this.bonjour = new Bonjour({}, error => { this.error = 'Nearby discovery unavailable. Use a manual address. ' + (error.code || ''); }); }
  start() {
    if (!this.browser) {
      this.browser = this.bonjour.find({ type: 'vaultor' });
      this.browser.on('up', () => { if (this.browser?.services.length >= 128) { this.browser.stop(); this.error = 'Nearby result limit reached. Use a manual address.'; } });
    }
    this.browser.update();
  }
  stop() { this.browser?.stop(); this.browser = null; }
  snapshot() { this.browser?.expire(); return { items: serviceItems(this.browser?.services || []), error: this.error }; }
  async resolve(hostId, address) {
    const temporary = !this.browser; this.start();
    try { for (let i = 0; i < 6; i++) { const items = this.snapshot().items.filter(item => item.hostId === hostId && item.address !== address); if (items.length) return items; await new Promise(r => setTimeout(r, 400)); } return []; }
    finally { if (temporary) this.stop(); }
  }
  advertise(hostId, port) {
    if (this.published?.port === port && this.published?.txt.hostId === hostId) return;
    this.withdraw(); this.published = this.bonjour.publish({ name: `${hostname().slice(0, 50)} · ${hostId.slice(0, 8)}`, type: 'vaultor', port, disableIPv6: true, txt: { hostId, protocol: '1' } });
    this.published.on('error', () => { this.error = 'Could not advertise this host. Manual addresses still work.'; });
  }
  withdraw() { this.published?.stop(); this.published = null; }
  destroy() { this.stop(); this.withdraw(); this.bonjour.destroy(); }
}
