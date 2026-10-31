import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import { webkit, devices } from 'playwright'
const output = process.env.HAKU_E2E_OUTPUT || '/tmp/haku-live-map-evidence'
await mkdir(output, { recursive: true })
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--config', 'tests/e2e/vite.config.ts'], { stdio: 'pipe' })
let log = '', browser
server.stdout.on('data', x => { log += x }); server.stderr.on('data', x => { log += x })
const checks = [], errors = []
const check = (name, ok) => { assert.ok(ok, name); checks.push(name); console.log('PASS', name) }
const url = 'http://127.0.0.1:4179/tests/e2e/harness.html'
try {
  for (let i = 0; i < 80; i++) { try { if ((await fetch(url)).ok) break } catch {} await new Promise(r => setTimeout(r, 250)) }
  browser = await webkit.launch({ headless: true, ...(process.env.HAKU_WEBKIT_EXECUTABLE ? { executablePath: process.env.HAKU_WEBKIT_EXECUTABLE } : {}) })
  const context = await browser.newContext({ ...devices['iPhone 13'], locale: 'ja-JP', timezoneId: 'Asia/Tokyo' })
  await context.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort())
  const page = await context.newPage()
  page.on('pageerror', e => errors.push(e.message))
  await page.goto(url)
  const patch = async (data, realtime = true) => page.evaluate(async ({ data, realtime }) => {
    const api = await import('/tests/e2e/fixture-api.ts'); api.setFixtureLive(data, realtime)
  }, { data, realtime })
  await patch({ stage_name: 'HARIBOW', is_live: false, lat: null, lng: null, location_updated_at: null })
  await page.getByRole('button', { name: 'map', exact: true }).click()
  const list = page.getByRole('region', { name: '配信中一覧', exact: true })
  await list.getByText('現在配信中のパフォーマーはいません。').waitFor()
  check('ended LIVE is absent', await list.getByRole('button').count() === 0)
  await patch({ is_live: true })
  await list.getByRole('button', { name: /HARIBOW/ }).waitFor()
  check('HARIBOW start without GPS appears through realtime', await list.getByText(/位置情報なし・視聴できます/).isVisible())
  check('no fabricated marker without location', await page.locator('.pl-google-marker--live').count() === 0)
  await page.screenshot({ path: `${output}/haribow-no-location.png`, fullPage: true })
  await list.getByRole('button', { name: /HARIBOW/ }).click()
  await page.getByRole('region', { name: 'LIVE視聴遷移' }).waitFor()
  check('tap routes to the HAKU watch callback with the performer ID', await page.evaluate(() => window.__watchId === '10000000-0000-4000-8000-000000000001'))
  await page.getByRole('button', { name: 'map', exact: true }).click()
  await patch({ is_live: false })
  await list.getByText('現在配信中のパフォーマーはいません。').waitFor()
  check('HARIBOW end removes the LIVE immediately', await list.getByRole('button').count() === 0)
  await patch({ stage_name: '別の出演者', is_live: true, lat: 35.7, lng: 139.7, location_updated_at: new Date().toISOString() })
  await page.locator('.pl-google-marker--live').waitFor()
  check('another performer starts with a red LIVE marker', (await page.locator('.pl-google-marker--live').textContent()).includes('🔴 LIVE'))
  await page.locator('.pl-google-marker--live').click()
  await page.getByRole('region', { name: 'LIVE視聴遷移' }).waitFor()
  check('marker tap opens HAKU watch', true)
  await page.getByRole('button', { name: 'map', exact: true }).click()
  await patch({ is_live: false }, false)
  await page.evaluate(() => window.dispatchEvent(new Event('focus')))
  await list.getByText('現在配信中のパフォーマーはいません。').waitFor()
  await page.locator('.pl-google-marker--live').waitFor({ state: 'detached' })
  check('Safari focus refresh removes ended marker when realtime is missed', true)
  await patch({ is_live: true, is_private_test: true })
  await page.waitForTimeout(150)
  check('private LIVE never appears in the directory', await list.getByRole('button').count() === 0)
  check('no runtime errors', errors.length === 0)
} catch (error) { console.error(error); process.exitCode = 1 }
finally {
  await writeFile(`${output}/result.json`, JSON.stringify({ checks, errors, passed: !process.exitCode, boundary: 'Real React MAP and WebKit iPhone emulation. Offline API/Maps adapters; watch navigation callback verified, no real broadcast/payment or physical iPhone.' }, null, 2))
  await writeFile(`${output}/server.log`, log)
  await browser?.close(); server.kill('SIGTERM')
}
