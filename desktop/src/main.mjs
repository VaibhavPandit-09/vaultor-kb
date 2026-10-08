import { app, BrowserWindow, protocol, ipcMain, Menu, shell, clipboard, ClipboardItem, dialog, Tray, nativeImage, Notification, powerMonitor, safeStorage } from 'electron';
import { randomUUID } from 'node:crypto';
import { readFile,stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { isAbsolute, resolve, sep } from 'node:path';
import { Profiles } from './profiles.mjs';
import { DesktopTransport } from './transport.mjs';
import { UI_ORIGIN, externalAddress, trustedSender } from './policy.mjs';
import { OwnedServer } from './owned-server.mjs';
import { NativeFiles } from './files.mjs';
import { HostingPreferences } from './hosting.mjs';
import { Credentials } from './credentials.mjs';
import { Discovery } from './discovery.mjs';
import { Connections } from './connections.mjs';
import { startChangeStream } from './change-stream.mjs';
import { Updates } from './updates.mjs';
import { spawn } from 'node:child_process';

protocol.registerSchemesAsPrivileged([{ scheme: 'vaultor', privileges: { standard: true, secure: true, supportFetchAPI: true } },{scheme:'vaultor-file',privileges:{standard:true,secure:true,supportFetchAPI:true,stream:true}}]);
// A renamed developer Electron executable reports isPackaged=true; use our actual app layout.
const packaged = resolve(app.getAppPath()) === resolve(process.resourcesPath, 'app');
app.setName('Vaultor');
if(process.platform==='win32')app.setAppUserModelId('personal.vaultor.desktop');
const smokeDirectory = process.env.VAULTOR_SMOKE_DIRECTORY || process.env.VAULTOR_OWNED_SMOKE_DIRECTORY || process.env.VAULTOR_CHROME_SMOKE_DIRECTORY;
// Manual integration sessions need isolated data without automatically executing a smoke scenario.
const testDirectory = process.env.VAULTOR_DESKTOP_TEST_DIRECTORY;
if (testDirectory && !isAbsolute(testDirectory)) throw new Error('VAULTOR_DESKTOP_TEST_DIRECTORY must be an absolute existing directory.');
if (smokeDirectory || testDirectory) app.setPath('userData', smokeDirectory || testDirectory);
if (!app.requestSingleInstanceLock()) app.quit();
else {
  let window, profiles, owned, files, hosting, credentials, discovery, connections, tray, updates, quitWaiter, quitTimer, startupError = '', token = '', writes = Promise.resolve(), quitting = false, stoppedForQuit = false, closeExplained=false, updating=false;
  const transport = new DesktopTransport(), candidates = new Map();
  const queue = task => { const next = writes.catch(() => {}).then(task); writes = next; return next; };
  const state = () => { const data = !startupError && profiles?.snapshot(); if (data) data.profiles = data.profiles.map(p => p.source === 'bundled' ? { ...p, address: owned?.address ?? p.address } : p); return { ...(data || { version: 1, profiles: [], active: null, clientId: '' }), sessionId: data?.clientId ?? '', token, desktopBuild: app.getVersion(), localServer: owned?.snapshot(), error: startupError, access: { mode: token ? (transport.active?.profile.kind === 'remote' ? 'paired' : 'loopback') : 'unselected', pairingAvailable: credentials?.available() ?? false, trustConfigured: Boolean(transport.active?.profile.fingerprint), credentialsStored: Boolean(transport.active?.credential || transport.active?.ownerKey) } }; };
  async function probe(id, issueTicket = true) {
    const stored = profiles.get(id);
    const profile = stored.source === 'bundled' ? { ...stored, address: await owned.start() } : stored.kind === 'remote' ? await connections.resolve(stored) : stored;
    const probeTransport = new DesktopTransport();
    const temporary = randomUUID(); probeTransport.activate(profile, temporary, profile.source === 'bundled' ? owned.accessKey : profile.kind==='local'?credentials.get(profile.id):undefined, profile.kind === 'remote' ? credentials.get(profile.id) : undefined);
    const get = async path => {
      const response = await probeTransport.request({ token: temporary, id: randomUUID(), path, method: 'GET', headers: { 'X-Request-ID': randomUUID() }, timeout: 10000 });
      if (response.status !== 200) throw new Error(`Server check failed (${response.status}).`);
      return JSON.parse(new TextDecoder().decode(response.data));
    };
    const capabilities = await get('/capabilities');
    if(capabilities.changeFeed!==true || capabilities.scopedSettings!==true)throw new Error('Update this server to the current Vaultor version before connecting. D7 settings and change-feed contracts are required.');
    if (!Number.isInteger(capabilities.apiProtocolVersion) || capabilities.apiProtocolVersion < 2 || !Number.isInteger(capabilities.minimumClientProtocolVersion) || capabilities.minimumClientProtocolVersion < 1 || capabilities.minimumClientProtocolVersion > capabilities.apiProtocolVersion || typeof capabilities.serverBuild !== 'string') throw new Error('Update this server: compatibility information is missing.');
    if (capabilities.minimumClientProtocolVersion > 2) throw new Error('Update Vaultor Desktop to connect to this server.');
    const identity = await get('/workspace/identity');
    if(profile.source==='bundled')await updates?.confirmStart();
    if (typeof identity.id !== 'string' || !identity.id || identity.id.length > 100 || typeof identity.generation !== 'string' || identity.generation.length > 100) throw new Error('Server workspace identity is invalid.');
    const ticket = issueTicket ? randomUUID() : undefined;
    if (issueTicket) { candidates.clear(); candidates.set(ticket, { profile, identity, expires: Date.now() + 60000 }); }
    const { ca, ...publicProfile } = profile;
    return { ticket, profile: publicProfile, identity, differentWorkspace: Boolean(profile.workspaceId && profile.workspaceId !== identity.id), serverBuild: capabilities.serverBuild };
  }
  async function openOwnerBrowser() {
    if(!owned.address || !owned.accessKey) throw new Error('Start the local host first.');
    const response=await fetch(owned.address+'/api/owner/browser-ticket',{method:'POST',headers:{'X-Vaultor-Owner':owned.accessKey},redirect:'error',signal:AbortSignal.timeout(10000)});
    if(!response.ok) throw new Error('Browser handoff failed. Retry from the local host.');
    const value=await response.json();if(!/^[a-f0-9]{64}$/.test(value.ticket))throw new Error('Invalid browser handoff.');
    await shell.openExternal(owned.address+'/access#ticket='+value.ticket);
  }
  function handle(channel, work) {
    ipcMain.handle(channel, async (event, value) => {
      if (!trustedSender(event, window?.webContents)) throw new Error('Untrusted desktop caller.');
      try {
        if(updating && !['desktop:updates-status','desktop:window-status','desktop:window-action','desktop:quit-reply','desktop:cancel','desktop:cancel-file'].includes(channel))throw new Error('Vaultor is preparing an update. Wait for completion.');
        return { ok: true, value: await work(value) }; }
      catch (error) { return { ok: false, error: { code: error.name === 'AbortError' ? 'CANCELLED' : 'DESKTOP_ERROR', detail: error.message === 'fetch failed' ? 'Server unavailable. Check that it is running, then retry.' : String(error.message).slice(0, 1000) } }; }
    });
  }
  app.on('second-instance', () => { if (window) { if (window.isMinimized()) window.restore(); window.show(); window.focus(); } else app.emit('activate'); });
  app.whenReady().then(async () => {
    const appIcon=nativeImage.createFromPath(fileURLToPath(new URL('../assets/vaultor.png',import.meta.url)));
    if(process.platform==='darwin')app.dock?.setIcon(appIcon);
    const ui = fileURLToPath(new URL('../ui/', import.meta.url));
    protocol.handle('vaultor', async request => {
      try {
        const url = new URL(request.url), pathname = decodeURIComponent(url.pathname);
        if (url.host !== 'app' || request.method !== 'GET' || pathname.includes('\\') || pathname.includes('\0')) return new Response('Not found', { status: 404 });
        const file = resolve(ui, '.' + (pathname === '/' ? '/index.html' : pathname));
        if (!file.startsWith(resolve(ui) + sep)) return new Response('Not found', { status: 404 });
        const mime = file.endsWith('.html') ? 'text/html' : file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : file.endsWith('.svg') ? 'image/svg+xml' : 'application/octet-stream';
        return new Response(await readFile(file), { headers: { 'Content-Type': mime, 'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' vaultor-file: blob: data:; font-src 'self' data:; connect-src 'self' vaultor-file:; frame-src 'self' vaultor-file: blob: chrome-extension://mhjfbmdgcfjbbpaeojofohoefgiehjai; object-src 'none'; base-uri 'none'; form-action 'none'" } });
      } catch { return new Response('Build the desktop UI with npm run build.', { status: 404 }); }
    });
    profiles = new Profiles(app.getPath('userData'));
    owned = new OwnedServer({ bundle: packaged?resolve(process.resourcesPath,'bundle'):fileURLToPath(new URL('../bundle/', import.meta.url)), data: resolve(app.getPath('userData'), 'local-workspace') });
    const releaseTrust=JSON.parse(await readFile(fileURLToPath(new URL('../release-trust.json',import.meta.url)),'utf8'));
    updates=new Updates({directory:resolve(app.getPath('userData'),'updates'),workspace:owned.data,publicKey:releaseTrust.publicKey,currentVersion:app.getVersion(),onState:value=>window?.webContents.send('desktop:updates-state',value)});await updates.load();
    credentials = new Credentials(app.getPath('userData'), safeStorage); discovery = new Discovery();
    connections = new Connections({ owned, profiles, credentials, discovery });
    const stopAddressWatch = connections.watchAddresses(); app.once('will-quit', stopAddressWatch);
    files = new NativeFiles({directory:resolve(app.getPath('userData'),'file-cache'),owner:()=>transport.active,dialogs:{open:options=>dialog.showOpenDialog(window,options),save:options=>dialog.showSaveDialog(window,options)},openPath:path=>shell.openPath(path)});
    transport.files=files;await files.cleanup();protocol.handle('vaultor-file',request=>files.serve(request));
    hosting=new HostingPreferences({directory:app.getPath('userData'),app,executable:process.execPath,args:packaged?['--background']:[app.getAppPath(),'--background']});
    try{await hosting.load();}catch(error){hosting.error=error.message;}
    owned.on('status', () => {
      window?.webContents.send('desktop:local-status', owned.snapshot());
      if (owned.status === 'ready') void connections.sharing().catch(error => { owned.error = error.message; });
      else discovery.withdraw();
      if (owned.status === 'ready' && profiles?.data?.active === 'this-computer' && token) {
        const checkedToken = token;
        void probe('this-computer', false).then(checked => {
          if (token !== checkedToken || profiles.data.active !== 'this-computer' || owned.status !== 'ready') return;
          if (checked.differentWorkspace) throw new Error('The local workspace changed after restart. Reconnect to review it; drafts remain separate.');
          transport.activate(checked.profile, token, checked.profile.source === 'bundled' ? owned.accessKey : undefined);
        }).catch(error => { owned.error = error.message; transport.cancelAll(); transport.active = null; });
      } else if (['failed', 'restarting', 'stopped'].includes(owned.status) && profiles?.data?.active === 'this-computer') { transport.cancelAll(); transport.active = null; }
    });
    try { await profiles.load(); await credentials.load(); if (!process.env.VAULTOR_SMOKE_DIRECTORY) await profiles.ensureManaged(); } catch (error) { startupError = error.message; }
    if (!startupError && !smokeDirectory) void connections.resumeHosting();
    handle('desktop:bootstrap', () => state());
    handle('desktop:updates-status',()=>updates.snapshot());
    handle('desktop:updates-configure',feed=>updates.configure(feed));
    handle('desktop:updates-check',()=>updates.check());
    handle('desktop:updates-download',()=>updates.download());
    handle('desktop:updates-cancel',()=>updates.cancel());
    handle('desktop:updates-import',async()=>{
      const chosen=await dialog.showOpenDialog(window,{title:'Import Vaultor update manifest',properties:['openFile'],filters:[{name:'Signed Vaultor manifest',extensions:['json']}]});
      if(chosen.canceled)return updates.snapshot();return updates.importPackage(chosen.filePaths[0]);
    });
    const updateBarrier=async()=>{
      const approval=await requestQuitBarrier();if(!approval.success)throw new Error(approval.error);
      if(files.active.size||files.saves.size||files.dialogPending||transport.mutations.size)throw new Error('Finish current file/workspace operations before updating.');
      updating=true;window?.webContents.send('desktop:updates-state',{...updates.snapshot(),phase:'preparing'});
      discovery.withdraw();transport.cancelAll();
    };
    const installFile=async file=>{
      if(process.platform==='win32')await new Promise((done,reject)=>{const child=spawn(file,[],{detached:true,windowsHide:true,stdio:'ignore'});child.once('error',reject);child.once('spawn',()=>{child.unref();done();});});
      else {const error=await shell.openPath(file);if(error)throw new Error(error);}
      stoppedForQuit=true;discovery.destroy();await files.reset();window?.destroy();tray?.destroy();app.quit();
    };
    handle('desktop:updates-install',()=>queue(async()=>{
      const answer=await dialog.showMessageBox(window,{type:'question',buttons:['Cancel','Back up and update'],defaultId:0,cancelId:0,message:'Update Vaultor?',detail:'Save pending changes, stop this computer’s host, and create a verified local recovery backup. Paired clients disconnect. Remote servers remain untouched. '+(process.platform==='darwin'?'The disk image opens; quit and replace Vaultor.app manually.':'The personal installer opens; finish its steps, then reopen Vaultor.')});if(answer.response!==1)return updates.snapshot();
      try{const prepared=await updates.prepare({barrier:updateBarrier,stop:()=>owned.stop()});await installFile(prepared.file);}
      catch(e){updating=false;window?.webContents.send('desktop:updates-state',updates.snapshot());throw e;}
    }));
    handle('desktop:updates-restore',()=>queue(async()=>{
      const answer=await dialog.showMessageBox(window,{type:'warning',buttons:['Cancel','Restore local backup'],defaultId:0,cancelId:0,message:'Restore the workspace from before updating?',detail:'This replaces only the managed local workspace. Current data is retained in a separate folder. Use the previous app installer afterward if its schema is incompatible. Remote hosts and client drafts/preferences are untouched.'});if(answer.response!==1)return updates.snapshot();
      try{const restored=await updates.restore({barrier:updateBarrier,stop:()=>owned.stop()});updating=false;
        if(restored.previous){await dialog.showMessageBox(window,{message:'Recovery restored',detail:'The previous retained installer will open. Complete installation and reopen Vaultor.'});await installFile(restored.previous);}
        else {await dialog.showMessageBox(window,{message:'Recovery restored',detail:'Vaultor will quit. Reinstall the original version if needed; the restored workspace and preserved data remain on disk.'});stoppedForQuit=true;discovery.destroy();await files.reset();window?.destroy();tray?.destroy();app.quit();}
      }catch(e){updating=false;window?.webContents.send('desktop:updates-state',updates.snapshot());throw e;}
    }));
    handle('desktop:local-status', () => owned.snapshot());
    handle('desktop:hosting',()=>({...hosting.snapshot(),error:hosting.error||hosting.snapshot().error,server:owned.snapshot()}));
    handle('desktop:login',enabled=>queue(()=>{if(hosting.error)throw new Error(hosting.error);return hosting.setLogin(enabled);}));
    handle('desktop:nearby', enabled => { if (typeof enabled !== 'boolean') throw new Error('Invalid discovery action.'); if (enabled) discovery.start(); else discovery.stop(); return discovery.snapshot(); });
    handle('desktop:pair-inspect', value => queue(() => connections.prepare(value)));
    handle('desktop:pair-enroll', id => queue(() => connections.enroll(id)));
    handle('desktop:pair-status', id => queue(() => connections.poll(id)));
    handle('desktop:pair-cancel', () => queue(() => { connections.attempt = null; }));
    handle('desktop:forget', id => queue(async () => { await profiles.forget(id); await credentials.remove(id); return state(); }));
    handle('desktop:sharing', value => queue(() => connections.sharing(value)));
    handle('desktop:devices', async () => owned.address ? ({ devices: await connections.owner('/devices'), requests: await connections.owner('/pairings') }) : ({ devices: [], requests: [], stopped: true }));
    handle('desktop:decision', value => queue(() => { if (!value || !/^[\w-]{1,80}$/.test(value.id) || !/^[0-9]{6}$/.test(value.code) || typeof value.approve !== 'boolean') throw new Error('Check the six-digit code.'); return connections.owner('/pairings/' + value.id + (value.approve ? '/approve' : '/reject'), 'POST', { code: value.code }); }));
    handle('desktop:revoke', id => queue(() => { if (!/^[\w-]{1,80}$/.test(id)) throw new Error('Invalid device.'); return connections.owner('/devices/' + id, 'DELETE'); }));
    handle('desktop:certificate', async () => { await owned.start(); const response = await fetch(owned.address + '/api/owner/trust/certificate', { headers: { 'X-Vaultor-Owner': owned.accessKey }, redirect: 'error', signal: AbortSignal.timeout(10000) }); if (!response.ok) throw new Error('Certificate export failed.'); const text = await response.text(); if (text.length > 16000 || !text.startsWith('-----BEGIN CERTIFICATE-----')) throw new Error('Invalid public certificate.'); const chosen = await dialog.showSaveDialog(window, { defaultPath: 'Vaultor-host-ca.pem', filters: [{ name: 'Public certificate', extensions: ['pem'] }] }); if (!chosen.canceled && chosen.filePath) { const { writeFile } = await import('node:fs/promises'); await writeFile(chosen.filePath, text); } return chosen.canceled ? 'cancelled' : 'saved'; });
    handle('desktop:renew-trust', () => queue(() => connections.owner('/trust/renew', 'POST')));
    handle('desktop:open-shared-browser', async address => { const status = await connections.sharing(); if (!status.listening || !status.addresses.includes(address)) throw new Error('Choose a current shared browser address.'); await shell.openExternal(address); });
    handle('desktop:window-status', () => ({ maximized: window?.isMaximized() ?? false }));
    handle('desktop:window-action', action => { if (action === 'minimize') window.minimize(); else if (action === 'maximize') window.isMaximized() ? window.unmaximize() : window.maximize(); else if (action === 'close') window.close(); else if (action === 'menu') windowMenu().popup({ window }); else throw new Error('Invalid window action.'); return { maximized: window?.isMaximized() ?? false }; });
    handle('desktop:host-action',async action=>{
      if(action==='browser'){if(!owned.address)throw new Error('Start the local host first.');await openOwnerBrowser();return;}
      if(action==='start'){await owned.start();return;}
      if(action==='stop'){const approved=await requestQuitBarrier(false);if(!approved.success)throw new Error(approved.error);if(files.active.size||files.saves.size||files.dialogPending||transport.mutations.size)throw new Error('Finish current file operations first.');await owned.stop();return;}
      throw new Error('Invalid hosting action.');
    });
    for(const [channel,method] of [['pick-files','pick'],['read-file','read'],['begin-save','begin'],['save-chunk','chunk'],['finish-save','finish'],['cancel-save','cancel'],['file-action','download'],['release-file','release'],['cancel-file','cancelRequest']]) handle('desktop:'+channel,value=>files[method](value));
    handle('desktop:quit-reply',value=>{if(!quitWaiter||value?.id!==quitWaiter.id||typeof value.success!=='boolean')throw new Error('Quit request expired.');clearTimeout(quitTimer);quitWaiter.resolve({success:value.success,error:String(value.error||'').slice(0,1000),canKeepDrafts:value.canKeepDrafts===true});quitWaiter=null;});
    const authorizeLocal=async profile=>{
      if(profile.kind!=='local'||profile.source==='bundled')throw new Error('Choose an existing local server.');
      if(!credentials.available())throw new Error('Unlock the OS credential store first.');
      const chosen=await dialog.showOpenDialog(window,{title:'Choose this server’s host-access/owner.key',properties:['openFile']});if(chosen.canceled)throw new Error('Local server authorization cancelled.');
      if((await stat(chosen.filePaths[0])).size>128)throw new Error('Invalid owner key file.');const key=(await readFile(chosen.filePaths[0],'utf8')).trim();if(!/^[a-f0-9]{64}$/.test(key))throw new Error('Invalid owner key file.');
      const check=new DesktopTransport(),token=randomUUID();check.activate(profile,token,key);
      const response=await check.request({id:randomUUID(),token,path:'/workspace/identity',method:'GET',headers:{'X-Request-ID':randomUUID()},timeout:10000});if(response.status!==200)throw new Error('This key was not accepted by the local server.');
      await credentials.set(profile.id,key);return state();
    };
    handle('desktop:authorize-local',id=>queue(()=>authorizeLocal(profiles.get(id))));
    handle('desktop:add-profile', input => queue(async()=>{const profile=await profiles.add(input);try{await authorizeLocal(profile);return profile;}catch(e){await profiles.forget(profile.id);throw e;}}));
    handle('desktop:probe', id => probe(id));
    handle('desktop:activate', ticket => queue(async () => {
      if (transport.mutations.size||files.active.size||files.saves.size||files.dialogPending) throw new Error('Finish pending workspace or file changes before switching.');
      const candidate = candidates.get(ticket);
      if (!candidate || candidate.expires < Date.now()) throw new Error('Connection check expired. Retry.');
      const latest = await probe(candidate.profile.id);
      if (latest.identity.id !== candidate.identity.id || latest.identity.generation !== candidate.identity.generation) throw new Error('Workspace changed during connection. Retry.');
      if (transport.mutations.size||files.active.size||files.saves.size||files.dialogPending) throw new Error('Finish pending workspace or file changes before switching.');
      const actual = latest.profile.source === 'bundled' ? latest.profile : { ...profiles.get(latest.profile.id), address: latest.profile.address };
      const credential = actual.kind === 'remote' ? credentials.get(actual.id) : undefined;
      if (actual.kind === 'remote' && actual.address !== profiles.get(actual.id).address) await profiles.update(actual.id, { address: actual.address });
      await profiles.activate(candidate.profile.id, candidate.identity.id);
      await files.reset();
      token = randomUUID(); transport.activate(actual, token, actual.source === 'bundled' ? owned.accessKey : actual.kind==='local'?credentials.get(actual.id):undefined, credential); candidates.clear();
      return state();
    }));
    handle('desktop:request', value => transport.request(value));
    handle('desktop:stream', value => startChangeStream(transport,value,event=>window?.webContents.send('desktop:stream-event',event)));
    handle('desktop:cancel', id => { if (typeof id !== 'string' || id.length > 80) throw new Error('Invalid cancellation.'); transport.cancel(id); });
    handle('desktop:copy-image', async value => {
      if (!value || typeof value.resourceId !== 'string' || !/^[\w-]{1,80}$/.test(value.resourceId)) throw new Error('Invalid image resource.');
      files.connection(value.token);
      const response=await files.response('/resources/'+value.resourceId+'/image-png',value.token);
      const chunks=[];let size=0;
      for await (const chunk of response.body) {size+=chunk.length;if(size>160*1024*1024)throw new Error('Image clipboard representation exceeds its safety limit.');chunks.push(chunk);}
      files.connection(value.token);const image=nativeImage.createFromBuffer(Buffer.concat(chunks));if(image.isEmpty())throw new Error('Image cannot be copied. Download the original instead.');
      const dimensions=image.getSize();if(dimensions.width*dimensions.height>40000000)throw new Error('Image exceeds 40 megapixels.');await clipboard.write([new ClipboardItem({'image/png':new Blob([image.toPNG()],{type:'image/png'})})]);
    });
    handle('desktop:clipboard', text => { if (typeof text !== 'string' || text.length > 1048576) throw new Error('Clipboard text exceeds 1 MiB.'); return clipboard.writeText(text); });
    const createWindow = () => {
      window = new BrowserWindow({ icon: appIcon, frame: false, autoHideMenuBar: true, width: 1320, height: 900, minWidth: 600, minHeight: 480, show: !smokeDirectory && !process.argv.includes('--background') && !(process.platform==='darwin' && app.getLoginItemSettings().wasOpenedAtLogin), backgroundColor: '#0b1220', title: 'Vaultor', webPreferences: { preload: fileURLToPath(new URL('./preload.cjs', import.meta.url)), contextIsolation: true, sandbox: true, nodeIntegration: false, webSecurity: true, backgroundThrottling: false, plugins: true } });
      window.setMenuBarVisibility(false);
      if(process.platform==='win32')window.setAppDetails({appId:'personal.vaultor.desktop',relaunchDisplayName:'Vaultor',appIconPath:fileURLToPath(new URL('../assets/vaultor.ico',import.meta.url)),relaunchCommand:'"'+process.execPath+'"'+(packaged?'':' "'+app.getAppPath()+'"')});
      if (process.platform !== 'darwin') window.setMenu(null);
      for (const event of ['maximize', 'unmaximize', 'enter-full-screen', 'leave-full-screen']) window.on(event, () => window.webContents.send('desktop:window-status', { maximized: window.isMaximized() }));
      if (smokeDirectory) window.webContents.on('console-message', event => { if (event.level === 'error' || event.level === 'warning') console.error('Renderer:', event.message); });
      window.webContents.on('will-navigate', (event, url) => { if (url !== UI_ORIGIN + '/') { event.preventDefault(); try { void shell.openExternal(externalAddress(url)); } catch { /* Reject internal/custom/file destinations. */ } } });
      window.webContents.setWindowOpenHandler(({ url }) => { try { void shell.openExternal(externalAddress(url)); } catch { /* Blob previews stay in app; native file opening is D4. */ } return { action: 'deny' }; });
      window.webContents.on('will-attach-webview', event => event.preventDefault());
      window.webContents.on('will-prevent-unload', event => {
        const choice = dialog.showMessageBoxSync(window, { type: 'warning', buttons: ['Keep editing', 'Close'], defaultId: 0, cancelId: 0, message: 'Changes are still pending.', detail: 'Keep editing to save them. Closing relies on any recovery records already written.' });
        if (choice === 1) event.preventDefault(); else quitting = false;
      });
      const session = window.webContents.session;
      session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
      session.setPermissionCheckHandler(() => false);
      session.webRequest.onBeforeRequest((details, callback) => { const allowed = details.url.startsWith(UI_ORIGIN + '/') || details.url.startsWith('blob:' + UI_ORIGIN) || details.url.startsWith('data:') || details.url.startsWith('vaultor-file://cache/') || details.url.startsWith('chrome-extension://mhjfbmdgcfjbbpaeojofohoefgiehjai/') || details.url.startsWith('chrome://resources/'); callback({ cancel: !allowed }); });
      window.on('close', event => { if (!stoppedForQuit && tray) { event.preventDefault(); window.hide(); if (!closeExplained) { closeExplained=true; if (Notification.isSupported()) new Notification({title:'Vaultor is still running',body:'Use the tray icon to reopen Vaultor. Quit stops the local host.'}).show(); } } });
      window.on('closed', () => { transport.cancelAll(); window = undefined; });
      void window.loadURL(UI_ORIGIN + '/');
      return window;
    };
    const windowMenu = () => Menu.buildFromTemplate([
      { label: 'Connections & hosting…', click: () => window?.webContents.send('desktop:connections') },
      { label: 'Updates…', click: () => window?.webContents.send('desktop:updates-open') },
      ...(process.platform === 'darwin' ? [{ role: 'appMenu' }] : []),
      { label: 'File', submenu: [{ role: 'close' }, { role: 'quit' }] },
      { role: 'editMenu' },
      { label: 'View', submenu: [{ role: 'reload' }, { role: 'togglefullscreen' }, { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }, { role: 'toggleDevTools' }] },
      { role: 'windowMenu' },
    ]);
    Menu.setApplicationMenu(process.platform === 'darwin' ? windowMenu() : null);
    createWindow();
    const showApp=()=>{ if(!window) createWindow(); window.show();window.focus(); };
    app.on('activate',showApp);
    try {
      const trayIcon=process.platform==='darwin'?nativeImage.createFromPath(fileURLToPath(new URL('../assets/vaultorTemplate.png',import.meta.url))):nativeImage.createFromPath(fileURLToPath(new URL('../assets/vaultor-16.png',import.meta.url)));
      if(process.platform==='darwin')trayIcon.setTemplateImage(true);
      tray=new Tray(trayIcon);tray.setToolTip('Vaultor');tray.on('click',showApp);
      const trayMenu=()=>tray.setContextMenu(Menu.buildFromTemplate([{label:'Show Vaultor',click:showApp},{label:'Connections & hosting…',click:()=>{showApp();window.webContents.send('desktop:connections');}},{label:'Open in browser',enabled:Boolean(owned.address),click:()=>void openOwnerBrowser().catch(error=>{owned.error=error.message;})},{type:'separator'},{label:'Quit Vaultor',click:()=>app.quit()}]));
      trayMenu();owned.on('status',trayMenu);
    } catch(error){ console.error('Tray unavailable:',error.message);window.show(); }
    powerMonitor.on('resume',()=>{discovery.withdraw();if(owned.address)void connections.owner('/trust/renew','POST').then(()=>connections.sharing()).catch(error=>{owned.error=error.message;});window?.webContents.send('desktop:resume');});
    if (process.env.VAULTOR_SMOKE_DIRECTORY) {
      const { runSmoke } = await import('../scripts/native-smoke.mjs');
      try { await runSmoke(window, process.env.VAULTOR_SMOKE_DIRECTORY); app.exit(0); }
      catch (error) { console.error(error); app.exit(1); }
    }
    if (process.env.VAULTOR_OWNED_SMOKE_DIRECTORY) {
      const { runOwnedSmoke } = await import('../scripts/native-owned-smoke.mjs');
      try { await runOwnedSmoke(window, owned, smokeDirectory,()=>({activeFiles:files.active.size,pendingSaves:files.saves.size,dialogPending:files.dialogPending,mutations:transport.mutations.size})); app.quit(); }
      catch (error) { console.error(error); await owned.stop({ force: true }); app.exit(1); }
    }
    if (process.env.VAULTOR_CHROME_SMOKE_DIRECTORY) {
      const { runChromeSmoke } = await import('../scripts/native-chrome-smoke.mjs');
      try { await runChromeSmoke(window, smokeDirectory, owned); await owned.stop({ force: true }); discovery.destroy(); app.exit(0); }
      catch (error) { console.error(error); await owned.stop({ force: true }); discovery.destroy(); app.exit(1); }
    }
  }).catch(error => { console.error('Desktop startup failed:', error.message); app.exit(1); });
  app.on('window-all-closed', () => { if (!tray && !quitting) app.quit(); });
  async function requestQuitBarrier(keepDrafts=false) {
    if (!window || !token) return {success:true};
    if(quitWaiter) return {success:false,error:'A leave-workspace check is already running.'};
    return new Promise(resolve=>{const id=randomUUID();quitWaiter={id,resolve};quitTimer=setTimeout(()=>{quitWaiter=null;resolve({success:false,error:'Save/recovery confirmation timed out. Reopen Vaultor and retry.'});},30000);window.webContents.send('desktop:quit-request',{id,keepDrafts});});
  }
  async function finishQuit() {
    try {
      if(files?.active.size||files?.saves.size||files?.dialogPending||transport.mutations.size) throw new Error('Finish current file operations before quitting.');
      let approval=await requestQuitBarrier();
      if(!approval.success && approval.canKeepDrafts && !smokeDirectory){const choice=dialog.showMessageBoxSync(window,{type:'warning',buttons:['Keep editing','Keep drafts and quit'],defaultId:0,cancelId:0,message:approval.error,detail:'Quit only after local recovery records have been written.'});if(choice===1) approval=await requestQuitBarrier(true);}
      if(!approval.success) throw new Error(approval.error);
      if(owned.address&&!smokeDirectory){const choice=dialog.showMessageBoxSync(window,{type:'question',buttons:['Keep hosting','Quit'],defaultId:0,cancelId:0,message:'Quit Vaultor?',detail:'The local host stops. Connected browser clients will be disconnected.'});if(choice!==1){quitting=false;return;}}
      try {await owned.stop();} catch(error){if(smokeDirectory) throw error;const choice=dialog.showMessageBoxSync(window,{type:'warning',buttons:['Keep hosting','Force quit'],defaultId:0,cancelId:0,message:error.message,detail:'Force quit interrupts server operations. Their persisted journals are recovered on restart. Only this app’s owned server is stopped.'});if(choice!==1){quitting=false;return;}await owned.stop({force:true});}
      discovery?.destroy(); await files?.reset(); stoppedForQuit=true;window?.destroy();tray?.destroy();app.quit();
    } catch(error){quitting=false;window?.show(); if(smokeDirectory){console.error(error);app.exit(1);}else dialog.showMessageBoxSync(window,{type:'warning',message:'Vaultor is still running',detail:error.message});}
  }
  app.on('before-quit',event=>{if(stoppedForQuit||!owned)return;event.preventDefault();if(quitting)return;quitting=true;void finishQuit();});
}
