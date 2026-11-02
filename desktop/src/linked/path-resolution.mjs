/** Pure matching over authorized relative metadata. Never grants filesystem access. */
export function markdownDestination(from, href, boundaryDepth = 0, nativeSource = true) {
  if(typeof href!=='string'||!href||href.length>4096||!href.isWellFormed())return;
  const hash=href.indexOf('#'),fragment=hash<0?'':href.slice(hash+1),raw=hash<0?href:href.slice(0,hash);
  let decoded;try{decoded=decodeURIComponent(raw).normalize('NFC');}catch{return;}
  if(decoded.startsWith('/')||/[\\\x00-\x1f]/.test(decoded)||/^[a-z][a-z0-9+.-]*:/i.test(raw)||raw.includes('?')||nativeSource&&/[:?]/.test(decoded))return;
  if(!decoded)return {relative:from,fragment};
  const parts=from.split('/').slice(0,-1);
  for(const part of decoded.split('/')){
    if(!part||part==='.')continue;
    if(part==='..'){if(parts.length<=boundaryDepth)return;parts.pop();}
    else {if(nativeSource&&(/[<>"|*]/.test(part)||/[. ]$/.test(part)||part.toLowerCase()==='.git'||part.toLowerCase().startsWith('.vaultor-recovery')))return;parts.push(part);}
  }
  if(!parts.length||parts.length>32)return;
  return {relative:parts.join('/'),fragment};
}
export function matchMarkdownPath(paths, relative) {
  return markdownPathMatcher(paths)(relative);
}
export function markdownPathMatcher(paths){
  const exact=new Map(),folded=new Map();
  for(const path of paths){const key=path.normalize('NFC');for(const [map,name] of [[exact,key],[folded,key.toLowerCase()]]){if(!map.has(name))map.set(name,[]);map.get(name).push(path);}}
  return relative=>{
    const direct=exact.get(relative);if(direct)return direct.length===1?direct[0]:undefined;
    const candidates=/\.[^/]+$/.test(relative)?[relative]:[relative,relative+'.md',relative+'.markdown',relative+'/README.md',relative+'/index.md'];
    const matches=new Set(candidates.flatMap(candidate=>folded.get(candidate.toLowerCase())??[]));
    if(matches.size===1)return matches.values().next().value;
  };
}
