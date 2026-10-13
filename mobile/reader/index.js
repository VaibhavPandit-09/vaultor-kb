import {renderDocument} from './render.js';
let loadId='',sequence=0;const observers=[];const root=document.getElementById('document'),images=new Map();
const send=m=>window.ReactNativeWebView?.postMessage(JSON.stringify({protocol:1,loadId,...m}));
window.vaultorReceive=raw=>{let m;try{m=JSON.parse(raw);}catch{return;}if(m.type==='load'){
 observers.splice(0).forEach(o=>o.disconnect());loadId=m.loadId;images.clear();document.documentElement.dataset.theme=m.theme==='light'?'light':'dark';
 renderDocument(m.content,root,send,(resourceId,button,alt)=>{const token=String(++sequence);images.set(token,{button,resourceId,alt});const observer=new IntersectionObserver(entries=>{if(entries.some(e=>e.isIntersecting)){observer.disconnect();send({type:'thumbnail',token,resourceId});}},{rootMargin:'300px'});observers.push(observer);observer.observe(button);});
 requestAnimationFrame(()=>{window.scrollTo(0,Math.max(0,Number(m.scroll)||0));send({type:'loaded'});});
 }else if(m.type==='thumbnail'&&m.loadId===loadId){const item=images.get(m.token);if(!item)return;images.delete(m.token);if(typeof m.data==='string'&&m.data.startsWith('data:image/png;base64,')){const img=document.createElement('img');img.alt=item.alt;img.src=m.data;item.button.replaceChildren(img);}else {item.button.textContent='Image unavailable · Tap to preview';}}
};
let timer;window.addEventListener('scroll',()=>{clearTimeout(timer);timer=setTimeout(()=>send({type:'position',scroll:window.scrollY}),150);},{passive:true});send({type:'ready'});
