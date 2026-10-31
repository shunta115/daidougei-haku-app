// Real TEST Auth/DB/Realtime + actual LIVE screens. Media status is explicitly unavailable.
import {readFile,writeFile,mkdir} from 'node:fs/promises'
import {createClient} from '@supabase/supabase-js'
import {webkit,devices} from 'playwright'
const f=JSON.parse(await readFile('/private/tmp/haku115-auth-fixture.json','utf8')),c=JSON.parse(await readFile('/private/tmp/haku115-test-publishable.json','utf8'))
if(f.project!=='aeqskxxykzapgaudbeqa'||new URL(c.url).hostname!=='aeqskxxykzapgaudbeqa.supabase.co')throw Error('TEST only')
const host=createClient(c.url,c.key,{auth:{persistSession:false,autoRefreshToken:false}})
const {error}=await host.auth.signInWithPassword({email:f.actors[0].email,password:f.password});if(error)throw Error('TEST Auth failed')
const p=f.actors[0].id,op=crypto.randomUUID(),checks=[],errors=[]
const rpc=async(name,args)=>{const r=await host.rpc(name,args);if(r.error)throw Error(name+': '+r.error.code);return r.data}
let session=await rpc('reserve_direct_live',{p_performer_id:p,p_operation_id:op,p_title:'HAKU115 REAL UI TEST'})
await rpc('activate_direct_live',{p_performer_id:p,p_session_id:session,p_operation_id:op})
const browser=await webkit.launch({headless:true});const contexts=[]
const deadline=setTimeout(()=>{console.error('real TEST UI timeout');process.exit(1)},150_000)
try{
 const pages=[]
 for(let i=0;i<3;i++){
  const context=await browser.newContext({...devices['iPhone 13'],locale:'ja-JP',timezoneId:'Asia/Tokyo'});contexts.push(context)
  await context.route('**/*',route=>{
   const u=new URL(route.request().url())
   if(u.hostname==='aeqskxxykzapgaudbeqa.supabase.co')return route.continue()
   if(u.hostname!=='127.0.0.1')return route.abort()
   if(u.pathname.startsWith('/api/livekit/'))return route.fulfill({status:u.pathname.endsWith('/status')?200:503,json:{configured:false,error:'Real media not configured in this TEST'}})
   return route.continue()
  })
  const page=await context.newPage();page.setDefaultTimeout(20000);page.on('pageerror',e=>errors.push(e.message))
  await page.goto('http://127.0.0.1:4197/tests/integration115-real/index.html?performer='+p+(i===0?'&host=1':''))
  const a=f.actors[i]
  await page.evaluate(async({email,password})=>{const {requireSupabase}=await import('/src/platform/lib/supabase.ts');const r=await requireSupabase().auth.signInWithPassword({email,password});if(r.error)throw Error('TEST login: '+r.error.code)},{email:a.email,password:f.password})
  await page.locator('.pl-live').waitFor();pages.push(page)
 }
 checks.push('three real JWT users render actual broadcaster/viewer screens')
 for(let i=0;i<3;i++)await pages[1].getByLabel('無料のいいねを送る',{exact:true}).first().tap()
 await pages[2].getByLabel('無料のいいねを送る',{exact:true}).first().tap()
 await pages[0].getByText('LIVE累計 ♥ 4',{exact:true}).waitFor({timeout:30000})
 checks.push('two actual viewer screens send four likes to actual broadcaster over real TEST Realtime')
 await pages[0].waitForFunction(()=>Number(document.querySelector('[aria-label="HAKU FEVER 盛り上がりメーター"]')?.getAttribute('aria-valuenow'))>0)
 checks.push('real broadcaster FEVER meter responds to received likes')
 const text='HAKU115 real browser comment '+Date.now()
 await pages[1].locator('.pl-live__composer input').fill(text)
 await pages[1].locator('.pl-live__composer button').tap()
 await pages[0].getByText(text,{exact:false}).waitFor();await pages[2].getByText(text,{exact:false}).waitFor()
 checks.push('actual viewer comment reaches broadcaster and second viewer over real TEST Realtime')
 if(errors.length)throw Error('Browser runtime errors: '+errors.join(';'))
 checks.push('no browser runtime errors')
 await mkdir('/private/tmp/haku115-real-ui',{recursive:true})
 await pages[0].screenshot({path:'/private/tmp/haku115-real-ui/host.png'})
 await pages[1].screenshot({path:'/private/tmp/haku115-real-ui/viewer.png'})
}finally{
 for(const context of contexts)await context.close()
 await browser.close();clearTimeout(deadline)
 if(session)await rpc('finish_direct_live',{p_performer_id:p,p_session_id:session})
 await host.auth.signOut({scope:'local'})
 await writeFile('/private/tmp/haku115-real-ui-result.json',JSON.stringify({checks,errors,passed:checks.length,backend:'real TEST Auth/PostgREST/Realtime with actual React screens; LiveKit status deliberately unavailable; no Stripe',physicalIPhone:false},null,2))
 console.log(JSON.stringify({passed:checks.length,checks,errors}))
}
