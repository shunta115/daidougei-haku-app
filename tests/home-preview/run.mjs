import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import { webkit, devices } from 'playwright'
const output = '/private/tmp/haku-home-safe/artifacts/home-verification'
await mkdir(output,{recursive:true})
const server=spawn('python3',['-m','http.server','4188','--bind','127.0.0.1','--directory','artifacts/home-preview-dist'],{stdio:'ignore'})
const checks=[], errors=[], remote=[]
let browser
function check(name, value){assert.ok(value,name);checks.push(name);console.log('PASS',name)}
try {
 for(let i=0;i<40;i++){try{if((await fetch('http://127.0.0.1:4188')).ok)break}catch{} await new Promise(r=>setTimeout(r,250))}
 browser=await webkit.launch({headless:true,executablePath:process.env.HAKU_WEBKIT_EXECUTABLE || '/Users/shimadashunta/Library/Caches/ms-playwright/webkit_mac14_special-2251/pw_run.sh'})
 const context=await browser.newContext({...devices['iPhone 13'],locale:'ja-JP',timezoneId:'Asia/Tokyo'})
 await context.route('**/*',route=>{if(new URL(route.request().url()).hostname!=='127.0.0.1'){remote.push(route.request().url());return route.abort()}return route.continue()})
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message))
 await page.goto('http://127.0.0.1:4188')
 await page.getByRole('heading',{name:'🔴 LIVE配信中',exact:true}).waitFor()
 check('confirmed LIVE precedes upcoming',await page.locator('.haku-stage section').first().getAttribute('aria-label')==='LIVE配信中')
 check('watch action visible in first viewport',await page.getByRole('button',{name:'今すぐ視聴 →',exact:true}).evaluate(e=>e.getBoundingClientRect().bottom<innerHeight-80 && e.getBoundingClientRect().height>0))
 check('LIVE title visible in first viewport',await page.locator('.haku-stage__live h3').evaluate(e=>e.getBoundingClientRect().bottom<innerHeight-80 && e.getBoundingClientRect().height>0))
 check('reservation button visible without scrolling',await page.getByRole('button',{name:'次のLIVEを予約',exact:true}).evaluate(e=>e.getBoundingClientRect().bottom<innerHeight-80 && e.getBoundingClientRect().height>0))
 check('no horizontal page overflow',await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth))
  await page.screenshot({path:`${output}/iphone-live.png`,fullPage:true,animations:'disabled'})
 await page.screenshot({path:`${output}/iphone-first-view.png`,animations:'disabled'})
 await page.getByRole('button',{name:'次のLIVEを予約',exact:true}).click()
 check('reservation state updates across both entry points',await page.getByRole('button',{name:'予約済み ✓',exact:true}).count()===2)
 await page.getByText('予約の管理',{exact:true}).click()
 await page.getByRole('button',{name:'予約を解除する',exact:true}).click()
 check('cancel requires explicit confirmation',await page.getByRole('button',{name:'予約解除を確定',exact:true}).isVisible())
 await page.getByRole('button',{name:'戻る',exact:true}).click()
 check('back preserves reservation',await page.getByRole('button',{name:'予約済み ✓',exact:true}).count()===2)
 await page.getByRole('button',{name:'予約を解除する',exact:true}).click()
 await page.getByRole('button',{name:'予約解除を確定',exact:true}).click()
 check('explicit cancellation restores reserve',await page.getByRole('button',{name:'LIVEを予約',exact:true}).isEnabled())
 await page.getByRole('button',{name:'今すぐ視聴',exact:false}).click()
 check('watch callback preserved',await page.getByRole('status').textContent().then(t=>t.includes('視聴導線')))
 await page.getByRole('button',{name:'閉じる',exact:true}).click()
 await page.getByRole('button',{name:'プロフィール・フォロー',exact:true}).click()
 check('follow/profile callback preserved',await page.getByRole('status').textContent().then(t=>t.includes('フォロー')))
 await page.getByRole('button',{name:'閉じる',exact:true}).click()
 await page.goto('http://127.0.0.1:4188/?no-live=1')
 await page.getByRole('button',{name:'LIVEを予約',exact:true}).waitFor()
 check('upcoming is first section when no LIVE',await page.locator('.haku-stage section').first().getAttribute('aria-label')==='これからのLIVE')
 check('upcoming reservation visible without scrolling',await page.getByRole('button',{name:'LIVEを予約',exact:true}).evaluate(e=>e.getBoundingClientRect().bottom<innerHeight-80 && e.getBoundingClientRect().height>0))
 await page.screenshot({path:`${output}/iphone-upcoming.png`,fullPage:true})
 await page.setViewportSize({width:844,height:390})
 check('landscape fits width',await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth))
 await page.setViewportSize({width:320,height:568})
 check('320px viewport fits width',await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth))
 check('no remote requests',remote.length===0); check('no page errors',errors.length===0)
 await writeFile(`${output}/results.json`,JSON.stringify({engine:'WebKit iPhone 13 emulation; not a physical iPhone',checks,errors,remote},null,2))
}finally{if(browser)await browser.close();server.kill()}
