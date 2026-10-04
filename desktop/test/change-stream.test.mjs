import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {DesktopTransport} from '../src/transport.mjs';
import {startChangeStream} from '../src/change-stream.mjs';
test('native SSE injects owner credentials, decodes fragmented frames and closes on connection activation',async()=>{
  let response;let request;
  const server=createServer((req,res)=>{request=req;response=res;res.writeHead(200,{'Content-Type':'text/event-stream'});res.flushHeaders();});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const transport=new DesktopTransport();transport.activate({address:'http://127.0.0.1:'+server.address().port,kind:'local'},'epoch','owner-secret');
  const events=[];
  try{
    await startChangeStream(transport,{token:'epoch',id:'stream',path:'/changes'},event=>events.push(event));
    assert.equal(request.headers['x-vaultor-owner'],'owner-secret');assert.equal(request.url,'/api/changes');
    response.write('event:change\ndata:{"kind":"res');response.write('ources","ids":["note"]}\n\n');
    for(let i=0;i<30 && !events.length;i++)await new Promise(r=>setTimeout(r,5));
    assert.deepEqual(events,[{id:'stream',data:{kind:'resources',ids:['note']}}]);
    transport.activate({address:'http://127.0.0.1:'+server.address().port,kind:'local'},'next','other-secret');
    response.write('data:{"kind":"late"}\n\n');await new Promise(r=>setTimeout(r,30));assert.equal(events.length,1);assert.equal(transport.requests.size,0);
    await assert.rejects(startChangeStream(transport,{token:'epoch',id:'bad',path:'/changes'},()=>{}),/Invalid/);
    await assert.rejects(startChangeStream(transport,{token:'next',id:'bad',path:'/owner/devices'},()=>{}),/Invalid/);
  }finally{transport.cancelAll();server.closeAllConnections();await new Promise(r=>server.close(r));}
});
