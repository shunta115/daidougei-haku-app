import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const playwright = await import(process.env.HAKU_PLAYWRIGHT_PACKAGE || 'playwright')
const engineName = process.env.HAKU_QA_BROWSER || 'webkit'
assert.ok(['webkit', 'chromium'].includes(engineName), 'Choose webkit or chromium')
const browser = await playwright[engineName].launch({ headless: true })
const base = process.env.HAKU_QA_BASE_URL || 'http://127.0.0.1:4179'
const output = resolve(process.env.HAKU_QA_OUTPUT || '/private/tmp/haku-live-layout-qa')
await mkdir(output, { recursive: true })
const results = { browser: engineName, version: browser.version(), environment: 'localhost synthetic media/API fixtures; not iPhone Safari or real LiveKit', checks: [] }

async function pageFor(width, height) {
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, locale: 'ja-JP' })
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.route('**/*', (route) => {
    const hostname = new URL(route.request().url()).hostname
    return ['127.0.0.1', 'localhost'].includes(hostname) ? route.continue() : route.abort()
  })
  return { context, page, errors }
}
async function dimensions(page) {
  return page.locator('.pl-live__stage').evaluate((element) => {
    const stage = element.getBoundingClientRect()
    const video = element.querySelector('video')
    const comments = document.querySelector('.pl-live__comments-wrap')?.getBoundingClientRect()
    return { stage: { width: stage.width, height: stage.height }, video: video ? { width: video.videoWidth, height: video.videoHeight } : null, comments: comments ? { width: comments.width, height: comments.height } : null }
  })
}

try {
  for (const [name, width, height] of [['portrait', 390, 844], ['landscape', 844, 390]]) {
    let baseline
    for (const count of [0, 100, 1000]) {
      const { page, context, errors } = await pageFor(width, height)
      await page.goto(`${base}/experiments/live-ui/browser-harness.html?screen=viewer&comments=${count}&orientation=${name}`)
      await page.locator('.pl-live__stage video').waitFor()
      await page.waitForFunction(() => document.querySelector('video')?.videoWidth > 0)
      await page.waitForFunction((expected) => document.querySelectorAll('.pl-live__comment').length === expected, count)
      assert.equal(await page.locator('.pl-live__comment').count(), count)
      const measured = await dimensions(page)
      baseline ||= measured.stage
      assert.ok(Math.abs(measured.stage.width - baseline.width) < 2 && Math.abs(measured.stage.height - baseline.height) < 2, 'Comments must not shrink the stage')
      assert.ok(measured.stage.width >= width - 4 && measured.stage.height >= height - 4, 'Mobile stage should fill the viewport')
      await page.screenshot({ path: `${output}/viewer-${name}-${count}.png` })
      results.checks.push({ type: 'viewer-density', name, width, height, comments: count, ...measured })
      if (count === 100) {
        await page.getByRole('button', { name: '視聴設定', exact: true }).click()
        await page.getByRole('button', { name: '全画面', exact: true }).click()
        await page.screenshot({ path: `${output}/viewer-${name}-cover.png` })
        const cover = await dimensions(page)
        assert.deepEqual(cover.stage, measured.stage, 'Display fit must not change the media stage')
        results.checks.push({ type: 'display-cover', name, stage: cover.stage })
        await page.locator('video').evaluate((element) => { element.dataset.qaIdentity = 'original-video' })
        await page.getByRole('button', { name: '小窓で視聴を続ける', exact: true }).click()
        await page.locator('.pl-live--mini').waitFor()
        assert.equal(await page.locator('video').getAttribute('data-qa-identity'), 'original-video')
        assert.equal(await page.evaluate(() => window.__hakuLiveQa.connects), 1)
        await page.screenshot({ path: `${output}/mini-${name}.png` })
        await page.getByRole('button', { name: 'LIVE画面に戻る', exact: true }).click()
        assert.equal(await page.locator('video').getAttribute('data-qa-identity'), 'original-video')
        assert.equal(await page.evaluate(() => window.__hakuLiveQa.connects), 1)
        await page.evaluate(() => window.__hakuLiveQa.end())
        await page.getByTestId('fixture-closed').waitFor()
        assert.equal(await page.evaluate(() => window.__hakuLiveQa.disconnects), 1)
        results.checks.push({ type: 'mini-lifecycle', name, sameVideoElement: true, connects: 1, disconnectsAfterEnd: 1 })
      }
      assert.deepEqual(errors, [])
      await context.close()
    }
    const { page, context, errors } = await pageFor(width, height)
    await page.goto(`${base}/experiments/live-ui/browser-harness.html?screen=host&comments=100&orientation=${name}`)
    await page.waitForFunction(() => document.querySelector('video')?.videoWidth > 0)
    assert.equal(await page.getByRole('dialog', { name: '配信設定', exact: true }).count(), 0)
    await page.screenshot({ path: `${output}/host-${name}.png` })
    await page.getByRole('button', { name: '配信設定', exact: true }).click()
    const sheet = page.getByRole('dialog', { name: '配信設定', exact: true })
    const box = await sheet.boundingBox()
    assert.ok(box && box.height / height <= .76, 'Settings sheet should not cover most of the viewport')
    results.checks.push({ type: 'host-settings', name, sheetCoverage: box.height / height })
    await page.screenshot({ path: `${output}/host-settings-${name}.png` })
    await page.getByRole('button', { name: '設定を閉じる', exact: true }).click()
    assert.equal(await sheet.count(), 0)
    await page.getByRole('button', { name: '配信設定', exact: true }).click()
    await page.getByRole('button', { name: '全画面', exact: true }).click()
    await page.screenshot({ path: `${output}/host-${name}-cover.png` })
    assert.deepEqual(errors, [])
    await context.close()
  }
  const { page, context, errors } = await pageFor(390, 844)
  await page.goto(`${base}/experiments/live-ui/browser-harness.html?screen=host&phase=ready`)
  await page.getByRole('heading', { name: 'LIVE配信の設定', exact: true }).waitFor()
  await page.screenshot({ path: `${output}/host-setup-portrait.png` })
  assert.deepEqual(errors, [])
  await context.close()
  await writeFile(`${output}/results.json`, JSON.stringify(results, null, 2))
  console.log(JSON.stringify({ passed: true, output, checks: results.checks.length, environment: results.environment }))
} finally {
  await browser.close()
}
