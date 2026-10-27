import { createRequire } from 'node:module'
import { mkdir, writeFile } from 'node:fs/promises'
import { createLabServer } from '../../experiments/free-live/server.mjs'

const require = createRequire(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES ? process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES + '/playwright/package.json' : import.meta.url)
const { chromium } = require('playwright')
const binary = process.env.HAKU_CHROMIUM_MODULE ? require(process.env.HAKU_CHROMIUM_MODULE) : null
const server = createLabServer()
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
const base = `http://127.0.0.1:${server.address().port}`
let browser
const errors=[], evidence={browser:'Chromium fake camera and microphone; local separate browser contexts; NOT iPhone hardware',checks:[]}
const check=(name,data={})=>{evidence.checks.push({name,...data});console.log(name,JSON.stringify(data))}
try {
  browser=await chromium.launch({headless:true,executablePath:process.env.HAKU_CHROMIUM_EXECUTABLE || (binary ? await binary.executablePath() : undefined),args:['--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--allow-loopback-in-peer-connection','--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream','--autoplay-policy=no-user-gesture-required']})
  const page=async path=>{
    const context=await browser.newContext({viewport:{width:390,height:844},permissions:['camera','microphone']})
    const page=await context.newPage()
    page.on('pageerror',error=>errors.push(String(error)))
    page.on('response',response=>{if(response.status()>=400)console.log('HTTP failure',response.status(),response.url())})
    // A lab test on one host needs no STUN. Do not infer carrier-NAT coverage.
    await page.addInitScript(()=>{window.__labPCs=[];const Native=window.RTCPeerConnection;window.RTCPeerConnection=class extends Native{constructor(config){super({...config,iceServers:[]});window.__labPCs.push(this)}}})
    await page.goto(base+path)
    await page.getByLabel('検証用アカウント').waitFor()
    return page
  }
  const owner=await page('/haku-free-live.html')
  await owner.getByRole('button',{name:'LIVE配信を開始する',exact:true}).click()
  await owner.getByText('配信を開始しました。視聴は5人まで。').waitFor({timeout:15000})
  await owner.waitForFunction(()=>document.querySelector('video')?.videoWidth>0)
  await owner.locator('video').evaluate(video=>{window.__oldCaptureTracks=video.srcObject.getTracks()})
  const room=new URL(owner.url()).searchParams.get('room')
  check('DIRECT camera started',{room,video:await owner.locator('video').evaluate(v=>({width:v.videoWidth,height:v.videoHeight,tracks:v.srcObject.getTracks().map(t=>({kind:t.kind,state:t.readyState}))}))})
  const viewers=[]
  for(let i=1;i<=5;i++){
    const viewer=await page(`/haku-free-live.html?room=${room}&watch=1`)
    await viewer.getByLabel('検証用アカウント').selectOption(`demo-fan-${i}`)
    await viewer.getByRole('button',{name:'LIVEを見る',exact:true}).click()
    viewers.push(viewer)
  }
  for(const viewer of viewers) await viewer.waitForFunction(()=>{const v=document.querySelector('video');return v?.videoWidth>0&&v.readyState>=2},{},{timeout:20000})
  check('Five independent browser contexts received video',{dimensions:await Promise.all(viewers.map(v=>v.locator('video').evaluate(e=>[e.videoWidth,e.videoHeight])))})
  await viewers[0].waitForFunction(async()=>{const stats=await window.__labPCs.at(-1).getStats();return [...stats.values()].some(s=>s.type==='inbound-rtp'&&s.kind==='audio'&&s.bytesReceived>0)},{},{timeout:10000})
  check('Receiver audio RTP bytes observed; speaker audibility requires hardware test')
  await viewers[0].evaluate(()=>{window.__previousPeer=window.__labPCs.at(-1)})
  await viewers[0].getByRole('button',{name:'映像を再接続',exact:true}).click()
  await viewers[0].waitForFunction(()=>{const v=document.querySelector('video');return v?.videoWidth>0&&window.__previousPeer.connectionState==='closed'&&window.__labPCs.at(-1)!==window.__previousPeer&&window.__labPCs.at(-1)?.connectionState==='connected'},{},{timeout:15000})
  check('Viewer explicitly reconnected without adding a sixth seat')
  const beforeHandoff=await Promise.all(viewers.map(v=>v.locator('video').evaluate(e=>e.srcObject.getVideoTracks()[0].id)))
  const sixth=await page(`/haku-free-live.html?room=${room}&watch=1`)
  await sixth.getByLabel('検証用アカウント').selectOption('demo-fan-6')
  await sixth.getByRole('button',{name:'LIVEを見る',exact:true}).click()
  await sixth.getByRole('alert').filter({hasText:'視聴枠は5人まで'}).waitFor()
  check('Sixth viewer rejected')
  await owner.getByRole('button',{name:'観客カメラを許可してQR発行',exact:true}).click()
  const crowdUrl=await owner.getByRole('link',{name:'観客用リンクを開く',exact:true}).getAttribute('href')
  const crowd=await page(crowdUrl.replace(base,''))
  await crowd.getByLabel('検証用アカウント').selectOption('demo-fan-7')
  await crowd.getByRole('checkbox').first().check()
  await crowd.getByRole('button',{name:'LIVE配信を開始する',exact:true}).click()
  await crowd.getByText('カメラの交代待ちに入りました。').waitFor()
  await owner.getByRole('button',{name:'demo-fan-7 にカメラ交代'}).click()
  await crowd.getByRole('button',{name:'交代してLIVEを開始する',exact:true}).waitFor({timeout:10000})
  const ownerMediaGone=await owner.locator('video').count()===0 && await owner.evaluate(()=>window.__oldCaptureTracks.every(t=>t.readyState==='ended'))
  if(!ownerMediaGone) throw new Error('Old publisher video still mounted after handoff')
  await crowd.getByRole('button',{name:'交代してLIVEを開始する',exact:true}).click()
  for(let i=0;i<viewers.length;i++) await viewers[i].waitForFunction(previous=>{const v=document.querySelector('video');return v?.videoWidth>0&&v.readyState>=2&&v.srcObject?.getVideoTracks()[0]?.id!==previous},beforeHandoff[i],{timeout:20000})
  check('CROWD handoff and five viewers reconnected',{oldPublisherCameraRemoved:ownerMediaGone})
  await owner.getByRole('button',{name:'すべての配信を緊急停止',exact:true}).click()
  await crowd.waitForFunction(()=>!document.querySelector('video'),{},{timeout:10000})
  for(const viewer of viewers) await viewer.waitForFunction(()=>!document.querySelector('video'),{},{timeout:10000})
  check('Performer emergency stop closed audience capture and all five viewers')
  const deviceContext=await browser.newContext({viewport:{width:390,height:844},permissions:['camera','microphone']})
  const device=await deviceContext.newPage()
  device.on('pageerror',error=>errors.push(String(error)))
  await device.route('**/api/free-live',route=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({mode:'device-check-only'})}))
  await device.goto(base+'/haku-free-live.html')
  await device.getByRole('button',{name:'端末内で5接続を試す',exact:true}).click()
  await device.waitForFunction(()=>[...document.querySelectorAll('.loop-grid video')].filter(v=>v.videoWidth>0).length===5,{},{timeout:15000})
  await device.waitForFunction(()=>{const values=[...document.querySelectorAll('.metric-grid b')].map(e=>e.textContent);return parseFloat(values[0])>0&&parseFloat(values[1])>0&&values[2]==='5 / 5'},{},{timeout:10000})
  check('Static Preview fallback has five same-device loopback receivers')
  const measured=await device.locator('.metric-grid').innerText()
  check('Meter is visible',{text:measured})
  const overflow=await device.evaluate(()=>document.documentElement.scrollWidth>innerWidth)
  if(overflow)throw new Error('Mobile viewport has horizontal overflow')
  await device.screenshot({path:'artifacts/free-live/device-mobile.png',fullPage:true})
  const ended=await device.evaluate(()=>{
    const tracks=document.querySelector('.stage video').srcObject.getTracks()
    Object.defineProperty(document,'hidden',{configurable:true,get:()=>true})
    document.dispatchEvent(new Event('visibilitychange'))
    return tracks.every(t=>t.readyState==='ended')
  })
  if(!ended)throw new Error('Physical capture was not synchronously stopped')
  check('Synthetic visibilitychange synchronously ended real fake-device tracks',{iphoneHardwareVerified:false})
  await owner.screenshot({path:'artifacts/free-live/local-mobile.png',fullPage:true})
  evidence.pageErrors=errors
  if(errors.length) throw new Error(errors.join('\n'))
} catch (error) {
  evidence.failure=String(error)
  for(const context of browser?.contexts() || []) for(const page of context.pages()) {
    console.log('PAGE FAILURE',page.url(),(await page.locator('body').innerText()).slice(-1800))
  }
  throw error
} finally {
  await mkdir('artifacts/free-live',{recursive:true})
  await writeFile('artifacts/free-live/browser-evidence.json',JSON.stringify(evidence,null,2)+'\n')
  await browser?.close();await new Promise(resolve=>server.close(resolve))
}
