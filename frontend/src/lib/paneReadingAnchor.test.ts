// @vitest-environment jsdom
import { expect, it } from 'vitest';
import { capturePaneReadingAnchors } from './paneReadingAnchor';
it('holds the visible block through width reflow and ignores removed document nodes',()=>{
 const root=document.createElement('div');root.innerHTML='<div class="journey-viewport"><div class="note-orientation"></div><div class="ProseMirror"><p>Above</p><p>Reading</p></div></div>';document.body.append(root);
 const viewport=root.firstElementChild as HTMLElement, header=viewport.firstElementChild as HTMLElement;
 Object.defineProperties(viewport,{clientHeight:{value:400},clientWidth:{value:500}});
 viewport.getBoundingClientRect=()=>({top:20} as DOMRect);header.getBoundingClientRect=()=>({height:60} as DOMRect);
 const [above,reading]=root.querySelectorAll('p');above.getBoundingClientRect=()=>({bottom:50} as DOMRect);
 let top=90; reading.getBoundingClientRect=()=>({top,bottom:top+50} as DOMRect);
 const restore=capturePaneReadingAnchors(root);top=140;restore();expect(viewport.scrollTop).toBe(50);
 reading.remove();top=200;restore();expect(viewport.scrollTop).toBe(50);root.remove();
});
it('lets header compression move the reading edge without creating scroll feedback',()=>{
 const root=document.createElement('div');root.innerHTML='<div class="journey-viewport"><div class="note-orientation"></div><div class="ProseMirror"><p>Reading</p></div></div>';document.body.append(root);
 const viewport=root.firstElementChild as HTMLElement,header=viewport.firstElementChild as HTMLElement,block=root.querySelector('p')!;
 Object.defineProperties(viewport,{clientHeight:{value:400},clientWidth:{value:500}});
 let headerHeight=100,top=110;viewport.getBoundingClientRect=()=>({top:0} as DOMRect);header.getBoundingClientRect=()=>({height:headerHeight} as DOMRect);block.getBoundingClientRect=()=>({top,bottom:top+80} as DOMRect);
 const restore=capturePaneReadingAnchors(root);headerHeight=60;top=70;restore();expect(viewport.scrollTop).toBe(0);root.remove();
});
