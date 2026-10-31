import {loadTestEnvironment} from './environment'
import {createClient} from '@supabase/supabase-js'
import {readFileSync,writeFileSync} from 'node:fs'
import {randomUUID} from 'node:crypto'
import assert from 'node:assert/strict'
import Stripe from 'stripe'
loadTestEnvironment()
const f=JSON.parse(readFileSync('/private/tmp/haku-pr112-fixtures.json','utf8'))
const stripe=new Stripe(process.env.STRIPE_SECRET_KEY!)
const requestId=randomUUID()
const body={performerId:f.performers[0].id,amountYen:100,requestId}
async function post(value:unknown){const r=await fetch('http://127.0.0.1:4196/api/stripe/tip',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(value)});return {status:r.status,data:await r.json()}}
const first=await post(body);assert.equal(first.status,200)
const retry=await post(body);assert.equal(retry.status,200);assert.equal(retry.data.url,first.data.url)
assert.equal((await post({...body,amountYen:200})).status,409)
assert.equal((await post({...body,performerId:f.performers[1].id})).status,409)
assert.equal((await post({...body,requestId:randomUUID(),amountYen:99})).status,400)
assert.equal((await post({...body,requestId:randomUUID(),amountYen:100.5})).status,400)
assert.equal((await post({...body,requestId:randomUUID(),fanId:f.fan.id})).status,403)
assert.equal((await post({...body,requestId:randomUUID(),performerId:randomUUID()})).status,404)
const sb=createClient(process.env.SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{persistSession:false}})
const row=await sb.from('tips').select('performer_id,amount_cents,stripe_session_id').eq('id',requestId).single()
assert.equal(row.data!.performer_id,body.performerId);assert.equal(row.data!.amount_cents,100)
const session=await stripe.checkout.sessions.retrieve(row.data!.stripe_session_id)
assert.equal(session.livemode,false);assert.equal(session.amount_total,100)
const badSignature=await fetch('http://127.0.0.1:4196/api/stripe/webhook',{method:'POST',headers:{'Content-Type':'application/json','stripe-signature':'t=0,v1=forged'},body:JSON.stringify({type:'checkout.session.completed',data:{object:{metadata:{tip_id:requestId}}}})})
assert.ok(badSignature.status>=400)
const result={passed:true,checks:['same request reuses one Checkout','amount mutation rejected','recipient mutation rejected','below minimum rejected','fraction rejected','forged payer rejected','unknown recipient rejected','stored and Stripe amount match','Stripe livemode=false','forged webhook signature rejected'],paid:false}
writeFileSync('/private/tmp/haku-pr112-real-e2e/security.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result))
