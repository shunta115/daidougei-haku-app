import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdir, writeFile, readFile } from 'node:fs/promises'
import { webkit, devices } from 'playwright'

const output = process.env.HAKU_QR_EVIDENCE || '/tmp/haku-qr-share-evidence'
await mkdir(output, { recursive: true })
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--config', 'tests/qr-share-e2e/vite.config.ts'], { stdio: 'pipe' })
let serverLog = '', browser
server.stdout.on('data', x => { serverLog += x })
server.stderr.on('data', x => { serverLog += x })
const checks = [], errors = []
const check = (name, value) => { assert.ok(value, name); checks.push(name); console.log('PASS', name) }
const visible = async locator => { await locator.first().waitFor({ state: 'visible' }); return true }
const root = 'http://127.0.0.1:4181/tests/qr-share-e2e/harness.html'
try {
  for (let i = 0; i < 80; i++) {
    try { if ((await fetch(root)).ok) break } catch {}
    await new Promise(r => setTimeout(r, 250))
  }
  browser = await webkit.launch({ headless: true })
  const context = await browser.newContext({ ...devices['iPhone 13'], locale: 'ja-JP', timezoneId: 'Asia/Tokyo' })
  await context.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort())
  await context.addInitScript(() => {
    window.print = () => { window.__printed = true }
    Object.defineProperty(navigator, 'share', { configurable: true, value: async payload => {
      if (window.__cancelShare) throw new DOMException('cancelled', 'AbortError')
      window.__shared = payload
    } })
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async text => {
      if (window.__denyClipboard) throw new Error('denied')
      window.__copied = text
    } } })
    document.execCommand = command => { window.__copyFallback = command; return true }
  })
  const page = await context.newPage()
  page.on('pageerror', error => errors.push(error.message))
  await page.clock.install({ time: new Date('2026-10-31T01:00:00Z') })
  await page.goto(root)
  check('main schedule renders the published appearance', await visible(page.getByText('共有確認ステージ', { exact: true })))
  const line = new URL(await page.getByRole('link', { name: 'LINE', exact: true }).getAttribute('href'))
  const landing = new URL(line.searchParams.get('url'))
  check('LINE public URL identifies the performer and appearance', line.hostname === 'social-plugins.line.me' && landing.searchParams.has('profile') && landing.searchParams.has('schedule'))
  const x = new URL(await page.getByRole('link', { name: 'X', exact: true }).getAttribute('href'))
  check('X receives the public URL and appearance text', x.hostname === 'twitter.com' && x.searchParams.get('url') === landing.toString() && x.searchParams.get('text').includes('共有確認ステージ'))
  await page.getByRole('button', { name: '共有', exact: true }).click()
  check('native share payload uses the public URL', await page.evaluate(() => window.__shared?.url.includes('schedule=')))
  await page.getByRole('button', { name: '出演予定URLをコピー' }).click()
  check('copy receives the public URL and confirms success', await page.evaluate(() => window.__copied?.includes('schedule=')) && await visible(page.getByText('URLをコピーしました', { exact: true })))
  await page.evaluate(() => { window.__cancelShare = true })
  await page.getByRole('button', { name: '共有', exact: true }).click()
  check('native share cancellation has no failure banner', !(await page.getByText('共有できませんでした。もう一度お試しください。', { exact: true }).isVisible()))
  await page.evaluate(() => { window.__denyClipboard = true })
  await page.getByRole('button', { name: '出演予定URLをコピー' }).click()
  check('Safari clipboard-denial fallback is invoked', await page.evaluate(() => window.__copyFallback === 'copy'))
  await page.screenshot({ path: `${output}/iphone-share-actions.png`, fullPage: true })
  const publicLanding = root + landing.search
  await page.goto(publicLanding)
  check('anonymous shared URL resolves to the existing appearance detail', await visible(page.locator(`[id="appearance-${landing.searchParams.get('schedule')}"]`)))
  await page.getByRole('button', { name: /QR/ }).first().click()
  check('QR canvas renders in WebKit', await visible(page.locator('.hp-qr__code')))
  const downloadPromise = page.waitForEvent('download')
  await page.locator('.hp-qr__actions').getByRole('button', { name: /保存/ }).click()
  const download = await downloadPromise
  await download.saveAs(`${output}/performer-qr.png`)
  const png = await readFile(`${output}/performer-qr.png`)
  check('QR card downloads as a 720x900 PNG', download.suggestedFilename().endsWith('.png') && png.subarray(1, 4).toString() === 'PNG' && png.readUInt32BE(16) === 720 && png.readUInt32BE(20) === 900)
  const popupPromise = page.waitForEvent('popup')
  await page.getByRole('button', { name: '印刷', exact: true }).click()
  const popup = await popupPromise
  await popup.waitForFunction(() => window.__printed === true)
  check('print card contains only the public name and QR image', (await popup.locator('main h1').innerText()) === 'Safari出演者' && await visible(popup.locator('main img')))
  check('print uses A4 layout', (await popup.locator('style').textContent()).includes('size:A4'))
  await popup.screenshot({ path: `${output}/iphone-qr-print.png`, fullPage: true })
  await popup.getByRole('button', { name: '印刷 / Print', exact: true }).click()
  check('manual print button remains usable', await popup.evaluate(() => window.__printed === true))
  const square = await popup.locator('main img').boundingBox()
  check('QR print image remains square on a phone viewport', Math.abs(square.width - square.height) < 1)
  await popup.emulateMedia({ media: 'print' })
  check('print controls are hidden in print media', !(await popup.getByRole('button', { name: '印刷 / Print', exact: true }).isVisible()))
  await popup.close()
  await page.evaluate(() => { window.__originalOpen = window.open; window.open = () => null })
  await page.getByRole('button', { name: '印刷', exact: true }).click()
  check('blocked popup gives a visible error and allows retry', await visible(page.getByRole('alert')) && await page.getByRole('button', { name: '印刷', exact: true }).isEnabled())
  await page.evaluate(() => { window.open = window.__originalOpen })
  check('no browser runtime errors', errors.length === 0)
  console.log(JSON.stringify({ browser: `WebKit ${browser.version()}`, device: 'iPhone 13', passed: true, checks }, null, 2))
} catch (error) { console.error(error); process.exitCode = 1 }
finally {
  await writeFile(`${output}/result.json`, JSON.stringify({ passed: !process.exitCode, checks, errors, boundary: 'Real QR/profile/schedule React components; offline read-only API fixtures; native share/clipboard/print capture adapters; physical iPhone OS actions remain manual.' }, null, 2))
  await writeFile(`${output}/server.log`, serverLog)
  await browser?.close()
  server.kill('SIGTERM')
}
