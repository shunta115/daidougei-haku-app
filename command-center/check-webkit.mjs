import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { devices, webkit } from 'playwright'

const port = 4189
const url = 'http://127.0.0.1:' + port
const password = 'WebKitFixtureOnly-42'
const child = spawn(process.execPath, [new URL('./preview.mjs', import.meta.url).pathname], {
  env: { ...process.env, HAKU_PREVIEW_HOST: '127.0.0.1', HAKU_PREVIEW_PORT: String(port), HAKU_PREVIEW_PASSWORD: password },
  stdio: ['ignore', 'pipe', 'inherit'],
})
let browser
try {
  await new Promise((resolve, reject) => {
    child.stdout.once('data', resolve)
    child.once('error', reject)
    child.once('exit', code => reject(new Error('Preview exited ' + code)))
  })
  for (const path of ['/', '/main.js', '/styles.css']) assert.equal((await fetch(url + path)).status, 401)
  const wrong = await fetch(url, { headers: { authorization: 'Basic ' + Buffer.from('reviewer:incorrect').toString('base64') } })
  assert.equal(wrong.status, 401)
  browser = await webkit.launch({ ...(process.env.HAKU_WEBKIT_EXECUTABLE ? { executablePath: process.env.HAKU_WEBKIT_EXECUTABLE } : {}) })
  const credentials = { username: 'reviewer', password }
  const context = await browser.newContext({ ...devices['iPhone 13'], httpCredentials: credentials })
  const page = await context.newPage()
  const outside = [], errors = []
  page.on('request', request => { if (!request.url().startsWith(url + '/')) outside.push(request.url()) })
  page.on('pageerror', error => errors.push(error.message))
  await page.goto(url)
  await page.getByRole('heading', { name: '運営ダッシュボード' }).waitFor()
  assert.match(await page.locator('.queue').first().innerText(), /LIVEの更新/)
  await page.screenshot({ path: '/tmp/haku-command-center-iphone.png', fullPage: true })
  const mobile = page.getByRole('navigation', { name: 'モバイル管理メニュー' })
  await page.getByRole('button', { name: '優先項目を見る' }).click()
  await page.getByRole('heading', { name: 'LIVE監視' }).waitFor()
  assert.ok((await page.getByText('通信品質（実測）').count()) > 0)
  await mobile.getByRole('button', { name: '売上・精算' }).click()
  await page.locator('summary').first().click()
  assert.equal(await page.locator('details[open]').count(), 1)
  await mobile.getByRole('button', { name: 'システム' }).click()
  await page.getByRole('button', { name: '取得失敗' }).click()
  await mobile.getByRole('button', { name: '概要' }).click()
  assert.equal(await page.locator('.metric strong').allTextContents().then(a => a.filter(x => x === '未取得').length), 4)
  await mobile.getByRole('button', { name: 'システム' }).click()
  await page.getByRole('button', { name: '実績0件' }).click()
  await mobile.getByRole('button', { name: '概要' }).click()
  assert.equal(await page.locator('.metric strong').allTextContents().then(a => a.filter(x => x === '¥0').length), 2)
  await page.getByRole('button', { name: '未送金の出演者は？' }).click()
  assert.match(await page.locator('.answer').innerText(), /¥0/)
  for (const width of [320, 390, 430]) {
    await page.setViewportSize({ width, height: 840 })
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
  }
  const desktop = await browser.newContext({ viewport: { width: 1440, height: 1050 }, httpCredentials: credentials })
  const desktopPage = await desktop.newPage()
  await desktopPage.goto(url)
  await desktopPage.getByRole('heading', { name: '運営ダッシュボード' }).waitFor()
  await desktopPage.screenshot({ path: '/tmp/haku-command-center-desktop.png', fullPage: true })
  assert.deepEqual(outside, [])
  assert.deepEqual(errors, [])
  console.log('PASS: iPhone WebKit, desktop, private assets, invalid credentials, priority, drill-down, DEMO failure vs ¥0, rules, no external requests or horizontal overflow')
} finally {
  await browser?.close()
  child.kill('SIGTERM')
}
