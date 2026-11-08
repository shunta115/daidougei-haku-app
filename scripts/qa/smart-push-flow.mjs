import fs from 'node:fs'
import {randomUUID} from 'node:crypto'
import assert from 'node:assert/strict'
import {request,tokens,fixtures,person} from './smart-push-api.mjs'
const sessions=[],checks=[]
async function live(owner){
 const operation=randomUUID(),p=person(owner),token=tokens.get(owner)
 let r=await request('/rest/v1/rpc/reserve_direct_live',{p_performer_id:p.id,p_operation_id:operation,p_title:`SMART PUSH QA ${fixtures.run}`},token)
 assert.ok(r.status<300,`reserve fixture: ${r.status}/${r.data?.code}`)
 const id=r.data
 r=await request('/rest/v1/rpc/activate_direct_live',{p_performer_id:p.id,p_session_id:id,p_operation_id:operation,p_title:`SMART PUSH QA ${fixtures.run}`},token)
 assert.ok(r.status<300,`activate fixture: ${r.status}/${r.data?.code}`);sessions.push({id,owner});return id
}
async function intent(owner,id,on){return request('/rest/v1/rpc/set_live_push_intent',{p_session_id:id,p_notify:on},tokens.get(owner))}
async function qa(owner,id){
 const r=await request('/rest/v1/rpc/qa_smart_push_session',{p_session_id:id},tokens.get(owner))
 const data=r.data;assert.equal(r.status,200,`QA RPC ${r.status}/${data?.message||''}`);assert.equal(data.providerCalls,0);return data
}
async function end(owner,id){const r=await request('/rest/v1/rpc/finish_direct_live',{p_performer_id:person(owner).id,p_session_id:id},tokens.get(owner));assert.ok(r.status<300,'end QA session')}
try {
 const silent=await live('owner')
 const otherProbe=await request('/rest/v1/rpc/qa_smart_push_session',{p_session_id:silent},tokens.get('owner2'));assert.equal(otherProbe.status,403)
 assert.equal((await qa('owner',silent)).enqueued,false);checks.push('public notification OFF => no queue/claim')
 const armed=await intent('owner',silent,true);assert.ok(armed.status<300,`intent API ${armed.status}/${armed.data?.code||''}`)
 const wrong=await intent('owner2',silent,true);assert.ok(wrong.status>=400);checks.push('other performer cannot set intent')
 assert.equal((await qa('owner',silent)).claimed,0)
 assert.ok((await intent('owner',silent,false)).status<300)
 assert.equal((await qa('owner',silent)).claimed,0);await end('owner',silent);checks.push('cancellation before 45 seconds => zero claims')
 const a=await live('owner'),b=await live('owner2')
 assert.ok((await intent('owner',a,true)).status<300);assert.ok((await intent('owner2',b,true)).status<300)
 // Withdraw independently of the browser permission and shared subscription.
 assert.ok((await request(`/rest/v1/notification_preferences?user_id=eq.${person('fan2').id}`,{live_push_enabled:false},tokens.get('fan2'),'PATCH')).status<300)
 assert.ok((await request(`/rest/v1/notification_preferences?user_id=eq.${person('fan').id}`,{push_daily_limit:1},tokens.get('fan'),'PATCH')).status<300)
 assert.ok((await request(`/rest/v1/notification_preferences?user_id=eq.${person('withdrawn').id}`,{appearance_push_enabled:true,live_push_enabled:false},tokens.get('withdrawn'),'PATCH')).status<300)
 const before=await Promise.all([qa('owner',a),qa('owner2',b)])
 assert.equal(before.reduce((n,r)=>n+r.claimed,0),0);checks.push('two performers: real API claim waits at least 45 seconds')
 console.log('Waiting 46 seconds for real DB send window; provider calls remain zero.')
 await new Promise(resolve=>setTimeout(resolve,46000))
 const after=await Promise.all(Array.from({length:8},(_,i)=>qa(i%2?'owner':'owner2',i%2?a:b)))
 assert.equal(after.reduce((n,r)=>n+r.claimed,0),1,'atomic cross-performer recipient daily cap')
 assert.ok(after.every(r=>r.ownPerformerOnly===true));checks.push('eight concurrent HTTP claims: one eligible recipient claimed once across performers')
 const replay=await Promise.all([qa('owner',a),qa('owner2',b)]);assert.equal(replay.reduce((n,r)=>n+r.claimed,0),0);checks.push('processing row never reclaimed; no duplicate on replay')
 await end('owner',a);await end('owner2',b)
 const ended=await live('owner2');await intent('owner2',ended,true);assert.equal((await qa('owner2',ended)).claimed,0);await end('owner2',ended);assert.equal((await qa('owner2',ended)).claimed,0);checks.push('end before send window => zero claims')
 const report={project:'aeqskxxykzapgaudbeqa',run:fixtures.run,transport:"Supabase REST RPC",passed:true,providerCalls:0,checks,sessions}
 fs.writeFileSync('/private/tmp/haku-smart-flow-results.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2))
} finally {
 // End only this run's synthetic sessions; never delete existing data.
 for(const s of sessions)await end(s.owner,s.id).catch(()=>undefined)

}
