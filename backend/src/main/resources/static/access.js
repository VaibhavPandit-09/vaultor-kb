'use strict';
const $=id=>document.getElementById(id),status=$('status');let host,csrf='',pending=false,attempt;
async function api(path,method='GET',body,headers={}) {
  const response=await fetch('/api'+path,{method,headers:{'Content-Type':'application/json',...(csrf?{'X-Vaultor-CSRF':csrf}:{}),...headers},body:body===undefined?undefined:JSON.stringify(body),credentials:'same-origin',redirect:'error'});
  const value=await response.json().catch(()=>({}));if(!response.ok)throw new Error(value.detail||'Connection unavailable. Retry.');return value;
}
async function refresh(){const requests=await api('/owner/pairings');$('requests').replaceChildren();for(const request of requests){const row=document.createElement('div');row.className='request';const name=document.createElement('p');name.textContent=request.name+' · '+request.kind;const code=document.createElement('strong');code.textContent=request.code;row.append(name,code);for(const [label,action] of [['Approve','approve'],['Reject','reject']]){const button=document.createElement('button');button.textContent=label;button.onclick=async()=>{button.disabled=true;try{await api('/owner/pairings/'+request.id+'/'+action,'POST',{code:request.code});await refresh();}catch(error){status.textContent=error.message;button.disabled=false;}};row.append(button);}$('requests').append(row);}if(!requests.length)$('requests').textContent='No pending requests.';}
async function start(){
  $('retry').hidden=true;
  try{
    // Remove even an invalid ticket from history before making requests or following links.
    const ticket=new URLSearchParams(location.hash.slice(1)).get('ticket');if(location.hash)history.replaceState(null,'',location.pathname);
    if(ticket)await api('/access/bootstrap','POST',{ticket});
    host=await api('/access/host');$('identity').textContent=host.hostId+' · SHA-256 '+host.fingerprint;
    const response=await fetch('/api/access/session',{credentials:'same-origin'});
    if(response.ok){const session=await response.json();csrf=session.csrf;if(session.role==='OWNER'){status.textContent='Owner browser connected.';$('owner').hidden=false;await refresh();return;}location.replace('/');return;}
    if(location.protocol!=='https:'){status.textContent='Use Open in browser in the desktop app, or the local owner-bootstrap command.';return;}
    status.textContent='Request approval from this host.';$('enroll').hidden=false;$('enroll').elements.name.focus();
  }catch(error){status.textContent=error.message;$('retry').hidden=false;}
}
$('enroll').onsubmit=async event=>{event.preventDefault();if(event.isComposing||pending)return;pending=true;const button=$('enroll').querySelector('button');button.disabled=true;
  try{const bytes=crypto.getRandomValues(new Uint8Array(32)),nonce=Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');attempt=await api('/pairings','POST',{name:$('enroll').elements.name.value,kind:'browser',nonce,fingerprint:host.fingerprint});$('code').textContent=attempt.code;$('verification').hidden=false;$('enroll').hidden=true;status.textContent='Waiting for host approval…';poll();}
  catch(error){status.textContent=error.message;button.disabled=false;pending=false;}
};
async function poll(){try{const value=await api('/pairings/'+attempt.id,'GET',undefined,{'X-Vaultor-Pairing':attempt.secret});if(value.state==='APPROVED'){await api('/pairings/'+attempt.id+'/complete','POST',{}, {'X-Vaultor-Pairing':attempt.secret});attempt=null;location.replace('/');return;}if(value.state==='REJECTED')throw new Error('The host declined this request.');setTimeout(poll,2000);}catch(error){status.textContent=error.message;attempt=null;pending=false;$('retry').hidden=false;}}
$('retry').onclick=()=>{if(attempt){poll();return;}$('verification').hidden=true;$('enroll').querySelector('button').disabled=false;start();};$('refresh').onclick=()=>refresh().catch(error=>status.textContent=error.message);start();
