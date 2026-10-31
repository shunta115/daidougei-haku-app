import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import { chromium, webkit, devices } from 'playwright'
const output = process.env.HAKU_E2E_OUTPUT || '/private/tmp/haku-theater-evidence'
await mkdir(output, { recursive: true })
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--config', 'tests/live-theater-e2e/vite.config.ts'], { stdio: 'pipe' })
let logs = ''; server.stdout.on('data', x => logs += x); server.stderr.on('data', x => logs += x)
const base = 'http://127.0.0.1:4187/tests/live-theater-e2e/harness.html'
const checks = [], errors = []
const progress = (value) => { checks.push(value); console.log(value) }
const timeout = setTimeout(() => { server.kill(); process.exit(1) }, 240000)
let browser
try {
  for (let i=0; i<100; i++) { try { if ((await fetch(base)).ok) break } catch {} await new Promise(r => setTimeout(r, 200)) }
  for (const engine of ['chromium', 'webkit']) {
    browser = await (engine === 'chromium' ? chromium : webkit).launch(engine === 'chromium' ? { channel: 'chrome' } : process.env.HAKU_WEBKIT_EXECUTABLE ? { executablePath: process.env.HAKU_WEBKIT_EXECUTABLE } : {})
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
    await context.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort())
    await context.addInitScript(() => {
      window.fixtureEvents = []
      for (const name of ['fixture-comment', 'fixture-follow']) window.addEventListener(name, () => window.fixtureEvents.push(name))
      window.YT = { PlayerState: { ENDED:0,PLAYING:1,PAUSED:2,BUFFERING:3,CUED:5 }, Player: class { constructor(el, options) { const iframe=document.createElement('iframe'); iframe.title='YouTube LIVE'; iframe.src='about:blank'; iframe.allowFullscreen=true; el.replaceWith(iframe); queueMicrotask(() => options.events.onReady()) } destroy() {} } };
      Object.defineProperty(navigator, 'share', { configurable: true, value: async () => window.fixtureEvents.push('share') })
    })
    const page = await context.newPage(); page.setDefaultTimeout(30000); page.on('pageerror', e => errors.push(`${engine}: ${e.message}`))
    await page.goto(base + '?signedIn=1')
    await page.locator('.pl-live__comments').waitFor()
    for (const [w,h] of [[1920,1080],[720,1280]]) {
      await page.locator('video').evaluate((v,[w,h]) => {
        Object.defineProperty(v,'videoWidth',{ configurable:true,value:w }); Object.defineProperty(v,'videoHeight',{ configurable:true,value:h }); v.dispatchEvent(new Event('resize')); v.poster='data:image/svg+xml,'+encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="100%" height="100%" fill="#18364b"/><path d="M0 0H${w}V${h}H0Z" fill="none" stroke="#50f0ce" stroke-width="20"/><text x="50%" y="40%" fill="white" text-anchor="middle" font-size="50">TOP ↑</text><text x="50%" y="60%" fill="white" text-anchor="middle" font-size="40">${w} × ${h} fixture</text></svg>`)
      },[w,h])
      await page.waitForTimeout(600)
      const dims = await page.evaluate(() => {
        const stage = document.querySelector('.pl-live__stage').getBoundingClientRect(), panel = document.querySelector('.pl-live__panel').getBoundingClientRect()
        return { stage: { x:stage.x,y:stage.y,w:stage.width,h:stage.height,right:stage.right }, panel: { x:panel.x,y:panel.y,h:panel.height }, fit:getComputedStyle(document.querySelector('video')).objectFit, transform:getComputedStyle(document.querySelector('video')).transform }
      })
      assert.ok(dims.panel.x >= dims.stage.right, JSON.stringify(dims)); assert.ok(Math.abs(dims.stage.w/dims.stage.h-16/9)<.02, JSON.stringify(dims)); assert.equal(dims.fit,'contain')
      await page.screenshot({path:`${output}/${engine}-${w}x${h}.png`})
      progress(`${engine}: ${w}x${h} source, 16:9 theater and separate comments, contain`)
    }
    console.log('rotation'); await page.getByRole('button',{name:'映像を右に90度回転'}).click()
    assert.equal(await page.locator('.pl-live__stage').getAttribute('data-video-quarter-turn'),'true')
    await page.getByRole('button',{name:'映像の回転をリセット'}).click()
    assert.equal(await page.locator('.pl-live__stage').getAttribute('data-video-quarter-turn'),'false')
    console.log('actions'); await page.locator('.pl-live__composer input').fill('desktop comment')
    await page.locator('.pl-live__composer input').press('Enter')
    await page.locator('.pl-live__actions .pl-btn--ghost').click()
    await page.getByRole('button',{name:'シェア',exact:true}).click()
    assert.deepEqual(await page.evaluate(() => window.fixtureEvents),['fixture-comment','fixture-follow','share'])
    await page.locator('.pl-live__react').click()
    await page.locator('.pl-live__support-cta').click(); await page.locator('.pl-tip-presets').waitFor()
    progress(`${engine}: comment/follow/share adapters, like click, support opens amount screen (no payment)`)
    await page.goto(base + '?signedIn=1'); await page.locator('.pl-live__panel').waitFor()
    // Force unsupported native API to cover the actual CSS fullscreen fallback.
    await page.locator('.pl-live__stage').evaluate(el => { el.requestFullscreen = async () => { throw new Error('fixture unsupported') }; el.webkitRequestFullscreen = undefined })
    await page.locator('.pl-live__hud-actions > button').last().click()
    await page.waitForTimeout(100)
    const fs = await page.locator('.pl-live__stage').boundingBox(); assert.ok(fs.width>=1438 && fs.height>=998)
    await page.locator('.pl-live__hud-actions > button').last().click()
    for (const size of [{width:1200,height:800},{width:844,height:390},{width:390,height:844},{width:1440,height:1000}]) {
      await page.setViewportSize(size); await page.waitForTimeout(100)
      assert.ok(await page.locator('.pl-live__stage').isVisible())
    }
    progress(`${engine}: fullscreen fallback, resize PC/phone portrait/landscape`)
    await page.goto(base+'?youtube=1'); await page.locator('.pl-youtube-live__rail').waitFor()
    const player=await page.locator('.pl-youtube-player').boundingBox(),rail=await page.locator('.pl-youtube-live__rail').boundingBox()
    assert.ok(rail.x>=player.x+player.width)
    assert.equal(await page.locator('iframe').getAttribute('allowfullscreen'),'')
    progress(`${engine}: YouTube official iframe and right support rail (external playback blocked)`)
    await context.close()
    if(engine==='webkit') {
      const phone=await browser.newContext({...devices['iPhone 13']})
      await phone.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort())
      const mobile=await phone.newPage(); await mobile.goto(base+'?signedIn=1'); await mobile.locator('.pl-live__panel').waitFor()
      assert.equal(await mobile.locator('.pl-live__rotation-controls').isVisible(),false)
      await mobile.locator('.pl-live__composer input').fill('iPhone fixture')
      await mobile.screenshot({path:`${output}/webkit-iphone.png`}); await phone.close()
      progress('WebKit iPhone emulation: existing portrait UI and composer; desktop controls hidden')
    }
    await browser.close(); browser=null
  }
  assert.deepEqual(errors,[])
} catch(e) { console.error(e); process.exitCode=1 }
finally { clearTimeout(timeout); await browser?.close(); server.kill(); await writeFile(`${output}/result.json`, JSON.stringify({passed:!process.exitCode,checks,errors,boundary:'Offline API/media fixtures. Chrome actual browser; WebKit is not Safari/iPhone hardware. Real LiveKit capture, RTP orientation and YouTube playback are unverified.'},null,2)); await writeFile(`${output}/server.log`,logs); console.log(JSON.stringify({checks,errors},null,2)) }
