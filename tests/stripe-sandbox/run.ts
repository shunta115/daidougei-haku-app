import { readFileSync,writeFileSync,mkdirSync } from 'node:fs'
import { webkit,devices } from 'playwright'
import { createClient } from '@supabase/supabase-js'
import Stripe from 'stripe'
import assert from 'node:assert/strict'
import { loadTestEnvironment } from './environment'
import { verifySettlementPermissions } from './preflight'
loadTestEnvironment()
const fixtures=JSON.parse(readFileSync(process.env.HAKU_SANDBOX_FIXTURE_FILE || '/private/tmp/haku-pr112-fixtures.json','utf8'))
const admin=createClient(process.env.SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{persistSession:false}})
const fanClient=createClient(process.env.SUPABASE_URL!,process.env.VITE_SUPABASE_ANON_KEY!,{auth:{persistSession:false}})
const auth=await fanClient.auth.signInWithPassword({email:fixtures.fan.email,password:fixtures.fan.password})
if(auth.error||!auth.data.session)throw new Error('test_fan_login_failed')
const stripe=new Stripe(process.env.STRIPE_SECRET_KEY!)
if (process.env.HAKU_CHECKOUT_ONLY !== '1') await verifySettlementPermissions(stripe)
const output=`/private/tmp/haku-pr112-real-e2e${process.env.HAKU_E2E_LABEL ? '-'+process.env.HAKU_E2E_LABEL : ''}`;mkdirSync(output,{recursive:true})
const results:any[]=[]
const browser=await webkit.launch()
let currentPage:any
try {
 const matrix=[]
 for(const artist of fixtures.performers)for(const signedIn of [false,true])for(const surface of ['live','profile'])for(const orientation of ['portrait','landscape'])matrix.push({artist,signedIn,surface,orientation})
 const limit=Number(process.env.HAKU_E2E_LIMIT||matrix.length)
 for(const test of matrix.slice(Number(process.env.HAKU_E2E_START||0),Number(process.env.HAKU_E2E_START||0)+limit)) {
  const context=await browser.newContext({...devices['iPhone 13'],locale:'ja-JP',viewport:test.orientation==='portrait'?{width:390,height:844}:{width:844,height:390}})
  if(test.signedIn)await context.addInitScript(session=>localStorage.setItem('sb-aeqskxxykzapgaudbeqa-auth-token',JSON.stringify(session)),auth.data.session)
  await context.route('**/*',route=>{
    const u=new URL(route.request().url())
    if(u.hostname==='127.0.0.1'||u.hostname==='aeqskxxykzapgaudbeqa.supabase.co'||/(^|\.)(stripe\.com|stripe\.network|stripecdn\.com|hcaptcha\.com)$/.test(u.hostname))return route.continue()
    return route.abort()
  })
  const page=await context.newPage();currentPage=page;page.setDefaultTimeout(45000)
  let body:any;let url:string|undefined
  page.on('request',req=>{if(new URL(req.url()).pathname==='/api/stripe/tip')body=req.postDataJSON()})
  page.on('response',async res=>{if(new URL(res.url()).pathname==='/api/stripe/tip'){try{url=(await res.json()).url}catch{}}})
  const entry=test.surface==='live'?`http://127.0.0.1:4196/live?watch=${test.artist.id}`:`http://127.0.0.1:4196/performer/${test.artist.id}`
  await page.goto(entry,{waitUntil:'domcontentloaded'})
  console.log(JSON.stringify({stage:"entry_loaded",surface:test.surface,orientation:test.orientation}))
  await page.screenshot({path:`${output}/entry-${results.length}.png`})
  if(test.surface==='live')await page.locator(test.orientation==='portrait'?'.pl-live__side-support':'.pl-live__support-cta').tap()
  else await page.locator('.hp-btn--red').first().tap()
  await page.locator('.pl-tip-presets').waitFor()
  console.log(JSON.stringify({stage:'amount_screen'}))
  await page.locator('input[type=number]').fill('100')
  await page.locator('.pl-btn--tip').tap()
  await page.waitForURL('https://checkout.stripe.com/**',{waitUntil:'domcontentloaded'})
  await page.locator('#email').waitFor()
  assert.equal(body.performerId,test.artist.id);assert.equal(body.amountYen,100)
  const {data:tip,error}=await admin.from('tips').select('id,performer_id,fan_id,amount_cents,stripe_session_id').eq('id',body.requestId).single()
  assert.ifError(error);assert.equal(tip.performer_id,test.artist.id);assert.equal(tip.fan_id,test.signedIn?fixtures.fan.id:null)
  const session=await stripe.checkout.sessions.retrieve(tip.stripe_session_id)
  assert.equal(session.livemode,false);assert.equal(session.metadata?.performer_id,test.artist.id);assert.equal(session.amount_total,100)
  await page.screenshot({path:`${output}/checkout-${results.length}.png`})
  if(process.env.HAKU_CHECKOUT_ONLY==='1') {
    results.push({artist:test.artist.label,signedIn:test.signedIn,surface:test.surface,orientation:test.orientation,stripeTestMode:true,checkout:true,attribution:true,paid:false})
    writeFileSync(`${output}/result.json`,JSON.stringify({results,scope:'real Checkout creation and correct TEST recipient; no card payment',expected:limit},null,2))
    console.log(JSON.stringify({passed:results.length,artist:test.artist.label,signedIn:test.signedIn,surface:test.surface,orientation:test.orientation,checkoutOnly:true}))
    await context.close();continue
  }

  // Hosted Stripe Checkout, real test-card entry; no payment endpoint mocking.
  await page.locator('#email').fill('pr112-test@example.invalid')
  const card=page.locator('input[name=cardNumber]')
  await card.fill('4242424242424242')
  await page.locator('input[name=cardExpiry]').fill('1230')
  if(await page.locator('input[name=billingName]').count())await page.locator('input[name=billingName]').fill('PR112 QA')
  if(await page.locator('input[name=billingPostalCode]').count())await page.locator('input[name=billingPostalCode]').fill('1000001')
  const cvc=page.locator('input[name=cardCvc]')
  await cvc.pressSequentially('123',{delay:100})
  assert.equal((await cvc.inputValue()).length,3)
  await page.locator('input[name=billingName]').click()
  assert.equal((await cvc.inputValue()).length,3)
  console.log(JSON.stringify({stage:'test_card_ready'}))
  await page.locator('.SubmitButton').click()
  await page.waitForURL('http://127.0.0.1:4196/**',{timeout:60000,waitUntil:'domcontentloaded'})
  let row:any
  for(let i=0;i<40;i++){
   const result=await admin.from('tips').select('id,status,performer_id,fan_id,amount_cents,stripe_charge_id,settlement_status,performer_share_yen,haku_fee_yen,stripe_fee_yen').eq('id',tip.id).single()
   if(result.error)throw new Error(`test_ledger_read_${result.error.code}`)
   row=result.data;if(row.status==='succeeded'&&row.stripe_charge_id&&row.settlement_status==='settled')break
   await new Promise(resolve=>setTimeout(resolve,500))
  }
  assert.equal(row.status,'succeeded');assert.equal(row.performer_id,test.artist.id);assert.equal(row.amount_cents,100)
  assert.equal(row.settlement_status,'settled','paid tip must include actual-fee settlement')
  const charge=await stripe.charges.retrieve(row.stripe_charge_id,{expand:['balance_transaction']})
  assert.equal(charge.livemode,false)
  assert.equal(charge.amount,100)
  const balance=charge.balance_transaction
  assert.ok(balance && typeof balance !== 'string','actual Stripe balance transaction required')
  assert.equal(row.stripe_fee_yen,balance.fee,'ledger fee must equal actual Stripe fee')
  for(const amount of [row.stripe_fee_yen,row.haku_fee_yen,row.performer_share_yen]) assert.ok(Number.isSafeInteger(amount)&&amount>=0)
  assert.equal(row.stripe_fee_yen+row.haku_fee_yen+row.performer_share_yen,row.amount_cents,'financial conservation')
  const events=await admin.from('stripe_webhook_events').select('event_type,status').eq('object_id',session.id)
  assert.ok(events.data?.some(e=>e.event_type==='checkout.session.completed'&&e.status==='processed'))
  results.push({artist:test.artist.label,signedIn:test.signedIn,surface:test.surface,orientation:test.orientation,tipId:tip.id,stripeTestMode:true,paid:true,attribution:true,webhook:true,settlement:row.settlement_status})
  writeFileSync(`${output}/result.json`,JSON.stringify({results,complete:results.length===matrix.length,expected:matrix.length},null,2))
  console.log(JSON.stringify({passed:results.length,artist:test.artist.label,signedIn:test.signedIn,surface:test.surface,orientation:test.orientation}))
  await context.close()
 }
} catch(error) {
 await currentPage?.screenshot({path:`${output}/failure.png`}).catch(()=>{})
 writeFileSync(`${output}/failure-page.txt`, (await currentPage?.locator("body").innerText().catch(()=>""))||"")
 writeFileSync(`${output}/failure.json`,JSON.stringify({error:String(error).replace(/(?:sk|rk|rkcs|pk)_(?:test|live)_[A-Za-z0-9_]+|whsec_[A-Za-z0-9_]+|cs_(?:test|live)_[A-Za-z0-9]+/g,'[REDACTED]'),completed:results.length},null,2))
 console.log(JSON.stringify({failed:true,completed:results.length,detailsFile:`${output}/failure.json`}))
 process.exitCode=1
} finally {await browser.close()}
