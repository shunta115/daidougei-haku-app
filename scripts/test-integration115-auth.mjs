// Explicit isolated TEST only. Credentials stay in a local 0600 file; never output JWTs or keys.
import { readFile, writeFile, open } from 'node:fs/promises'
import { createClient } from '@supabase/supabase-js'
const fixture=JSON.parse(await readFile(process.env.HAKU115_FIXTURE_FILE || '/private/tmp/haku115-auth-fixture.json','utf8'))
const config=JSON.parse(await readFile(process.env.HAKU115_PUBLIC_FILE || '/private/tmp/haku115-test-publishable.json','utf8'))
if(fixture.project!=='aeqskxxykzapgaudbeqa'||new URL(config.url).hostname!=='aeqskxxykzapgaudbeqa.supabase.co')throw Error('TEST project mismatch')
await (await open('/private/tmp/haku115-auth-test.lock','wx',0o600)).close()
const clients=fixture.actors.map(()=>createClient(config.url,config.key,{auth:{persistSession:false,autoRefreshToken:false}}))
const checks=[],messages=[],comments=[];let sessionId;let scheduleId;let channel
const must=(value,name)=>{if(!value)throw Error(name);checks.push(name)}
const rpc=async(client,name,args)=>{const r=await client.rpc(name,args);if(r.error)throw Error(name+': '+r.error.code);return r.data}
try{
 for(let i=0;i<clients.length;i++){
  const a=fixture.actors[i];const {data,error}=await clients[i].auth.signInWithPassword({email:a.email,password:fixture.password})
  if(error)throw Error('TEST Auth sign-in failed: '+error.code)
  must(data.user.id===a.id&&Boolean(data.session?.access_token),'real TEST Auth actor '+i)
 }
 const [host,a,b]=clients;const performerId=fixture.actors[0].id
 const operationId=crypto.randomUUID()
 sessionId=await rpc(host,'reserve_direct_live',{p_performer_id:performerId,p_operation_id:operationId,p_title:'HAKU115 TEST ONLY'})
 await rpc(host,'activate_direct_live',{p_performer_id:performerId,p_session_id:sessionId,p_operation_id:operationId})
 const row=await host.from('performers').select('live_started_at').eq('id',performerId).single();if(row.error)throw Error('performer read: '+row.error.code)
 const epoch=row.data.live_started_at
 channel=host.channel('haku115-auth-'+crypto.randomUUID()).on('postgres_changes',{event:'*',schema:'public',table:'live_like_totals',filter:'performer_id=eq.'+performerId},e=>messages.push(e.new)).on('postgres_changes',{event:'INSERT',schema:'public',table:'live_comments',filter:'performer_id=eq.'+performerId},e=>comments.push(e.new))
 await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Realtime subscription timeout')),15000);channel.subscribe(status=>{if(status==='SUBSCRIBED'){clearTimeout(timer);resolve()}else if(status==='CHANNEL_ERROR'){clearTimeout(timer);reject(Error('Realtime channel rejected'))}})})
 must(true,'real broadcaster JWT Realtime subscribed')
 const batch=crypto.randomUUID();const args={target_performer_id:performerId,expected_started_at:epoch,batch_id:batch,like_count:5}
 must(await rpc(a,'record_live_likes',args)===5,'fan A writes server total')
 must(await rpc(a,'record_live_likes',args)===5,'same JWT batch retry counts once')
 must(await rpc(b,'record_live_likes',{...args,batch_id:crypto.randomUUID(),like_count:3})===8,'fan B aggregates total eight')
 for(let i=0;i<30&&!messages.some(m=>Number(m.total)===8);i++)await new Promise(r=>setTimeout(r,500))
 must(messages.some(m=>Number(m.total)===8),'real broadcaster receives cumulative eight via Realtime')
 const commentId=crypto.randomUUID()
 const comment=await a.from('live_comments').insert({id:commentId,performer_id:performerId,user_id:fixture.actors[1].id,display_name:'TEST fan A',body:'HAKU115 real Realtime comment',live_session_id:sessionId})
 if(comment.error)throw Error('comment insert: '+comment.error.code)
 const duplicate=await a.from('live_comments').insert({id:commentId,performer_id:performerId,user_id:fixture.actors[1].id,display_name:'TEST fan A',body:'HAKU115 real Realtime comment',live_session_id:sessionId})
 must(duplicate.error?.code==='23505','same comment UUID rejected as duplicate')
 for(let i=0;i<30&&!comments.some(c=>c.id===commentId);i++)await new Promise(r=>setTimeout(r,500))
 must(comments.filter(c=>c.id===commentId).length===1,'real broadcaster receives one fan comment via Realtime')
 const denied=await b.rpc('finish_direct_live',{p_performer_id:performerId,p_session_id:sessionId});must(Boolean(denied.error),'nonowner JWT cannot end LIVE')
 const schedule=await host.from('live_schedules').insert({performer_id:performerId,title:'HAKU115 TEST reservation',scheduled_start_at:new Date(Date.now()+3600000).toISOString()}).select('id').single();if(schedule.error)throw Error('schedule: '+schedule.error.code);scheduleId=schedule.data.id
 for(let i=1;i<3;i++){const r=await clients[i].from('live_reservations').insert({live_schedule_id:scheduleId,user_id:fixture.actors[i].id});if(r.error)throw Error('reserve: '+r.error.code)}
 const own=await a.from('live_reservations').select('user_id').eq('live_schedule_id',scheduleId);must(!own.error&&own.data.length===1&&own.data[0].user_id===fixture.actors[1].id,'real JWT reservation isolation')
 must(await rpc(host,'notify_live_reservations_started',{p_schedule_id:scheduleId,p_live_session_id:sessionId})===2,'two real TEST in-app start notifications')
 await rpc(host,'finish_direct_live',{p_performer_id:performerId,p_session_id:sessionId});sessionId=null
 const late=await a.rpc('record_live_likes',{...args,batch_id:crypto.randomUUID(),like_count:1});must(late.error?.code==='55000','ended LIVE rejects JWT likes')
}finally{
 if(sessionId){const r=await clients[0].rpc('finish_direct_live',{p_performer_id:fixture.actors[0].id,p_session_id:sessionId});if(r.error)console.error('TEST cleanup requires attention: '+r.error.code)}
 if(channel)await clients[0].removeChannel(channel)
 for(const c of clients)await c.auth.signOut({scope:'local'}).catch(()=>{})
 await writeFile('/private/tmp/haku115-auth-result.json',JSON.stringify({checks,passed:checks.length,transport:'real Supabase TEST Auth JWT / PostgREST / Realtime; no LiveKit or Stripe',physicalIPhone:false,testFixtureIds:fixture.actors.map(a=>a.id),retainedTestData:true},null,2))
 console.log(JSON.stringify({passed:checks.length,checks}))
}
