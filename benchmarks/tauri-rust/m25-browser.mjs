import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {setTimeout as sleep} from 'node:timers/promises';
export async function browserChecks(docker, network, name, bind, owner, ip, fileName) {
  const container=name+'-browser';
  const provision='mkdir -p /tmp/isolated/.pki/nssdb && certutil -N --empty-password -d sql:/tmp/isolated/.pki/nssdb && certutil -A -d sql:/tmp/isolated/.pki/nssdb -n "Disposable fixture CA" -t "C,," -i /tls/ca.pem && exec chromium --headless --disable-dev-shm-usage --no-sandbox --remote-debugging-pipe --user-data-dir=/tmp/isolated/profile about:blank 3<&0 4>&1';
  const poll=async (check,label)=>{
    let error;
    for(let i=0;i<140;i++){
      try{const result=await check();if(result)return result;}catch(e){error=e;}
      await sleep(125);
    }
    throw Error('Browser fixture timeout: '+label+(error?' ('+error.message+')':''));
  };
  const samples=[];
  let child, inspect;
  try {
    child=spawn('docker',['run','--rm','-i','--name',container,'--network',network,
      '--cap-drop','ALL','--security-opt','no-new-privileges:true','-e','HOME=/tmp/isolated',bind[0],bind[1].replace(',target=/tls,','/ca.pem,target=/tls/ca.pem,'),
      'vaultor-m24d-chromium:local','sh','-ec',provision],{windowsHide:true,stdio:['pipe','pipe','pipe']});
    let logs='', incoming='', id=0, sessionId;
    const pending=new Map();
    child.stderr.on('data',bytes=>logs=(logs+bytes.toString()).slice(-1500));
    child.stdout.on('data',bytes=>{
      incoming+=bytes.toString();
      let end;
      while((end=incoming.indexOf('\0'))!==-1){
        const message=incoming.slice(0,end);incoming=incoming.slice(end+1);
        const reply=JSON.parse(message), wait=pending.get(reply.id);
        if(reply.method==='Log.entryAdded') console.error('Browser log:',reply.params.entry.text);
        if(reply.method==='Network.responseReceived' && reply.params.response.url.includes('/browser/assets/')) console.error('Browser asset:',reply.params.response.status,reply.params.response.mimeType,reply.params.response.url);
        if(reply.method==='Network.loadingFailed') console.error('Browser load:',reply.params.errorText,reply.params.blockedReason);
        if(reply.method==='Runtime.exceptionThrown') console.error('Browser exception:',reply.params?.exceptionDetails?.exception?.description || reply.params?.exceptionDetails?.text);
        if(!wait)continue;
        pending.delete(reply.id);
        if(reply.error||reply.result?.exceptionDetails)wait.reject(Error(reply.error?.message||reply.result?.exceptionDetails?.exception?.description||reply.result?.exceptionDetails?.text));
        else wait.resolve(reply.result);
      }
    });
    child.on('exit',()=>{for(const wait of pending.values())wait.reject(Error('Chromium exited: '+logs));pending.clear();});
    const send=(method,params={},session)=>new Promise((resolve,reject)=>{
      const request=++id;
      const timeout=setTimeout(()=>{pending.delete(request);reject(Error(method+' timed out: '+logs));},15000);
      const done=callback=>value=>{clearTimeout(timeout);callback(value);};
      pending.set(request,{resolve:done(resolve),reject:done(reject)});
      child.stdin.write(JSON.stringify({id:request,method,params,...(session?{sessionId:session}:{})})+'\0');
    });
    child.stdin.on('error',()=>{});
    const target=await poll(async()=>(await send('Target.getTargets')).targetInfos.find(row=>row.type==='page'),'automation readiness');
    sessionId=(await send('Target.attachToTarget',{targetId:target.targetId,flatten:true})).sessionId;
    const cdp=(method,params)=>send(method,params,sessionId);
    const run=async expression=>(await cdp('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true})).result?.value;
    const base='https://'+ip+':8443';
    inspect=()=>run('({page:location.pathname,text:document.body?.innerText?.slice(0,300),scripts:[...document.scripts].map(s=>s.src)})');
    await cdp('Runtime.enable',{});
    await cdp('Network.enable',{});
    await cdp('Log.enable',{});
    await cdp('Page.enable',{});
    await cdp('Page.navigate',{url:base});
    await poll(()=>run("location.pathname==='/access' && document.querySelector('#enroll') && !document.querySelector('#enroll').hidden"),'verified HTTPS enrollment page');
    await run("document.querySelector('[name=name]').value='M25 Chromium fixture';document.querySelector('#enroll').requestSubmit();true");
    const code=await poll(()=>run("document.querySelector('#code')?.textContent"),'matching code');
    const entry=owner('pending').find(row=>row.name==='M25 Chromium fixture');
    assert.equal(entry.code,code);
    let started=performance.now();
    owner('approve',entry.id,code);
    const device=owner('devices').find(row=>row.name==='M25 Chromium fixture').id;
    owner('grant',device);
    await poll(()=>run("location.pathname==='/' && !!document.querySelector('[aria-label=Library]')"),'rendered Library');
    samples.push({metric:'docker_browser_approval_to_workspace',value:performance.now()-started,unit:'ms',notes:'Docker Linux/amd64 Chromium with a fixture-specific NSS CA database. Includes owner CLI and browser pairing poll.'});
    assert.equal(await run("document.cookie.includes('VaultorClient')"),false);
    const controlled=await run("fetch('/api/access/session').then(r=>r.status)");
    assert.equal(controlled,200);
    if(process.argv.includes('--check-note-creation')) {
      await run("[...document.querySelectorAll('button')].find(x=>x.textContent==='New note').click();true");
      await poll(()=>run("document.activeElement?.getAttribute('name')==='title' || document.activeElement?.value==='Untitled Note'"),'new note title focus');
      await cdp('Input.dispatchKeyEvent',{type:'keyDown',key:'a',code:'KeyA',windowsVirtualKeyCode:65,modifiers:2});
      await cdp('Input.insertText',{text:'M26-A Chromium note'});
      await run("[...document.querySelectorAll('button')].find(x=>x.textContent==='Create note').click();true");
      await poll(()=>run("document.querySelector('.browser-reader h2')?.textContent==='M26-A Chromium note'"),'created note opens');
      await cdp('Page.reload',{});
      await poll(()=>run("[...document.querySelectorAll('.next-resource-open')].some(x=>x.textContent==='M26-A Chromium note')"),'created note survives reload');
    }
    await poll(()=>run("document.body.innerText.includes("+JSON.stringify(fileName)+")"),'import appears in Library');
    started=performance.now();
    await run("[...document.querySelectorAll('button')].find(x=>x.innerText.includes("+JSON.stringify(fileName)+")).click();true");
    await poll(()=>run("document.body.innerText.includes('Session and transfer evidence from an Android import.')"),'browser note rendered');
    samples.push({metric:'docker_browser_note_ready',value:performance.now()-started,unit:'ms',notes:'Rendered imported note after Library click in Chromium. Includes 125 ms readiness observation.'});
    await run("[...document.querySelectorAll('button')].find(x=>x.textContent==='Edit note').click();true");
    await poll(()=>run("!!document.querySelector('.tiptap[contenteditable=true]')"),'note is editable');
    await run("document.querySelector('.tiptap[contenteditable=true]').focus();true");
    await cdp('Input.insertText',{text:'Verified browser edit '});
    await run("[...document.querySelectorAll('button')].find(x=>x.textContent==='Save note').click();true");
    await poll(()=>run("document.body.innerText.includes('Verified browser edit') && [...document.querySelectorAll('button')].some(x=>x.textContent==='Edit note')"),'saved revision rendered');
    await cdp('Page.reload',{});
    await poll(()=>run("location.pathname==='/' && !!document.querySelector('[aria-label=Library]')"),'reload retains session');
    owner('withdraw',device);
    await poll(()=>run("!!document.querySelector('[role=alert]') && !document.querySelector('[aria-label=Library]')"),'browser withdrawal');
    await run("[...document.querySelectorAll('button')].find(x=>x.textContent==='Sign out').click();true");
    await poll(()=>run("location.pathname==='/access' && !!document.querySelector('#enroll')"),'browser sign-out');
    console.log('Chromium verified TLS with a disposable NSS CA, pairing, cookie isolation, Library, editing, reload, withdrawal and sign-out.');
    return samples;
  } catch(error) {
    console.error(await inspect?.().catch(()=>null));
    throw error;
  } finally {
    child?.stdin.end();
    try{docker('rm','-f',container);}catch{}
  }
}
