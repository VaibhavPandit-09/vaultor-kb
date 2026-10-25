// Conservative byte-preserving UTF8 three-way combination. No Markdown serializer.
const lines=bytes=>bytes.toString('utf8').match(/[^\n]*\n|[^\n]+$/g)??[];
function hunk(base,changed){let start=0,end=base.length,to=changed.length;while(start<end&&start<to&&base[start]===changed[start])start++;while(end>start&&to>start&&base[end-1]===changed[to-1]){end--;to--;}return {start,end,lines:changed.slice(start,to)};}
export function combineVersions(base,local,disk){
  for(const bytes of [base,local,disk])new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(bytes);
  if(base.equals(disk))return Buffer.from(local);
  if(base.equals(local)||disk.equals(local))return Buffer.from(disk);
  const b=lines(base),a=hunk(b,lines(local)),c=hunk(b,lines(disk));
  if(!(a.end<c.start||c.end<a.start))throw Error('LINKED_COMBINATION_OVERLAP');
  const out=[...b];for(const part of [a,c].sort((x,y)=>y.start-x.start))out.splice(part.start,part.end-part.start,...part.lines);
  return Buffer.from(out.join(''),'utf8');
}
