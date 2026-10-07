import assert from 'node:assert/strict';
import { nativeTheme } from 'electron';
import { writeFile } from 'node:fs/promises';
import { join, basename } from 'node:path';
import { randomUUID } from 'node:crypto';

// One focused native session; only its owned, temporary workspace receives fixtures.
export async function runLayoutSmoke(window, directory, owned) {
  assert.ok(basename(directory).startsWith('vaultor-chrome-native-'));
  assert.equal(owned.status, 'ready');
  const evaluate = code => window.webContents.executeJavaScript(code);
  const wait = async code => {
    for (let i = 0; i < 150; i++) {
      if (await evaluate(code)) return;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    throw new Error('Focused browsing check did not settle: ' + code);
  };
  const capture = async name => {
    await new Promise(resolve => setTimeout(resolve, 250));
    await writeFile(join(directory, name), (await window.webContents.capturePage()).toPNG());
  };
  const request = async (path,method='GET',body) => {
    const multipart = body instanceof FormData;
    const response = await fetch(owned.address+'/api'+path,{method,headers:{'X-Vaultor-Owner':owned.accessKey,'X-Request-ID':randomUUID(),...(body&&!multipart?{'Content-Type':'application/json'}:{})},...(body?{body:multipart?body:JSON.stringify(body)}:{})});
    assert.ok(response.ok,`Disposable fixture ${method} ${path} failed (${response.status})`);
    const text=await response.text();return text?JSON.parse(text):undefined;
  };
  const click = async (selector,label) => evaluate(`(()=>{const b=[...document.querySelectorAll(${JSON.stringify(selector)})].find(b=>b.textContent.trim()===${JSON.stringify(label)});if(!b)throw new Error('Missing '+${JSON.stringify(label)});b.click();})()`);
  const navigate = async label => {await click('.sidebar-nav',label);await wait('document.querySelector(\'.library-heading h1\')?.textContent==='+JSON.stringify(label==='Recent'?'Recently opened':label));};
  const refresh = async () => {await click('.library-heading button','More');await click('.library-popover button','Refresh');};
  const geometry = async () => {
    const result = await evaluate(`(() => {
      const view = document.querySelector('.library-view');
      const heading = view.querySelector('.library-heading').getBoundingClientRect();
      const actions = view.querySelector('.library-heading-actions').getBoundingClientRect();
      const controls = document.querySelector('.desktop-window-controls').getBoundingClientRect();
      return {aligned: Math.abs(actions.right-heading.right)<2,
        contained: view.scrollWidth<=view.clientWidth+1 && heading.right<=innerWidth,
        clear: [...view.querySelectorAll('.library-heading button')].every(b => {
          const r=b.getBoundingClientRect(); return r.top>=controls.bottom || r.right<=controls.left;
        }), groups: [...view.querySelectorAll('.browse-rows')].every(group=>Math.abs(group.getBoundingClientRect().height-[...group.children].reduce((n,row)=>n+row.getBoundingClientRect().height,0)-2)<3)};
    })()`);
    assert.ok(result.aligned,'Actions align with the content edge');
    assert.ok(result.contained,'Long titles and narrow layouts remain bounded');
    assert.ok(result.clear,'Native controls do not cover actions');
    assert.ok(result.groups,'Group borders end after the last row');
  };
  window.setSize(1320,900);window.showInactive();nativeTheme.themeSource='dark';
  await wait("document.documentElement.dataset.theme==='dark'");
  await wait("Boolean(document.querySelector('.browse-empty'))");
  assert.ok(await evaluate("document.querySelector('.browse-empty').getBoundingClientRect().height<150"));
  await geometry();await capture('browse-empty.png');
  const note = title => request('/resources','POST',{title,type:'note',content:{type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'Disposable layout fixture.'}]}]}});
  const first=await note('A long note title about a project with an unusually long descriptive name for responsive layout verification');
  await note('Meeting notes');await note('Research');
  const file=new FormData();file.append('file',new Blob(['Disposable file fixture.'],{type:'text/plain'}),'Reference.txt');
  const uploaded=await request('/resources/file','POST',file);
  const collection=await request('/collections','POST',{name:'Project Atlas'});
  await request('/collections','POST',{name:'Research topics'});
  await request('/resources/'+first.id+'/favorite','PUT',{favorite:true});
  await request('/resources/'+uploaded.id+'/favorite','PUT',{favorite:true});
  await request('/collections/'+collection.id+'/favorite','PUT',{favorite:true});
  await request('/resources/'+first.id+'/open','POST');
  await request('/resources/'+uploaded.id+'/open','POST');
  await refresh();await wait("document.querySelectorAll('.library-view .library-row').length===4");
  await wait("document.querySelectorAll('#sidebar-pinned .sidebar-shortcut-open').length===3");
  assert.ok(await evaluate("document.querySelectorAll('#sidebar-pinned h3, #sidebar-recent h3').length===0"));
  await wait("document.querySelector('#sidebar-recent .sidebar-shortcut-open')?.textContent==='Reference.txt'");
  await evaluate("document.querySelector('button[aria-label=\"Filter pinned type\"]').click()");
  await click('.type-filter-options button','Files');
  await wait("document.querySelectorAll('#sidebar-pinned .sidebar-shortcut-open').length===1 && document.querySelector('#sidebar-pinned .sidebar-shortcut-open')?.textContent==='Reference.txt'");
  for(let i=0;i<50;i++){const settings=await request('/settings');if(Object.values(settings.local).some(local=>local.sidebarSections?.pinned?.type==='file'))break;if(i===49)throw new Error('Sidebar type preference was not persisted');await new Promise(resolve=>setTimeout(resolve,100));}
  await geometry();await capture('browse-library-dark.png');
  nativeTheme.themeSource='light';await wait("document.documentElement.dataset.theme==='light'");
  await geometry();await capture('browse-library-light.png');
  await navigate('Pinned');await wait("document.querySelectorAll('.library-view .library-row').length===3");
  await geometry();await capture('browse-pinned.png');
  await navigate('Collections');await wait("document.querySelectorAll('.library-view .library-row').length===2");
  await geometry();await capture('browse-collections.png');
  await click('.library-view .library-resource','Project AtlasCollection · 0 resources');
  await wait("Boolean(document.querySelector('.browse-empty'))");
  assert.ok(await evaluate("document.querySelector('.browse-empty').textContent.includes('This collection is empty')"));
  await navigate('Recent');await wait("document.querySelectorAll('.library-view .library-row').length===4");
  await geometry();await capture('browse-recent.png');
  // Collapse persists without clearing cached rows; hiding uses the same device settings.
  await click('.sidebar-section-heading button','Recent');
  await wait("document.querySelector('#sidebar-recent').hidden");
  await evaluate("document.querySelector('button[aria-label=\"Sidebar options\"]').click()");
  await wait("Boolean(document.querySelector('.library-popover'))");
  await evaluate("[...document.querySelectorAll('.library-popover label')].find(l=>l.textContent==='Pinned').querySelector('input').click()");
  await wait("document.querySelector('.sidebar-section[aria-label=\"Pinned\"]').hidden");
  await click('.library-popover button','Restore defaults');
  await wait("!document.querySelector('.sidebar-section[aria-label=\"Pinned\"]').hidden && !document.querySelector('#sidebar-recent').hidden");
  window.webContents.sendInputEvent({type:'keyDown',keyCode:'Escape'});window.webContents.sendInputEvent({type:'keyUp',keyCode:'Escape'});
  await wait("!document.querySelector('.library-popover')");
  assert.ok(await evaluate("document.activeElement.getAttribute('aria-label')==='Sidebar options'"));
  await navigate('Library');window.setSize(700,820);nativeTheme.themeSource='dark';
  await wait("document.documentElement.dataset.theme==='dark'");await geometry();await capture('browse-narrow.png');
  window.setSize(1320,900);
  // A searchable filter has bounded geometry even with many future choices (DOM-only layout fixtures).
  await evaluate("document.querySelector('button[aria-label=\"Filter resource type\"]').click()");
  await wait("Boolean(document.querySelector('.type-filter-options'))");
  await evaluate("(()=>{const list=document.querySelector('.type-filter-options');for(let i=0;i<25;i++){const row=list.firstElementChild.cloneNode(true);row.textContent='Future type '+i;row.setAttribute('aria-pressed','false');list.append(row);}return true;})()");
  assert.ok(await evaluate("(()=>{const list=document.querySelector('.type-filter-options');return list.clientHeight<=240&&list.scrollHeight>list.clientHeight&&document.querySelector('.library-popover').getBoundingClientRect().right<=innerWidth;})()"));
  window.webContents.sendInputEvent({type:'keyDown',keyCode:'Escape'});window.webContents.sendInputEvent({type:'keyUp',keyCode:'Escape'});
  await wait("!document.querySelector('.library-popover')");
  assert.ok(await evaluate("document.activeElement.getAttribute('aria-label')==='Filter resource type'"));
  for(let i=3;i<101;i++)await note('Fixture note '+String(i).padStart(3,'0'));
  await refresh();await wait("document.querySelector('.browse-group h2 span')?.textContent==='102' && document.querySelectorAll('.library-view .library-row').length===100");
  await click('.library-pagination button','Next');await wait("document.querySelectorAll('.library-view .library-row').length===2");
  await evaluate("document.querySelector('button[aria-label=\"Filter resource type\"]').click()");
  await click('.type-filter-options button','Notes');await wait("document.querySelector('.browse-group h2 span')?.textContent==='101' && document.querySelectorAll('.library-view .library-row').length===100");
  await click('.library-pagination button','Next');await wait("document.querySelectorAll('.library-view .library-row').length===1");
  await geometry();await capture('browse-paginated.png');
  console.log('Focused packaged browsing check passed: empty/sparse/paginated mixed lists, searchable bounded type filter, mixed pins, both themes, narrow long titles, collapse/hide/defaults, Escape/focus and native-control clearance.');
}
