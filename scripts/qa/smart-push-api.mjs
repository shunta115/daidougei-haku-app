// Run against the existing isolated TEST project only. No Push provider calls.
// Credentials are read from a private temporary file, never committed or logged.
import fs from 'node:fs'
import assert from 'node:assert/strict'
const {url,key}=JSON.parse(fs.readFileSync(process.env.HAKU_QA_PUBLIC_CONFIG || '/private/tmp/haku-smart-qa-public.json','utf8'))
assert.equal(new URL(url).hostname,'aeqskxxykzapgaudbeqa.supabase.co','TEST project guard')
const fixtures=JSON.parse(fs.readFileSync(process.env.HAKU_QA_CREDENTIALS || '/private/tmp/haku-smart-qa-credentials.json','utf8'))
const tokens=new Map(), results=[]
async function request(path,body,token,method=body===undefined?'GET':'POST') {
 const r=await fetch(url+path,{method,headers:{apikey:key,Authorization:`Bearer ${token||key}`,'Content-Type':'application/json',Prefer:path.startsWith('/rest/v1/follows')?'return=representation,resolution=ignore-duplicates':'return=representation,resolution=merge-duplicates'},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(15000)})
 let data;try{data=await r.json()}catch{data=null}
 return {status:r.status,data}
}
for(const user of fixtures.people){
 const r=await request('/auth/v1/token?grant_type=password',{email:user.email,password:user.password})
 assert.equal(r.status,200,`TEST authentication ${user.name}`)
 assert.equal(r.data.user.id,user.id);assert.equal(r.data.user.app_metadata.smart_push_qa,true)
 tokens.set(user.name,r.data.access_token)
}
results.push('real Auth API: six QA identities authenticated')
const person=name=>fixtures.people.find(p=>p.name===name)
for(const name of ['fan','fan2','stranger','withdrawn']){
 const id=person(name).id,tokensFor=tokens.get(name)
 const r=await request('/rest/v1/notification_preferences?on_conflict=user_id',{user_id:id,live_push_enabled:name!=='withdrawn',push_all_enabled:true,push_timezone:'UTC',push_start_hour:0,push_end_hour:0},tokensFor)
 assert.ok(r.status<300,`own consent ${name}`)
 const sub=await request('/rest/v1/push_subscriptions?on_conflict=endpoint',{user_id:id,endpoint:`https://push.invalid/smart-${fixtures.run}-${name}`,p256dh:'fake-no-device',auth:'fake-no-device',disabled_at:null},tokensFor)
 assert.ok(sub.status<300,`own subscription ${name}`)
 if(name!=='stranger') for(const ownerName of ['owner','owner2']){
  const f=await request('/rest/v1/follows?on_conflict=fan_id,performer_id',{fan_id:id,performer_id:person(ownerName).id},tokensFor)
  assert.ok(f.status<300,`own follow ${name}: ${f.status}/${f.data?.code || ""}`)
 }
}
results.push('real REST: independent consent, follows, fake subscriptions saved through own-user RLS')
const stranger=tokens.get('stranger'),fan=person('fan').id
const changed=await request(`/rest/v1/notification_preferences?user_id=eq.${fan}`,{live_push_enabled:false},stranger,'PATCH')
assert.ok(changed.status===200&&Array.isArray(changed.data)&&changed.data.length===0 || changed.status===403,'cross-user update denied')
const own=await request(`/rest/v1/notification_preferences?user_id=eq.${fan}&select=live_push_enabled`,undefined,tokens.get('fan'))
assert.equal(own.data[0].live_push_enabled,true)
results.push('cross-user consent overwrite denied and original consent retained')
for (const name of ['owner','owner2']) {
 const hidden=await request(`/rest/v1/follows?performer_id=eq.${person(name).id}&select=fan_id`,undefined,tokens.get(name))
 assert.equal(hidden.status,200);assert.deepEqual(hidden.data,[])
}
results.push('performer REST queries cannot discover follower account IDs')
for(const role of [undefined,stranger,tokens.get('owner')]){
 for(const path of ['/rest/v1/live_push_deliveries?select=id','/rest/v1/live_push_events?select=id','/rest/v1/smart_push_control?select=enabled','/rest/v1/smart_push_runs?select=id']){
  const r=await request(path,undefined,role);assert.ok(r.status===401||r.status===403,`queue inaccessible to browser role: ${r.status}`)
 }
 const r=await request('/rest/v1/rpc/enqueue_live_start_push',{p_live_session_id:'00000000-0000-4000-8000-000000000001',p_owner_id:person('owner').id},role)
 assert.ok(r.status===401||r.status===403||r.status===404,'privileged enqueue inaccessible')
}
results.push('anon, fan and performer cannot read queues or execute service enqueue')
fs.writeFileSync('/private/tmp/haku-smart-api-results.json',JSON.stringify({testProject:new URL(url).hostname,run:fixtures.run,passed:true,checks:results},null,2))
console.log(JSON.stringify({passed:true,checks:results},null,2))
export {request,tokens,fixtures,person}
