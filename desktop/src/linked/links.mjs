/** Normalize a Markdown destination under an already authorized document root.
 * URL strings are never interpreted as native absolute paths. Native code still
 * independently rejects unsafe components and traversed reparse points. */
export function relativeDestination(document,href){
  if(typeof href!=='string'||href.length>4096||!href.isWellFormed())throw Error('LINKED_LINK_INVALID');
  const hash=href.indexOf('#'),fragment=hash<0?'':href.slice(hash+1),raw=hash<0?href:href.slice(0,hash);
  let path;try{path=decodeURIComponent(raw);}catch{throw Error('LINKED_LINK_INVALID');}
  if(!path)return {relative:document,fragment};
  if(path.startsWith('/')||/[\\:?\x00-\x1f]/.test(path))throw Error('LINKED_LINK_OUTSIDE_SOURCE');
  const parts=document.split('/').slice(0,-1);
  for(const part of path.split('/')){
    if(part==='.'||!part)continue;
    if(part==='..'){if(!parts.length)throw Error('LINKED_LINK_OUTSIDE_SOURCE');parts.pop();continue;}
    if(part.toLowerCase()==='.git'||part.toLowerCase().startsWith('.vaultor-recovery')||/[<>"|*]/.test(part)||/[. ]$/.test(part))throw Error('LINKED_LINK_INVALID');
    parts.push(part);
  }
  if(!parts.length||parts.length>32)throw Error('LINKED_LINK_INVALID');
  return {relative:parts.join('/'),fragment};
}
export function assetMime(bytes,onDimensions=()=>{}){
  const size=(width,height)=>{if(!width||!height||width>8192||height>8192||width*height>16000000)throw Error('LINKED_IMAGE_SIZE_LIMIT');onDimensions(width,height);};
  if(bytes.length>=24&&bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))){size(bytes.readUInt32BE(16),bytes.readUInt32BE(20));return 'image/png';}
  if(bytes.length>=3&&bytes[0]===255&&bytes[1]===216&&bytes[2]===255){
    for(let offset=2;offset+9<bytes.length;){if(bytes[offset]!==255)break;const marker=bytes[offset+1],length=bytes.readUInt16BE(offset+2);if(length<2||offset+length+2>bytes.length)break;if([192,193,194].includes(marker)){size(bytes.readUInt16BE(offset+7),bytes.readUInt16BE(offset+5));return 'image/jpeg';}offset+=length+2;}
    throw Error('LINKED_IMAGE_HEADER_UNSUPPORTED');
  }
  if(bytes.length>=10&&['GIF87a','GIF89a'].includes(bytes.subarray(0,6).toString())){size(bytes.readUInt16LE(6),bytes.readUInt16LE(8));return 'image/gif';}
  if(bytes.length>=30&&bytes.subarray(0,4).toString()==='RIFF'&&bytes.subarray(8,12).toString()==='WEBP'){
    const kind=bytes.subarray(12,16).toString();
    if(kind==='VP8X')size(bytes.readUIntLE(24,3)+1,bytes.readUIntLE(27,3)+1);
    else if(kind==='VP8 '&&bytes[23]===157&&bytes[24]===1&&bytes[25]===42)size(bytes.readUInt16LE(26)&16383,bytes.readUInt16LE(28)&16383);
    else throw Error('LINKED_IMAGE_HEADER_UNSUPPORTED');
    return 'image/webp';
  }
  if(bytes.subarray(0,5).toString()==='%PDF-')return 'application/pdf';
  throw Error('LINKED_ASSET_PREVIEW_UNSUPPORTED');
}
