import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import { webkit, devices } from 'playwright'
const output = process.env.HAKU_E2E_OUTPUT || '/tmp/haku-map-incident-browser'
await mkdir(output, { recursive: true })
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--config', 'tests/e2e/vite.config.ts'], { stdio: 'pipe' })
let browser, log = ''
server.stdout.on('data', x => log += x); server.stderr.on('data', x => log += x)
const checks = [], errors = []
const check = (name, ok) => { assert.ok(ok, name); checks.push(name); console.log('PASS', name) }
const url = 'http://127.0.0.1:4179/tests/e2e/harness.html'
try {
  for (let i = 0; i < 80; i++) { try { if ((await fetch(url)).ok) break } catch {} await new Promise(r => setTimeout(r, 250)) }
  browser = await webkit.launch({ headless: true, ...(process.env.HAKU_WEBKIT_EXECUTABLE ? { executablePath: process.env.HAKU_WEBKIT_EXECUTABLE } : {}) })
  const context = await browser.newContext({ ...devices['iPhone 13'], locale: 'ja-JP', timezoneId: 'Asia/Tokyo' })
  await context.route('**/*', r => new URL(r.request().url()).hostname === '127.0.0.1' ? r.continue() : r.abort())
  const page = await context.newPage()
  page.on('pageerror', e => errors.push(e.message))
  await page.clock.install({ time: new Date('2026-10-31T06:57:00Z') })
  await page.addInitScript(() => localStorage.setItem('haku-e2e-appearances', JSON.stringify([{
    id: 'haribow', performer_id: '10000000-0000-4000-8000-000000000001', title: '大道芸ワールドカップin静岡2026',
    performance_date: '2026-10-31', starts_at: '2026-10-31T03:00:00Z', ends_at: '2026-10-31T11:00:00Z',
    start_time: '12:00:00', end_time: '20:00:00', timezone: 'Asia/Tokyo', status: 'published',
    venue_name: '静岡駅', region: '静岡駅付近', country: 'Japan', venue_address: '', venue_lat: null, venue_lng: null,
  }])))
  await page.goto(url)
  await page.evaluate(async () => { const api = await import('/tests/e2e/fixture-api.ts'); api.setFixtureLive({stage_name: 'HARIBOW', is_live: false, lat: null, lng: null}) })
  await page.getByRole('button', {name:'map', exact:true}).click()
  const unknown = page.getByRole('region', {name:'位置未確定の出演予定',exact:true})
  await unknown.getByText('HARIBOW', {exact:true}).waitFor()
  check('HARIBOW is discoverable at 15:57 without coordinates', await unknown.getByText(/静岡駅付近/).isVisible())
  check('no fabricated appearance pin', await page.locator('.pl-google-marker--appearance').count() === 0)
  const link = new URL(await unknown.getByRole('link').getAttribute('href'))
  check('unknown position searches venue instead of routing to invented coordinates', link.pathname === '/maps/search/' && !link.searchParams.has('destination'))
  await page.screenshot({path:`${output}/haribow-unlocated-iphone.png`,fullPage:true})
  await page.getByRole('button', {name:'schedule',exact:true}).click()
  check('same public plan appears in schedule', await page.getByText('大道芸ワールドカップin静岡2026',{exact:true}).isVisible())
  await page.evaluate(async () => { const api = await import('/tests/e2e/fixture-api.ts'); await api.updatePerformerAppearance('haribow',{end_time:null}); window.dispatchEvent(new Event('focus')) })
  await page.getByRole('button', {name:'map',exact:true}).click()
  await unknown.getByText(/終了時刻未登録/).waitFor()
  check('started plan with unknown end remains a plan', !((await unknown.textContent()).includes('出演中')))
  await page.getByRole('button', {name:'🔴 LIVE',exact:true}).click()
  check('LIVE filter excludes unknown scheduled plans', await unknown.count() === 0)
  await page.getByRole('button', {name:'すべて',exact:true}).click()
  await unknown.waitFor()
  await page.evaluate(async () => { const api = await import('/tests/e2e/fixture-api.ts'); await api.updatePerformerAppearance('haribow',{status:'cancelled'}); window.dispatchEvent(new Event('focus')) })
  await unknown.waitFor({state:'detached'})
  check('focus refresh removes cancelled plan', true)
  check('no runtime errors', errors.length === 0)
} catch (e) { console.error(e); process.exitCode = 1 }
finally {
  await writeFile(`${output}/result.json`, JSON.stringify({passed:!process.exitCode,checks,errors,boundary:'Real React + WebKit iPhone13 emulation, offline API/Maps. No production mutations or real GPS/device validation.'},null,2))
  await writeFile(`${output}/server.log`,log)
  await browser?.close(); server.kill('SIGTERM')
}
