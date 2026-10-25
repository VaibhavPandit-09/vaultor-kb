/** Derived owner-local memory only. No document bodies enter the resource DB,
 * archives or renderer storage. Bounded work is requested by reconciliation. */
export class LinkedSearch {
  constructor(registry){this.registry=registry;this.queue=[];this.pending=[];this.bodies=new Map();this.bytes=0;this.next=0;this.seen=new Set();this.live=new Set();this.scanned=0;this.limited=false;}
  async tick(request){
    this.registry.check(request);
    if(!this.queue.length&&!this.pending.length){
      if(Date.now()<this.next)return;
      this.queue=[...this.registry.roots.values()].filter(root=>root.enabled!==false).map(root=>({source:root.id,offset:0}));
      this.seen.clear();this.scanned=0;this.limited=false;this.next=Date.now()+30000;
    }
    for(let count=0;count<2&&this.queue.length;count++){
      const job=this.queue.shift();
      try{
        const page=await this.registry.list(request,{...job,limit:200});
        if(page.more)this.queue.push({...job,offset:job.offset+200});
        for(const entry of page.items){
          this.seen.add(entry.id);this.live.add(entry.id);
          if(entry.unsupported)continue;
          if(entry.directory){if(this.queue.length<10000)this.queue.push({source:entry.root,directory:entry.id,offset:0});else this.limited=true;}
          else if(entry.markdown){
            if(++this.scanned>10000){this.limited=true;continue;}
            if(entry.size>262144)continue;
            const key=[entry.identity,entry.size,entry.modified].join(':');
            if(this.bodies.get(entry.id)?.key!==key&&this.pending.length<10000)this.pending.push({id:entry.id,key});
          }
        }
      }catch{/* Root status records disconnection; never serve its cached body. */}
    }
    for(let count=0;count<4&&this.pending.length;count++){
      const job=this.pending.shift(),entry=this.registry.entries.get(job.id),root=this.registry.roots.get(entry?.root);if(!entry||!root||root.enabled===false)continue;
      let fields;
      try{
        const cap=await this.registry.grant(root);fields=await this.registry.native.call('open-linked',cap,entry.relative);this.registry.check(request);
        if(fields[2]!==entry.identity||Number(fields[6])>262144)continue;
        const text=new TextDecoder('utf-8',{fatal:true}).decode(Buffer.from(fields[5],'base64')).toLowerCase(),cost=text.length*2+512;
        this.drop(entry.id);
        while(this.bytes+cost>16*1024*1024&&this.bodies.size)this.drop(this.bodies.keys().next().value);
        this.bodies.set(entry.id,{key:job.key,text,cost});this.bytes+=cost;
      }catch{this.drop(entry.id);}finally{if(fields)await this.registry.native.call('close',fields[0]).catch(()=>{});}
    }
    if(!this.queue.length&&!this.pending.length){this.live=new Set(this.seen);for(const id of this.bodies.keys())if(!this.seen.has(id))this.drop(id);}
  }
  drop(id){const previous=this.bodies.get(id);if(previous){this.bytes-=previous.cost;this.bodies.delete(id);}}
  search(request,{query,mode='title'}){
    this.registry.check(request);if(typeof query!=='string'||query.length>500||!['title','content'].includes(mode))throw Error('LINKED_SEARCH_QUERY');
    const terms=query.trim().toLowerCase().split(/\s+/).filter(Boolean);if(!terms.length)return {items:[],indexing:!!this.queue.length,limited:this.limited,indexed:this.bodies.size};
    const items=[];
    for(const entry of this.registry.entries.values()){
      const root=this.registry.roots.get(entry.root);if(!root||root.enabled===false||root.status!=='available'||!entry.markdown||entry.directory||entry.unsupported||!this.live.has(entry.id))continue;
      const body=mode==='content'?this.bodies.get(entry.id)?.text??'':'',haystack=(entry.relative+' '+body).toLowerCase();if(!terms.every(term=>haystack.includes(term)))continue;
      const at=Math.max(0,body.indexOf(terms[0])-40),excerpt=body.slice(at,at+180);
      items.push({id:entry.id,type:'linked',title:entry.name,tags:[],content:{type:'linkedDocument',version:1,sourceId:entry.root,sourceName:root.name,relativePath:entry.relative},size:null,createdAt:'',updatedAt:'',sourceName:root.name,relative:entry.relative,searchSnippet:excerpt?{text:excerpt,highlights:[]}:undefined});if(items.length>=50)break;
    }
    return {items,indexing:!!(this.queue.length||this.pending.length),limited:this.limited||items.length===50,indexed:this.bodies.size};
  }
}
