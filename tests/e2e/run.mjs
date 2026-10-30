import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import { webkit, devices } from 'playwright'

const output = process.env.HAKU_E2E_OUTPUT || '/tmp/haku-safari-evidence'
await mkdir(output, { recursive: true })
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--config', 'tests/e2e/vite.config.ts'], { stdio: 'pipe' })
let serverLog = ''
server.stdout.on('data', x => { serverLog += x })
server.stderr.on('data', x => { serverLog += x })
const results = [], errors = []
let browser
const url = 'http://127.0.0.1:4179/tests/e2e/harness.html'
const check = (name, value) => { assert.ok(value, name); results.push(name); console.log('PASS', name) }
const visible = async locator => { await locator.first().waitFor({ state: 'visible' }); return true }
try {
  for (let i = 0; i < 80; i++) {
    try { if ((await fetch(url)).ok) break } catch {}
    await new Promise(r => setTimeout(r, 250))
  }
  console.log('Starting WebKit')
  browser = await webkit.launch({ headless: true, ...(process.env.HAKU_WEBKIT_EXECUTABLE ? { executablePath: process.env.HAKU_WEBKIT_EXECUTABLE } : {}) })
  const context = await browser.newContext({ ...devices['iPhone 13'], locale: 'ja-JP', timezoneId: 'Asia/Tokyo', geolocation: { latitude: 35.7, longitude: 139.7 }, permissions: ['geolocation'] })
  await context.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort())
  await context.addInitScript(() => {
    window.print = () => { window.__printed = true }
    Object.defineProperty(navigator, 'share', { configurable: true, value: async payload => { window.__shared = payload } })
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async text => { window.__copied = text } } })
  })
  console.log('Opening iPhone page')
  const page = await context.newPage()
  page.on('pageerror', e => errors.push(e.message))
  page.on('dialog', dialog => dialog.accept())
  await page.clock.install({ time: new Date('2026-11-01T01:30:00Z') })
  console.log('Loading isolated app')
  await page.goto(url)
  await page.getByLabel('公演名・イベント名', { exact: true }).fill('Safari統合ステージ')
  await page.getByLabel('開催日', { exact: true }).fill('2026-11-01')
  await page.getByLabel('開始時間', { exact: true }).fill('10:00')
  await page.getByLabel('終了時間', { exact: true }).fill('11:00')
  await page.getByLabel('会場名', { exact: true }).fill('東京テスト公園')
  await page.getByLabel('開催地域', { exact: true }).fill('東京')
  await page.getByLabel('Latitude', { exact: true }).fill('35.7')
  await page.getByLabel('Longitude', { exact: true }).fill('139.7')
  await page.getByRole('button', { name: '公開', exact: true }).click()
  check('mobile registration saves', await visible(page.getByText('保存しました', { exact: true })))
  await page.getByRole('button', { name: 'schedule', exact: true }).click()
  check('registered appearance appears in public schedule', await visible(page.getByText('Safari統合ステージ', { exact: true })))
  const line = await page.getByRole('link', { name: 'LINE', exact: true }).getAttribute('href')
  const landing = new URL(line).searchParams.get('url')
  check('LINE contains public profile and appearance IDs', new URL(landing).searchParams.has('profile') && new URL(landing).searchParams.has('schedule'))
  check('X has an encoded appearance landing link', (await page.getByRole('link', { name: 'X', exact: true }).getAttribute('href')).includes('intent/tweet?'))
  await page.getByRole('button', { name: '共有', exact: true }).click()
  check('native share receives public appearance URL', await page.evaluate(() => window.__shared?.url.includes('schedule=')))
  await page.getByRole('button', { name: '出演予定URLをコピー' }).click()
  check('clipboard receives public appearance URL', await page.evaluate(() => window.__copied?.includes('schedule=')))
  await page.getByRole('button', { name: 'map', exact: true }).click()
  check('scheduled and LIVE markers coexist', await visible(page.locator('.pl-google-marker--appearance')) && await visible(page.locator('.pl-google-marker--live')))
  check('GPS granted shows nearby distance', await visible(page.locator('.pl-near-appearance em').filter({ hasText: /m|km/ })))
  await page.locator('.pl-google-marker--appearance').click()
  check('bounded time window is marked as scheduled performance time', await visible(page.getByText(/出演予定時刻/)))
  await page.screenshot({ path: `${output}/iphone-map.png`, fullPage: true })
  await page.getByRole('button', { name: 'editor', exact: true }).click()
  await page.getByRole('button', { name: '編集', exact: true }).click()
  await page.getByLabel('開始時間', { exact: true }).fill('10:15')
  await page.getByRole('button', { name: '公開', exact: true }).click()
  await visible(page.getByText('保存しました', { exact: true }))
  await page.getByRole('button', { name: 'schedule', exact: true }).click()
  check('time change reaches schedule', await visible(page.getByText('10:15', { exact: true })))
  await page.evaluate(link => history.replaceState({}, '', '/tests/e2e/harness.html' + new URL(link).search), landing)
  await page.getByRole('button', { name: 'profile', exact: true }).click()
  check('shared appearance resolves to the public profile detail', await visible(page.locator(`[id="appearance-${new URL(landing).searchParams.get('schedule')}"]`)))
  const qrButton = page.getByRole('button', { name: /QR/ }).first()
  await qrButton.click()
  check('QR image is generated by WebKit canvas', await visible(page.locator('.hp-qr img')))
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: /保存/ }).last().click()
  const download = await downloadPromise
  await download.saveAs(`${output}/performer-qr.png`)
  check('QR PNG downloads', download.suggestedFilename().endsWith('.png'))
  const popupPromise = page.waitForEvent('popup')
  await page.getByRole('button', { name: 'Print', exact: true }).click()
  const popup = await popupPromise
  await popup.waitForFunction(() => window.__printed === true)
  check('QR print opens a printable card', true)
  await popup.close()
  await page.locator('.hp-qr__top button').click()
  await page.getByRole('button', { name: 'editor', exact: true }).click()
  await page.getByRole('button', { name: '編集', exact: true }).click()
  await page.getByRole('button', { name: '中止', exact: true }).click()
  await visible(page.getByText('保存しました', { exact: true }))
  await page.getByRole('button', { name: 'schedule', exact: true }).click()
  check('cancelled appearance remains labelled in schedule', await visible(page.getByText('中止', { exact: true })))
  await page.getByRole('button', { name: 'map', exact: true }).click()
  await page.locator('.pl-google-marker--appearance').waitFor({ state: 'detached' })
  check('cancelled appearance is removed from MAP while LIVE remains', await visible(page.locator('.pl-google-marker--live')))
  const denied = await browser.newContext({ ...devices['iPhone 13'], locale: 'ja-JP' })
  await denied.addInitScript(() => {
    Object.defineProperty(navigator, 'geolocation', { value: {
      watchPosition: (_ok, fail) => { setTimeout(() => fail({ code: 1, PERMISSION_DENIED: 1 }), 0); return 1 }, clearWatch() {},
    } })
  })
  const deniedPage = await denied.newPage()
  await deniedPage.goto(url)
  await deniedPage.getByRole('button', { name: 'map', exact: true }).click()
  check('GPS denied offers region search without login', await visible(deniedPage.getByPlaceholder('例：東京、練馬城址公園')))
  await denied.close()
  check('no browser runtime errors', errors.length === 0)
  console.log(JSON.stringify({ status: 'passed', browser: `WebKit ${browser.version()}`, device: 'iPhone 13', checks: results }, null, 2))
} catch (error) {
  console.error(error)
  process.exitCode = 1
} finally {
  await writeFile(`${output}/result.json`, JSON.stringify({ checks: results, errors, passed: !process.exitCode, boundary: 'Real React screens + offline API/Maps adapters; not a connected TEST DB E2E or physical iPhone test.' }, null, 2))
  await writeFile(`${output}/server.log`, serverLog)
  await browser?.close()
  server.kill('SIGTERM')
}
