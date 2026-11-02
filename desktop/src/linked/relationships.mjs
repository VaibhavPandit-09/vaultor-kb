import {markdownDestination,markdownPathMatcher} from './path-resolution.mjs';

/** A graph over verified, bounded disk snapshots; never a filesystem grant. */
export function linkedRelationships(registry,bodies,live,id,direction,page=0,size=30){
  if(!['incoming','outgoing'].includes(direction)||!Number.isSafeInteger(page)||page<0)throw Error('LINKED_RELATIONSHIP_QUERY');
  const available=entry=>entry&&entry.available!==false&&live.has(entry.id)&&!entry.directory&&entry.markdown&&!entry.unsupported&&registry.roots.get(entry.root)?.enabled!==false&&registry.roots.get(entry.root)?.status==='available'&&registry.entryIndex.get(registry.entryKey(entry.root,entry.relative,entry.identity))===entry.id;
  const target=registry.entries.get(id);
  if(!available(target))return {items:[],page,size,totalItems:0,totalPages:0,totalOccurrences:0,sourceRevision:'',limited:false};
  // Markdown destinations cannot cross source grants. Ignore unrelated roots
  // before building path indexes or walking any derived edges.
  const entries=[];for(const entry of registry.entries.values())if(entry.root===target.root&&available(entry))entries.push(entry);
  const paths=new Map(entries.map(entry=>[entry.relative,entry])),match=markdownPathMatcher([...paths.keys()]);
  const grouped=new Map();let limited=false;
  for(const source of entries){
    if(direction==='outgoing'&&source.id!==id)continue;
    const body=bodies.get(source.id);if(!body||body.key!==[source.identity,source.size,source.modified].join(':')){limited=true;continue;}
    limited||=!!body.limited;
    for(const link of body.links??[]){
      const destination=markdownDestination(source.relative,link.href);if(!destination)continue;
      const path=match(destination.relative),to=paths.get(path);if(!to||direction==='incoming'&&to.id!==id)continue;
      const entry=direction==='incoming'?source:to;
      let row=grouped.get(entry.id);if(!row){row={id:entry.id,title:entry.name,type:'linked',available:true,trashed:false,noteLinks:0,fileLinks:0,images:0,otherLinks:0,occurrences:[]};grouped.set(entry.id,row);}
      row.noteLinks++;if(row.occurrences.length<20)row.occurrences.push({path:link.path,kind:'note-link',label:link.label});
    }
  }
  const items=[...grouped.values()].sort((a,b)=>a.title.localeCompare(b.title)||a.id.localeCompare(b.id));
  return {items:items.slice(page*size,(page+1)*size),page,size,totalItems:items.length,totalPages:Math.ceil(items.length/size),totalOccurrences:items.reduce((sum,row)=>sum+row.noteLinks,0),sourceRevision:'',limited};
}
