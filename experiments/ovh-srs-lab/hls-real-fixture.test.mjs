import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {spawnSync} from 'node:child_process';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,basename} from 'node:path';
import {runProbe} from './hls-local-probe.mjs';

test('5 and 50 localhost clients receive real H.264/AAC HLS segments generated with ffmpeg', {timeout:45000}, async t => {
  const root=await mkdtemp(join(tmpdir(),'haku-hls-fixture-'));
  const ff=spawnSync('ffmpeg',['-hide_banner','-loglevel','error','-y','-f','lavfi','-i','testsrc2=size=854x480:rate=24','-f','lavfi','-i','sine=frequency=440:sample_rate=48000','-t','8','-c:v','libx264','-preset','ultrafast','-pix_fmt','yuv420p','-b:v','800k','-maxrate','900k','-bufsize','1800k','-g','48','-keyint_min','48','-sc_threshold','0','-c:a','aac','-b:a','48k','-ar','48000','-f','hls','-hls_time','2','-hls_list_size','0','-hls_segment_filename',join(root,'segment-%03d.ts'),join(root,'test.m3u8')],{encoding:'utf8',timeout:20000});
  assert.equal(ff.status,0,ff.stderr);
  const server=createServer(async(req,res)=>{
    const name=basename(req.url??'');
    if(!/^test\.m3u8$|^segment-\d{3}\.ts$/.test(name)){res.writeHead(404);res.end();return;}
    try{const data=await readFile(join(root,name));res.writeHead(200,{'Content-Type':name.endsWith('.m3u8')?'application/vnd.apple.mpegurl':'video/mp2t','Content-Length':data.length});res.end(data);}catch{res.writeHead(404);res.end();}
  });
  server.listen(0,'127.0.0.1');await once(server,'listening');
  try {
    for (const viewers of [5,50]) {
      const previous=process.env.HAKU_LOCAL_LOAD_APPROVED;
      if (viewers>5) process.env.HAKU_LOCAL_LOAD_APPROVED='YES';
      try {
        const r=await runProbe({url:'http://127.0.0.1:'+server.address().port+'/test.m3u8',viewers,seconds:5});
        t.diagnostic('real HLS: '+JSON.stringify({viewers:r.viewers,firstSegment:r.viewersWithFirstSegment,segments:r.segments,bytes:r.bytes,errors:r.errors,errorSamples:r.errorSamples,requestP95Ms:r.requestP95Ms}));
        assert.equal(r.viewersWithFirstSegment,viewers);
        assert.equal(r.errors,0,JSON.stringify(r.errorSamples));
        assert.equal(r.segments,4*viewers);
        assert.ok(r.bytes>400_000*viewers);
      } finally {
        if (previous===undefined) delete process.env.HAKU_LOCAL_LOAD_APPROVED;
        else process.env.HAKU_LOCAL_LOAD_APPROVED=previous;
      }
    }
  } finally {await new Promise(resolve=>server.close(resolve));await rm(root,{recursive:true,force:true});}
});