// Stored JSON is untrusted. Build DOM nodes only; never interpret stored HTML/CSS/URLs.
export function renderDocument(doc, root, send, image) {
  let budget=20000;
  const el=(tag,text)=>{const n=root.ownerDocument.createElement(tag);if(text!==undefined)n.textContent=text;return n;};
  const id=v=>typeof v==='string'&&/^[a-f0-9-]{36}$/i.test(v);
  function render(n,depth=0){
    if(!n||typeof n!=='object'||depth>64||--budget<0)return el('p','Content too complex to display. Original document is retained.');
    const a=n.attrs||{};
    if(n.type==='text'){
      let t=root.ownerDocument.createTextNode(typeof n.text==='string'?n.text:'');
      for(const m of Array.isArray(n.marks)?n.marks:[]){const tags={bold:'strong',italic:'em',strike:'s',code:'code',underline:'u',highlight:'mark',superscript:'sup',subscript:'sub'};if(tags[m.type]){const w=el(tags[m.type]);w.append(t);t=w;}else if(m.type==='link'){const w=el('span');w.append(t);w.title='External link';t=w;}}
      return t;
    }
    if(n.type==='resourceLink') {const b=el('button',String(a.label||a.title||'Linked resource'));b.className='resource';if(id(a.resourceId))b.onclick=()=>send({type:'open',resourceId:a.resourceId});else b.disabled=true;return b;}
    if(n.type==='image') {const figure=el('figure'),b=el('button','Load image'),caption=el('figcaption',String(a.caption||''));figure.style.width=Math.max(20,Math.min(100,Number(a.width ?? a.widthPercent)||100))+'%';figure.style.marginLeft=a.alignment==='right'?'auto':a.alignment==='center'?'auto':'0';figure.style.marginRight=a.alignment==='center'?'auto':'0';if(id(a.resourceId)){b.onclick=()=>send({type:'open',resourceId:a.resourceId});image(a.resourceId,b,String(a.alt||'Image'));}else b.disabled=true;figure.append(b,caption);return figure;}
    const tags={doc:'article',paragraph:'p',heading:'h'+Math.max(1,Math.min(6,Number(a.level)||1)),bulletList:'ul',orderedList:'ol',listItem:'li',taskList:'ul',taskItem:'li',blockquote:'blockquote',codeBlock:'pre',horizontalRule:'hr',hardBreak:'br',table:'table',tableRow:'tr',tableHeader:'th',tableCell:'td'};
    const tag=tags[n.type];if(!tag)return el('aside','Unsupported '+String(n.type||'block')+'. Original content retained.');
    const out=el(tag);if(n.type==='taskItem')out.append(el('span',a.checked?'☑ ':'☐ '));if(n.type==='orderedList'&&Number.isInteger(a.start))out.start=a.start;
    if(n.type==='paragraph'&&['left','center','right','justify'].includes(a.textAlign))out.style.textAlign=a.textAlign;
    for(const c of Array.isArray(n.content)?n.content:[])out.append(render(c,depth+1));
    if(n.type==='table'||n.type==='codeBlock'){const wrap=el('div');wrap.className='overflow';wrap.append(out);return wrap;}return out;
  }
  root.replaceChildren(render(doc));
}
