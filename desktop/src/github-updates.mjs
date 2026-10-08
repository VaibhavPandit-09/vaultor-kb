/** Public release transport only. Never attach workspace/device credentials. */
export const RELEASE_REPOSITORY = 'VaibhavPandit-09/vaultor-kb';
const hosts = new Set(['github.com', 'release-assets.githubusercontent.com', 'objects.githubusercontent.com']);
export function releaseAssetAddress(value, initial = false) {
 const url = new URL(value);
 if (url.protocol !== 'https:' || url.username || url.password || url.hash || !hosts.has(url.hostname) || (url.port && url.port !== '443')) throw new Error('Unexpected release download address.');
 if (initial && (url.hostname !== 'github.com' || !url.pathname.startsWith('/'+RELEASE_REPOSITORY+'/releases/download/'))) throw new Error('Update asset is outside the Vaultor release repository.');
 return url.href;
}
export async function githubAsset(fetcher, address, signal) {
 let url = releaseAssetAddress(address, true);
 for (let hops = 0; hops <= 4; hops++) {
  const response = await fetcher(url, { redirect: 'manual', signal, headers: { 'User-Agent': 'Vaultor-Updater' } });
  if (![301,302,303,307,308].includes(response.status)) return response;
  const location = response.headers.get('location'); await response.body?.cancel?.().catch(()=>{});
  if (!location || hops === 4) throw new Error('Release download redirects exceeded the supported limit.');
  url = releaseAssetAddress(new URL(location, url).href);
 }
}
export async function boundedJSON(response, limit) {
 if (!response.ok) throw new Error('Update check failed ('+response.status+'). Retry.');
 let size = 0; const chunks = [];
 try { for await (const chunk of response.body) { size += chunk.length; if (size > limit) throw new Error('Update metadata exceeds its supported size.'); chunks.push(chunk); } }
 finally { await response.body?.cancel?.().catch(()=>{}); }
 return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
export async function githubRelease(fetcher, platform, arch, newer, currentVersion) {
 const signal = AbortSignal.timeout(15000);
 const response = await fetcher('https://api.github.com/repos/'+RELEASE_REPOSITORY+'/releases?per_page=100', { redirect:'error', signal, headers:{Accept:'application/vnd.github+json','User-Agent':'Vaultor-Updater'} });
 const releases = await boundedJSON(response, 2*1024*1024);
 if (!Array.isArray(releases) || releases.length > 100) throw new Error('Invalid GitHub release list.');
 const suffix = platform === 'win32' && arch === 'x64' ? 'windows-x64.exe' : platform === 'darwin' && arch === 'arm64' ? 'mac-arm64.dmg' : null;
 if (!suffix) throw new Error('No release target for this device.');
 const choices = releases.filter(r=>!r.draft&&!r.prerelease&&/^v\d{1,5}\.\d{1,5}\.\d{1,5}$/.test(r.tag_name)&&newer(r.tag_name.slice(1),currentVersion)).map(r=>{
  const name='Vaultor-'+r.tag_name.slice(1)+'-'+suffix;
  const assets=Array.isArray(r.assets)?r.assets:[];
  const installer=assets.find(a=>a.name===name&&a.state==='uploaded'), manifest=assets.find(a=>a.name===name+'.vaultor.json'&&a.state==='uploaded');
  return installer&&manifest?{version:r.tag_name.slice(1),installer,manifest}:null;
 }).filter(Boolean).sort((a,b)=>newer(a.version,b.version)?-1:newer(b.version,a.version)?1:0);
 if (!choices.length) return null;
 const selected=choices[0];
 if(selected.manifest.size>16*1024) throw new Error('Release manifest exceeds 16 KiB.');
 const envelope=await boundedJSON(await githubAsset(fetcher,selected.manifest.browser_download_url,signal),16*1024);
 return {envelope,url:releaseAssetAddress(selected.installer.browser_download_url,true),version:selected.version,size:selected.installer.size};
}
