// Isolated localhost-only, real H.264/AAC HLS segments, 500 HTTP clients.
// Opt-in only: this is NOT a real SRS/OVHcloud/500 iPhone performance test.
import {createServer} from 'node:http';
import {once} from 'node:events';
import {spawnSync} from 'node:child_process';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,basename} from 'node:path';
import {runProbe} from './hls-local-probe.mjs';

if (process.env.HAKU_LOCAL_500_REAL_SMOKE !== 'YES') {
  throw Error('Set HAKU_LOCAL_500_REAL_SMOKE=YES to run localhost-only 500-client smoke test');
}
const root=await mkdtemp(join(tmpdir(),'haku-hls-500-'));
const ff=spawnSync('ffmpeg',['-hide_banner','-loglevel','error','-y','-f','lavfi','-i','testsrc2=size=854x480:rate=24','-f','lavfi','-i','sine=frequency=440:sample_rate=48000','-t','8','-c:v','libx264','-preset','ultrafast','-pix_fmt','yuv420p','-b:v','800k','-maxrate','900k','-bufsize','1800k','-g','48','-keyint_min','48','-sc_threshold','0','-c:a','aac','-b:a','48k','-ar','48000','-f','hls','-hls_time','2','-hls_list_size','0','-hls_segment_filename',join(root,'segment-%03d.ts'),join(root,'test.m3u8')],{encoding:'utf8',timeout:20000});
if(ff.status!==0)throw Error(ff.stderr);
const files=new Map();
for(let i=0;i<4;i++){const name='segment-'+String(i).padStart(3,'0')+'.ts';files.set(name,await readFile(join(root,name)));}
files.set('test.m3u8',await readFile(join(root,'test.m3u8')));
const server=createServer((req,res)=>{
  const name=basename(req.url??'');
  const data=files.get(name);
  if(!data){res.writeHead(404);res.end();return;}
  res.writeHead(200,{'Content-Type':name.endsWith('.m3u8')?'application/vnd.apple.mpegurl':'video/mp2t','Content-Length':data.length});res.end(data);
});
server.listen(0,'127.0.0.1');await once(server,'listening');
const t=Date.now();
const old=process.env.HAKU_LOCAL_LOAD_APPROVED;
process.env.HAKU_LOCAL_LOAD_APPROVED='YES';
try{
  const r=await runProbe({url:'http://127.0.0.1:'+server.address().port+'/test.m3u8',viewers:500,seconds:15});
  const elapsed=(Date.now()-t)/1000;
  console.log(JSON.stringify({elapsedSeconds:elapsed,firstSegment:r.viewersWithFirstSegment,segments:r.segments,bytes:r.bytes,errors:r.errors,errorSamples:r.errorSamples,requestP95Ms:r.requestP95Ms,throughputMbps:r.bytes*8/1e6/elapsed,perViewerBytes:r.bytes/500},null,2));
  if(r.viewersWithFirstSegment!==500||r.errors>0||r.segments!==2000)process.exitCode=1;
}finally{
  if(old===undefined)delete process.env.HAKU_LOCAL_LOAD_APPROVED;else process.env.HAKU_LOCAL_LOAD_APPROVED=old;
  await new Promise(resolve=>server.close(resolve));
  await rm(root,{recursive:true,force:true});
}
