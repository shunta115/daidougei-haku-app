// Local synthetic RTP smoke test. No camera/mic access, SFU, credentials or external ICE.
import http from 'node:http'
import { readFile, writeFile } from 'node:fs/promises'
import { transform } from 'esbuild'
import { webkit } from 'playwright'
const source = await readFile(new URL('../src/platform/lib/liveQualityMetrics.ts', import.meta.url), 'utf8')
const js = (await transform(source, { loader: 'ts', format: 'esm' })).code
const html = `<!doctype html><button id="start">Start synthetic local RTP test</button><canvas id="canvas" width="1280" height="720"></canvas><script type="module">
import { rtpMetric } from '/metrics.js';
document.querySelector('#start').onclick = async () => {
 const peers = [new RTCPeerConnection({iceServers: []}), new RTCPeerConnection({iceServers: []})];
 const audio = new AudioContext({sampleRate:48000}); let timer;
 try {
  await audio.resume(); const destination=audio.createMediaStreamDestination();
  const oscillator=audio.createOscillator(); oscillator.frequency.value=440; oscillator.connect(destination); oscillator.start();
  const canvas=document.querySelector('canvas'), ctx=canvas.getContext('2d'); let frame=0;
  timer=setInterval(()=>{ctx.fillStyle=frame++%2?'#123456':'#abcdef';ctx.fillRect(0,0,1280,720);ctx.fillStyle='white';ctx.fillRect(frame%1200,200,80,80)},33);
  const stream=canvas.captureStream(30); destination.stream.getAudioTracks().forEach(t=>stream.addTrack(t));
  stream.getTracks().forEach(t=>peers[0].addTrack(t,stream));
  const pending=[[],[]];
  peers.forEach((peer,i)=>peer.onicecandidate=async e=>{if(e.candidate){const other=peers[1-i]; if(other.remoteDescription) await other.addIceCandidate(e.candidate); else pending[1-i].push(e.candidate)}});
  await peers[0].setLocalDescription(await peers[0].createOffer()); await peers[1].setRemoteDescription(peers[0].localDescription);
  for(const c of pending[1]) await peers[1].addIceCandidate(c);
  await peers[1].setLocalDescription(await peers[1].createAnswer()); await peers[0].setRemoteDescription(peers[1].localDescription);
  for(const c of pending[0]) await peers[0].addIceCandidate(c);
  await new Promise(r=>setTimeout(r,5000)); const before=await peers[1].getStats();
  await new Promise(r=>setTimeout(r,5000)); const after=await peers[1].getStats(); const metrics=[];
  after.forEach(row=>{const m=rtpMetric(row,before.get(row.id));if(m&&m.direction==='receive')metrics.push(m)});
  const video=metrics.find(m=>m.kind==='video'), sound=metrics.find(m=>m.kind==='audio');
  if(!(video?.bitrate>0&&sound?.bitrate>0&&video.width>0&&video.height>0))throw new Error('Missing decoded RTP evidence: '+JSON.stringify(metrics));
  window.result={status:'passed',browser:'Playwright WebKit',durationSeconds:10,synthetic:true,sfu:false,physicalIPhone:false,avSyncMeasured:false,requestedCanvas:{width:1280,height:720,fps:30},metrics};
 } catch(e) {window.result={status:'failed',message:String(e)}}
 finally {clearInterval(timer);peers.forEach(p=>{p.getSenders().forEach(s=>s.track?.stop());p.close()});await audio.close()}
};</script>`
const server = http.createServer((req, res) => {
  res.setHeader('Content-Type', req.url === '/metrics.js' ? 'text/javascript' : 'text/html')
  res.end(req.url === '/metrics.js' ? js : html)
})
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
let browser
try {
  browser = await webkit.launch({ headless: true })
  const page = await browser.newPage()
  await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort())
  await page.goto(`http://127.0.0.1:${server.address().port}`)
  await page.click('#start')
  await page.waitForFunction(() => window.result, undefined, { timeout: 30000 })
  const result = await page.evaluate(() => window.result)
  await writeFile(new URL('../docs/live-quality/loopback.json', import.meta.url), JSON.stringify(result, null, 2) + '\n')
  console.log(JSON.stringify(result))
  if (result.status !== 'passed') process.exitCode = 1
} finally { await browser?.close(); await new Promise(resolve => server.close(resolve)) }
