import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {makeGateway,classifyRequest} from './local-gateway.mjs';

async function start(server) {server.listen(0,'127.0.0.1');await once(server,'listening');return 'http://127.0.0.1:'+server.address().port;}
async function close(server){await new Promise(resolve=>server.close(resolve));}

test('only fixed local routes accepted',()=>{
  assert.equal(classifyRequest('GET','/').file,'whip-local.html');
  assert.equal(classifyRequest('POST','/rtc/v1/whip/').port,1985);
  assert.equal(classifyRequest('GET','/live/haku-lab.m3u8').port,8080);
  for(const path of ['/api/stripe','/etc/passwd','/live/production.m3u8','/live/../../secret','/rtc/v1/whip/../../admin']){
    assert.equal(classifyRequest('GET',path),null);
  }
});

test('same-origin local WHIP/HLS gateway forwards only permitted requests',async()=>{
  const seen=[];
  const whip=createServer((req,res)=>{
    seen.push({path:req.url,method:req.method});
    if(req.method==='POST'){
      res.writeHead(201,{'Content-Type':'application/sdp','Location':'/rtc/v1/whip/resource/abc'});
      res.end('v=0\r\no=server');
    }else {res.writeHead(200);res.end('closed');}
  });
  const hls=createServer((req,res)=>{
    seen.push({path:req.url,method:req.method});
    res.writeHead(200,{'Content-Type':'application/vnd.apple.mpegurl'});
    res.end('#EXTM3U\n');
  });
  await start(whip);await start(hls);
  const gateway=makeGateway({whipPort:whip.address().port,hlsPort:hls.address().port});
  const origin=await start(gateway);
  try {
    const html=await fetch(origin+'/');
    assert.equal(html.status,200);
    assert.match(await html.text(),/HAKU LIVE/);
    const js=await fetch(origin+'/whip-publisher.mjs');
    assert.equal(js.status,200);
    const sdp=await fetch(origin+'/rtc/v1/whip/?app=live&stream=haku-lab',{
      method:'POST',headers:{'Content-Type':'application/sdp',Origin:origin},body:'v=0\r\no=local'});
    assert.equal(sdp.status,201);
    assert.equal(sdp.headers.get('location'),'/rtc/v1/whip/resource/abc');
    assert.match(await sdp.text(),/^v=0/);
    const del=await fetch(origin+'/rtc/v1/whip/resource/abc',{method:'DELETE',headers:{Origin:origin}});
    assert.equal(del.status,200);
    const playlist=await fetch(origin+'/live/haku-lab.m3u8');
    assert.equal(playlist.status,200);
    assert.equal(await playlist.text(),'#EXTM3U\n');
    assert.equal(seen.length,3);
  }finally{await close(gateway);await close(whip);await close(hls);}
});

test('reject cross-origin writes and unknown paths before forwarding',async()=>{
  const gateway=makeGateway({whipPort:65534,hlsPort:65534});
  const origin=await start(gateway);
  try{
    const cross=await fetch(origin+'/rtc/v1/whip/?app=live&stream=haku-lab',{
      method:'POST',headers:{'Content-Type':'application/sdp',Origin:'https://evil.example'},body:'v=0'});
    assert.equal(cross.status,403);
    const badStream=await fetch(origin+'/rtc/v1/whip/?app=live&stream=other',{
      method:'POST',headers:{'Content-Type':'application/sdp',Origin:origin},body:'v=0'});
    assert.equal(badStream.status,403);
    const badPath=await fetch(origin+'/api/livekit/token');
    assert.equal(badPath.status,404);
  }finally{await close(gateway);}
});
