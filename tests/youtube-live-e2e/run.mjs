import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import { webkit, devices } from 'playwright'
const output = process.env.HAKU_YOUTUBE_EVIDENCE || '/tmp/haku-youtube-evidence'
await mkdir(output, { recursive: true })
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--config', 'tests/youtube-live-e2e/vite.config.ts'], { stdio: 'pipe' })
let logs = '', browser
server.stdout.on('data', x => { logs += x }); server.stderr.on('data', x => { logs += x })
const checks = []
const check = (name, value) => { assert.ok(value, name); checks.push(name); console.log('PASS', name) }
const root = 'http://127.0.0.1:4187/tests/youtube-live-e2e/harness.html'
try {
  for (let i=0;i<80;i++) {
    try { if ((await fetch(root)).ok) break } catch {}
    await new Promise(resolve => setTimeout(resolve,250))
  }
  browser = await webkit.launch({headless:true})
  const context = await browser.newContext({...devices['iPhone 13'],locale:'ja-JP',timezoneId:'Asia/Tokyo'})
  const external = []
  await context.route('**/*', route => {
    if (new URL(route.request().url()).hostname === '127.0.0.1') return route.continue()
    external.push(route.request().url()); return route.abort()
  })
  const page = await context.newPage()
  const errors=[]; page.on('pageerror',error=>errors.push(error.message))
  await page.goto(root)
  await page.getByLabel('YouTube LIVEのURL').fill('https://youtube.com/live/yk6Kjl0WHWs?si=share')
  await page.getByText('動画IDを確認しました：yk6Kjl0WHWs').waitFor()
  check('iPhone URL paste recognizes the reported video ID',true)
  for (const [kind, message] of [['authentication','ログインの有効期限'],['permission','変更する権限がありません'],['database','データベースに保存できませんでした'],['network','通信できませんでした']]) {
    await page.evaluate(kind=>{window.__failure=kind},kind)
    await page.getByRole('button',{name:'HAKUで公開する'}).tap()
    await page.getByRole('alert').filter({hasText:message}).waitFor()
    check(`${kind} error is distinct and preserves input`,(await page.getByLabel('YouTube LIVEのURL').inputValue()).includes('yk6Kjl0WHWs'))
  }
  await page.evaluate(()=>{window.__failure=undefined})
  await page.getByRole('button',{name:'HAKUで公開する'}).tap()
  await page.getByRole('status').filter({hasText:'公開しました'}).waitFor()
  check('publish persists the canonical URL and creates no duplicate writes',await page.evaluate(()=>window.__writes===1&&window.__saved.youtube_live_url==='https://www.youtube.com/watch?v=yk6Kjl0WHWs'))
  await page.getByRole('switch').tap(); await page.getByText(/公開を停止しました/).waitFor()
  await page.getByRole('switch').tap(); await page.getByText(/公開を再開しました/).waitFor()
  check('stop and republish reflect saved state',await page.getByRole('switch').isChecked())
  await page.screenshot({path:`${output}/iphone-published.png`,fullPage:true})
  page.once('dialog',dialog=>dialog.accept())
  await page.getByRole('button',{name:'連携を解除'}).tap(); await page.getByText('YouTube LIVE連携を解除しました。').waitFor()
  check('unlink clears the saved reference',await page.evaluate(()=>window.__saved.youtube_live_url===null&&!window.__saved.youtube_live_enabled))
  await page.getByLabel('YouTube LIVEのURL').fill('https://youtu.be/yk6Kjl0WHWs')
  await page.getByRole('button',{name:'HAKUで公開する'}).tap(); await page.getByText(/公開しました/).waitFor()
  check('publish after unlink works',await page.getByRole('switch').isChecked())
  check('no Google OAuth or YouTube API request',!external.some(url=>/accounts\.google|googleapis/.test(url)))
  check('no uncaught browser exception',errors.length===0)
  await writeFile(`${output}/result.json`,JSON.stringify({browser:'WebKit iPhone 13 emulation',boundary:'local Supabase fixture; external requests blocked',checks,errors},null,2))
} finally { await browser?.close(); server.kill(); await writeFile(`${output}/server.log`,logs) }
