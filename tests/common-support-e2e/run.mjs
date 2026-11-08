import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import { webkit, devices } from 'playwright'
const output = process.env.HAKU_E2E_OUTPUT || '/private/tmp/haku-live-tip-evidence'
await mkdir(output, { recursive: true })
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--config', 'tests/common-support-e2e/vite.config.ts'], { stdio: 'pipe' })
let log = ''; server.stdout.on('data', x => log += x); server.stderr.on('data', x => log += x)
const url = 'http://127.0.0.1:4191/tests/common-support-e2e/harness.html'
const checks = [], errors = []
// Bound failures so a broken local server cannot leave the browser running.
const timeout = setTimeout(() => { console.error('LIVE support E2E timeout'); process.exit(1) }, 240_000)
let browser
try {
  for (let i=0;i<100;i++) { try { if ((await fetch(url)).ok) break } catch {} await new Promise(r => setTimeout(r,200)) }
  browser = await webkit.launch(process.env.HAKU_WEBKIT_EXECUTABLE ? { executablePath: process.env.HAKU_WEBKIT_EXECUTABLE } : {})
  for (const [artist, performer] of [['HARIBOW','11111111-1111-4111-8111-111111111111'], ['PAUL(ポール)','22222222-2222-4222-8222-222222222222'], ['Other A','33333333-3333-4333-8333-333333333333'], ['Other B','44444444-4444-4444-8444-444444444444']]) for (const signedIn of [false, true]) {
    const params = `?artist=${encodeURIComponent(artist)}&performer=${performer}${signedIn ? '&signedIn=1' : ''}`
    const context = await browser.newContext({ ...devices['iPhone 13'], locale: 'ja-JP' })
    await context.route('**/*', async route => {
      const request = route.request(), target = new URL(request.url())
      if (target.hostname !== '127.0.0.1') return route.abort()
      if (target.pathname === '/api/livekit/status') return route.fulfill({ json: { configured: false } })
      if (target.pathname === '/api/stripe/tip') {
        const body = request.postDataJSON()
        assert.equal(body.amountYen, 1000); assert.equal(body.returnTo, 'live'); assert.equal(body.performerId, performer)
        assert.equal(body.fanId, signedIn ? 'fan-fixture' : undefined)
        assert.equal(request.headers().authorization, signedIn ? 'Bearer fixture-only' : undefined)
        assert.ok(body.requestId)
        checks.push(`${artist}: ${signedIn ? 'signed-in' : 'guest'}: existing checkout request contract`)
        return route.fulfill({ json: { url: `${new URL(url).origin}/fixture-checkout` } })
      }
      if (target.pathname === '/fixture-checkout') return route.fulfill({ contentType:'text/html', body:'<h1>Mock checkout reached</h1>' })
      return route.continue()
    })
    const page = await context.newPage(); page.on('pageerror', e => errors.push(e.message))
    await page.goto(url + params)
    const button = page.getByRole('button', { name: '応援する', exact: true })
    await button.waitFor()
    await page.getByText('Hello LIVE 0', { exact: false }).waitFor()
    assert.equal(await button.isEnabled(), true)
    // Reproduce the old CSS using real hit testing before verifying the fix.
    const old = await page.addStyleTag({ content: '.pl-live--watch[data-layout="phone-portrait"] .pl-live__panel--live { pointer-events:auto; }' })
    const hit = () => button.evaluate(el => { const r=el.getBoundingClientRect(); return el.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)) })
    assert.equal(await hit(), false, 'old panel intercepts support tap')
    await old.evaluate(el => el.remove())
    assert.equal(await hit(), true, 'fixed panel lets support receive tap')
    await page.screenshot({ path: `${output}/${performer}-${signedIn ? 'signed-in' : 'guest'}-live.png` })
    const comment = page.locator('.pl-live__composer input')
    assert.equal(await comment.isDisabled(), !signedIn)
    if (signedIn) { await comment.tap(); await comment.fill('Safari touch comment'); await comment.blur() }
    await button.tap()
    await page.locator('.pl-tip-presets').waitFor()
    await page.locator('.pl-tip-preset').filter({ hasText: '1,000' }).tap()
    const pay = page.locator('.pl-btn--tip'); assert.equal(await pay.isEnabled(), true)
    await pay.tap(); await page.getByRole('heading', { name:'Mock checkout reached' }).waitFor()
    checks.push(`${artist}: ${signedIn ? 'signed-in' : 'guest'}: WebKit touch → real amount screen → mock checkout`)
    await page.setViewportSize({ width: 844, height: 390 })
    await page.goto(url + params)
    await page.getByRole('button', { name: '応援する', exact: true }).tap()
    await page.locator('.pl-tip-presets').waitFor()
    checks.push(`${artist}: ${signedIn ? 'signed-in' : 'guest'}: landscape side support opens amount screen`)
    await page.goto(url + params)
    await page.locator('.pl-live__support-cta').tap()
    await page.locator('.pl-tip-presets').waitFor()
    checks.push(`${artist}: ${signedIn ? 'signed-in' : 'guest'}: landscape bottom support opens amount screen`)
    await page.setViewportSize({ width:390, height:844 })
    await page.goto(url + params + '&profile=1')
    await page.locator('.hp-btn--red').first().tap()
    await page.locator('.pl-tip-presets').waitFor()
    await page.locator('.pl-tip-preset').filter({ hasText:'1,000' }).tap()
    await page.locator('.pl-btn--tip').tap()
    await page.getByRole('heading', { name:'Mock checkout reached' }).waitFor()
    checks.push(`${artist}: ${signedIn ? 'signed-in' : 'guest'}: real profile → amount → mock checkout`)
    await page.setViewportSize({ width:844, height:390 })
    await page.goto(url + params + '&profile=1')
    await page.locator('.hp-btn--red').first().tap()
    await page.locator('.pl-tip-presets').waitFor()
    checks.push(`${artist}: ${signedIn ? 'signed-in' : 'guest'}: landscape profile opens amount screen`)
    await context.close()
  }
  assert.deepEqual(errors, []); console.log(JSON.stringify({ checks, errors }, null, 2))
} catch(e) { console.error(e); process.exitCode=1 }
finally { clearTimeout(timeout); await browser?.close(); server.kill(); await writeFile(`${output}/result.json`, JSON.stringify({ checks, errors, passed: !process.exitCode, boundary:'Offline adapters and mock checkout; no Stripe payment, webhook, real DB or physical iPhone verified.' }, null, 2)); await writeFile(`${output}/server.log`, log) }
