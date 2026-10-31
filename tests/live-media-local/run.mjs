// Real local SFU + HAKU media helpers. Synthetic Chrome camera/microphone, never physical iPhone evidence.
// Start an approved local `livekit-server --dev` first, then: node tests/live-media-local/run.mjs
import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { chromium } from 'playwright'
import { createServer } from 'vite'
import { AccessToken, RoomServiceClient } from 'livekit-server-sdk'
const url='ws://127.0.0.1:7880', roomName=`haku-media-${randomUUID()}`
const service=new RoomServiceClient(url,'devkey','secret',{requestTimeout:3,failover:false})
const output=process.env.HAKU_MEDIA_OUTPUT || '/private/tmp/haku-live-media-evidence'
await mkdir(output,{recursive:true})
const results=[],errors=[]
const token=async(identity,publish)=>{const t=new AccessToken('devkey','secret',{identity,ttl:300});t.addGrant({roomJoin:true,room:roomName,canPublish:publish,canSubscribe:true});return t.toJwt()}
const server=await createServer({configFile:false,envDir:false,server:{host:'127.0.0.1',port:4198,strictPort:true},define:{'import.meta.env.VITE_SUPABASE_URL':'undefined','import.meta.env.VITE_SUPABASE_ANON_KEY':'undefined'}})
server.middlewares.use('/media-test',(_req,res)=>{res.setHeader('Content-Type','text/html');res.end('<video playsinline autoplay muted style="width:640px;height:360px"></video><audio autoplay></audio>')})
await server.listen()
let browser
const deadline=setTimeout(()=>{console.error('Local SFU media verification timeout');process.exitCode=1;void browser?.close()},120000)
const check=(name,value)=>{assert.ok(value,name);results.push(name);console.log('PASS',name)}
try {
 await service.createRoom({name:roomName,emptyTimeout:10})
 browser=await chromium.launch({headless:true,...(process.env.HAKU_CHROME_PATH ? {executablePath:process.env.HAKU_CHROME_PATH} : process.platform==='darwin' ? {executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'} : {}),args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream','--autoplay-policy=no-user-gesture-required']})
 const hostContext=await browser.newContext({permissions:['camera','microphone']}), viewerContext=await browser.newContext()
 // Block every remote destination; this harness must never touch cloud/production services.
 for(const context of [hostContext,viewerContext])await context.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort())
 const host=await hostContext.newPage(),viewer=await viewerContext.newPage()
 for(const page of [host,viewer]){page.on('pageerror',e=>errors.push(e.message));await page.goto('http://127.0.0.1:4198/media-test')}
 await host.evaluate(async({url,token})=>{const m=await import('/src/platform/lib/livekit.ts');window.room=await m.connectAsHost(url,token,'landscape')},{url,token:await token('local-host',true)})
 const join=async()=>viewer.evaluate(async({url,token})=>{const m=await import('/src/platform/lib/livekit.ts');window.room=await m.connectAsViewer(url,token);m.watchRemoteMedia(window.room,t=>m.attachRemoteTrack(t,document.querySelector('video'),document.querySelector('audio')));await window.room.startAudio()},{url,token:await token('local-viewer',false)})
 await join()
 await viewer.waitForFunction(()=>document.querySelector('video').getVideoPlaybackQuality().totalVideoFrames>10,{},{timeout:30000})
 check('HAKU host capture → real local SFU → separate viewer decodes video',await viewer.locator('video').evaluate(v=>v.videoWidth>0&&v.videoHeight>0))
 await viewer.waitForFunction(()=>document.querySelector('audio').srcObject?.getAudioTracks().some(t=>t.readyState==='live'),{},{timeout:15000})
 const media=await viewer.evaluate(async()=>{const publications=[...window.room.remoteParticipants.values()].flatMap(p=>[...p.trackPublications.values()]);return Promise.all(publications.filter(p=>p.track).map(async p=>({kind:p.kind,stats:await p.track.getRTCStatsReport().then(r=>[...(r?.values() || [])].filter(s=>s.type==='inbound-rtp').map(s=>({bytesReceived:s.bytesReceived,packetsReceived:s.packetsReceived,framesDecoded:s.framesDecoded,jitter:s.jitter,packetsLost:s.packetsLost})))})))})
 check('actual audio RTP packets reach the viewer',media.some(p=>p.kind==='audio'&&p.stats.some(s=>s.bytesReceived>0&&s.packetsReceived>0)))
 const sender=await host.evaluate(async()=>Promise.all([...window.room.localParticipant.trackPublications.values()].filter(p=>p.track).map(async p=>({kind:p.kind,stats:await p.track.getRTCStatsReport().then(r=>[...(r?.values()||[])].filter(s=>s.type==='outbound-rtp').map(s=>({bytesSent:s.bytesSent,packetsSent:s.packetsSent,framesEncoded:s.framesEncoded,frameWidth:s.frameWidth,frameHeight:s.frameHeight,framesPerSecond:s.framesPerSecond,qualityLimitationReason:s.qualityLimitationReason,qualityLimitationDurations:s.qualityLimitationDurations,totalEncodeTime:s.totalEncodeTime,qpSum:s.qpSum,encoderImplementation:s.encoderImplementation})))}))))
 check('SFU confirms both independent participants',(await service.listParticipants(roomName)).length===2)
 const oldVideo=await viewer.locator('video').evaluate(v=>v.srcObject.id)
 await viewer.evaluate(()=>window.room.disconnect())
 await join()
 await viewer.waitForFunction(old=>document.querySelector('video').srcObject?.id!==old&&document.querySelector('video').getVideoPlaybackQuality().totalVideoFrames>5,oldVideo,{timeout:30000})
 check('viewer disconnect and fresh rejoin recover video',true)
 await service.deleteRoom(roomName)
 await host.waitForFunction(()=>window.room.state==='disconnected',{},{timeout:15000})
 await viewer.waitForFunction(()=>window.room.state==='disconnected',{},{timeout:15000})
 check('scoped SFU room termination disconnects host and viewer',true)
 check('no browser runtime errors',errors.length===0)
 await writeFile(output+'/result.json',JSON.stringify({transport:'real local LiveKit SFU',lifecycleApi:false,supabase:false,syntheticCapture:true,physicalIPhone:false,cloudLiveKit:false,results,media,sender,errors},null,2))
} finally {clearTimeout(deadline);await browser?.close();await service.deleteRoom(roomName).catch(()=>{});await server.close()}
