import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {validateOptions,segmentUrls,mediaPlaylistUrl,runProbe} from './hls-local-probe.mjs';

test('reject outside/paid targets, oversized trial and unsafe playlists', () => {
  for (const url of ['https://ovhcloud.com/live/test.m3u8','http://example.com/live/test.m3u8','file:///etc/passwd','http://169.254.169.254/latest/']) {
    assert.throws(()=>validateOptions({url,viewers:1,seconds:1}));
  }
  assert.throws(()=>validateOptions({url:'http://127.0.0.1:8080/live/test.m3u8',viewers:501,seconds:1}));
  assert.throws(()=>validateOptions({url:'http://127.0.0.1:8080/live/test.m3u8',viewers:6,seconds:1}));
  assert.throws(()=>segmentUrls('#EXTM3U\nhttps://example.com/segment.ts','http://127.0.0.1:8080/live/test.m3u8'));
});

test('receive segments with two synthetic local viewers',async()=>{
 const server=createServer((req,res)=>{
   if(req.url==='/live/test.m3u8') {res.setHeader('content-type','application/vnd.apple.mpegurl');res.end('#EXTM3U\n#EXTINF:2.0,\nseg-1.ts\n#EXTINF:2.0,\nseg-2.ts\n');}
   else if(req.url==='/live/seg-1.ts'||req.url==='/live/seg-2.ts'){res.end(Buffer.alloc(1024,7));}
   else {res.statusCode=404;res.end('no');}
 });
 server.listen(0,'127.0.0.1');await once(server,'listening');
 const {port}=server.address();
 try {
  const r=await runProbe({url:'http://127.0.0.1:'+port+'/live/test.m3u8',viewers:2,seconds:2});
  assert.equal(r.errors,0);
  assert.equal(r.viewersWithFirstSegment,2);
  assert.equal(r.segments,4);
  assert.equal(r.bytes,4096);
  assert.ok(r.requestP95Ms!==null);
 } finally {await new Promise(resolve=>server.close(resolve));}
});

test('follow only same-path SRS hls_ctx media playlists', () => {
 const root='http://127.0.0.1:8080/live/test.m3u8';
 const master='#EXTM3U\\n#EXT-X-STREAM-INF:BANDWIDTH=1\\n/live/test.m3u8?hls_ctx=abc123\\n';
 assert.equal(mediaPlaylistUrl(master,root),root+'?hls_ctx=abc123');
 assert.equal(mediaPlaylistUrl('#EXTM3U\\n#EXTINF:4,\\nseg-1.ts\\n',root),root);
 assert.throws(()=>mediaPlaylistUrl('#EXTM3U\\n#EXT-X-STREAM-INF:BANDWIDTH=1\\nhttp://example.com/x.m3u8\\n',root));
 assert.throws(()=>mediaPlaylistUrl('#EXTM3U\\n#EXT-X-STREAM-INF:BANDWIDTH=1\\n/live/test.m3u8?token=secret\\n',root));
});

test('receive SRS master and media playlists with local viewer',async()=>{
 const server=createServer((req,res)=>{
   if(req.url==='/live/test.m3u8') res.end('#EXTM3U\\n#EXT-X-STREAM-INF:BANDWIDTH=1\\n/live/test.m3u8?hls_ctx=abc123\\n');
   else if(req.url==='/live/test.m3u8?hls_ctx=abc123') res.end('#EXTM3U\\n#EXTINF:4.0,\\nseg-1.ts\\n');
   else if(req.url==='/live/seg-1.ts') res.end(Buffer.alloc(1024,7));
   else {res.statusCode=404;res.end('no');}
 });
 server.listen(0,'127.0.0.1');await once(server,'listening');
 try {
   const {port}=server.address();
   const r=await runProbe({url:'http://127.0.0.1:'+port+'/live/test.m3u8',viewers:1,seconds:2});
   assert.equal(r.errors,0);
   assert.equal(r.viewersWithFirstSegment,1);
 } finally {await new Promise(resolve=>server.close(resolve));}
});
