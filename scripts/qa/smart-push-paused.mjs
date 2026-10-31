import fs from 'node:fs'
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {request,tokens,fixtures,person} from './smart-push-api.mjs'
const owner=person('owner'),token=tokens.get('owner'),operation=randomUUID()
const reserved=await request('/rest/v1/rpc/reserve_direct_live',{p_performer_id:owner.id,p_operation_id:operation,p_title:'SMART PUSH QA master OFF'},token)
assert.equal(reserved.status,200);const id=reserved.data
try {
 assert.ok((await request('/rest/v1/rpc/activate_direct_live',{p_performer_id:owner.id,p_session_id:id,p_operation_id:operation},token)).status<300)
 assert.ok((await request('/rest/v1/rpc/set_live_push_intent',{p_session_id:id,p_notify:true},token)).status<300)
 const stopped=await request('/rest/v1/rpc/qa_smart_push_session',{p_session_id:id},token)
 assert.equal(stopped.status,200);assert.equal(stopped.data.enqueued,false);assert.equal(stopped.data.claimed,0);assert.equal(stopped.data.providerCalls,0)
 const report={run:fixtures.run,passed:true,check:'master OFF prevents queue creation for an otherwise eligible owned LIVE',providerCalls:0}
 fs.writeFileSync('/private/tmp/haku-smart-paused-results.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2))
} finally {await request('/rest/v1/rpc/finish_direct_live',{p_performer_id:owner.id,p_session_id:id},token)}
