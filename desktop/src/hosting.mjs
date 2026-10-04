import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { join } from 'node:path';
export class HostingPreferences {
  constructor({ directory, app, executable, args = ['--background'] }) { Object.assign(this, { directory, app, executable, args }); this.value = { version: 1, startAtLogin: false }; }
  async load() { try { const value = JSON.parse(await readFile(join(this.directory, 'hosting.json'), 'utf8')); if (value.version !== 1 || typeof value.startAtLogin !== 'boolean') throw new Error('Invalid desktop hosting settings'); this.value = value; } catch (e) { if (e.code !== 'ENOENT') throw new Error('Desktop hosting settings could not be read. hosting.json was preserved.'); } }
  snapshot() {
    const supported = ['win32', 'darwin'].includes(process.platform);
    const actual = supported ? this.app.getLoginItemSettings({ path: this.executable, args: this.args }) : {};
    return { ...this.value, supported, registered: actual.openAtLogin === true, enabledByOS: actual.executableWillLaunchAtLogin ?? actual.openAtLogin ?? false, error: this.value.startAtLogin && (!actual.openAtLogin || actual.executableWillLaunchAtLogin === false) ? 'Start at login was disabled or denied by the OS. Enable it in startup settings or try again.' : '' };
  }
  async setLogin(enabled) {
    if (typeof enabled !== 'boolean' || !['win32', 'darwin'].includes(process.platform)) throw new Error('Start at login is unavailable on this platform.');
    const previous = this.value.startAtLogin;
    this.app.setLoginItemSettings({ openAtLogin: enabled, path: this.executable, args: this.args });
    const actual = this.app.getLoginItemSettings({ path: this.executable, args: this.args });
    if (actual.openAtLogin !== enabled || (enabled && actual.executableWillLaunchAtLogin === false)) { this.app.setLoginItemSettings({openAtLogin:previous,path:this.executable,args:this.args});throw new Error('The OS did not enable start at login. Check its startup settings.'); }
    this.value.startAtLogin = enabled;
    try { await mkdir(this.directory, { recursive: true }); const file = join(this.directory, 'hosting.json'); await writeFile(file + '.tmp', JSON.stringify(this.value), { mode: 0o600 }); await rename(file + '.tmp', file); }
    catch (e) { this.value.startAtLogin = previous; this.app.setLoginItemSettings({ openAtLogin: previous, path: this.executable, args: this.args }); throw new Error('Could not save the login preference. The previous registration was restored.'); }
    return this.snapshot();
  }
}
