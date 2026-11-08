import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createClient } from '@supabase/supabase-js'
import type { VercelRequest, VercelResponse } from '@vercel/node'
import handler from '../../api/ops/inbox'

const { SUPABASE_URL: url, SUPABASE_ANON_KEY: anon, SUPABASE_SERVICE_ROLE_KEY: service, HAKU_TEST_DB_URL: db } = process.env
assert.equal(url, 'http://127.0.0.1:54321', 'requires disposable local Supabase')
assert.ok(anon && service && db && new URL(db).hostname === '127.0.0.1')
const sql = (query: string) => execFileSync('psql', [db, '-v', 'ON_ERROR_STOP=1', '-Atc', query], { encoding: 'utf8' }).trim()
const sb = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } })
const password = 'Disposable-Test-Account-42!'
async function fixture(name: string, role = 'fan') {
  const email = name + '@example.com'
  const { data, error } = await sb.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { role } })
  if (error) throw error
  const id = data.user.id
  assert.match(id, /^[a-f0-9-]{36}$/)
  const client = createClient(url!, anon!, { auth: { persistSession: false, autoRefreshToken: false } })
  const login = await client.auth.signInWithPassword({ email, password })
  if (login.error) throw login.error
  return { id, email, client, token: login.data.session.access_token }
}

async function call(token: string, resource: string, action: string, id: string, reason?: string) {
  let status = 0
  const res = { status(code: number) { status = code; return this }, json() { return this }, setHeader() {} }
  await handler({ method: 'POST', query: {}, headers: { authorization: 'Bearer ' + token }, body: { resource, action, payload: { id, reason } } } as VercelRequest, res as unknown as VercelResponse)
  return status
}

async function assertStaleRestDenied(token: string, id: string) {
  const headers = { apikey: anon!, Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }
  for (const [path, init] of [
    ['/profiles?id=eq.' + id, { method: 'PATCH', body: JSON.stringify({ display_name: 'stale-token-write' }) }],
    ['/rpc/get_admin_metrics', { method: 'POST', body: '{}' }],
  ] as const) {
    const response = await fetch(url + '/rest/v1' + path, { ...init, headers })
    assert.equal(response.status, 403)
    assert.equal((await response.json()).message, 'Account unavailable')
  }
}

// Fail only the outgoing GoTrue admin write once. DB operations and Auth reads are real.
async function failAuthBanOnce(token: string, id: string, action: 'suspend' | 'soft-delete', status: string) {
  const realFetch = globalThis.fetch
  let injected = false
  globalThis.fetch = async (input, init) => {
    const address = input instanceof Request ? input.url : String(input)
    if (!injected && init?.method === 'PUT' && address === url + '/auth/v1/admin/users/' + id) {
      injected = true
      return Response.json({ message: 'injected Auth outage' }, { status: 503 })
    }
    return realFetch(input, init)
  }
  try {
    assert.equal(await call(token, 'users', action, id), 503)
  } finally {
    globalThis.fetch = realFetch
  }
  assert.ok(injected)
  assert.equal(sql(`select status from public.profiles where id='${id}'`), status)
  assert.equal(sql(`select banned_until is null from auth.users where id='${id}'`), 't')
}

async function main() {
  const fan = await fixture('fan')
  const admin = await fixture('admin')
  const pending = await fixture('pending', 'performer')
  const reject = await fixture('reject', 'performer')
  const recovery = await fixture('recovery')
  sql(`update public.profiles set role='admin' where id='${admin.id}';
    insert into public.admin_members(user_id,name,email,permission)
      values ('${admin.id}','Test admin','${admin.email}','super_admin');
    update public.profiles set status='deleted', display_name='Deleted' where id='${recovery.id}';
    insert into public.follows(fan_id,performer_id) values ('${recovery.id}','${pending.id}');
    insert into public.performers(id,stage_name,stripe_account_id) values ('${fan.id}','Existing performer','acct_fixture_preserved');
    insert into public.follows(fan_id,performer_id) values ('${fan.id}','${pending.id}');
    insert into public.tips(fan_id,performer_id,amount_cents,stripe_payment_intent)
    values ('${fan.id}','${pending.id}',700,'pi_fixture_preserved');
    insert into public.events(slug,name_ja,name_en) values ('test-event','TEST','TEST');
    insert into public.event_votes(event_id,performer_id,fan_id)
      select id,'${pending.id}','${fan.id}' from public.events where slug='test-event';
    insert into public.merch_products(seller_id,name,price_yen) values ('${pending.id}','TEST',500);
    insert into public.merch_orders(buyer_id,seller_id,product_id,product_name,unit_price_yen,quantity,amount_yen,stripe_payment_intent)
      select '${fan.id}','${pending.id}',id,'TEST',500,1,500,'pi_merch_fixture' from public.merch_products;
    insert into public.live_sessions(performer_id) values ('${reject.id}');`);
  const snapshot = () => sql(`select jsonb_build_array(
    (select jsonb_agg(to_jsonb(t)) from public.tips t),
    (select jsonb_agg(to_jsonb(f) order by f.fan_id,f.performer_id) from public.follows f),
    (select jsonb_agg(to_jsonb(v)) from public.event_votes v),
    (select jsonb_agg(to_jsonb(o)) from public.merch_orders o),
    (select stripe_account_id from public.performers where id='${fan.id}'),
    (select email from auth.users where id='${fan.id}'))`)
  const before = snapshot()
  const anonymous = createClient(url!, anon!, { auth: { persistSession: false } })
  assert.equal((await anonymous.from('events').select('id')).error, null)
  assert.equal((await pending.client.from('profiles').select('id').eq('id', pending.id).single()).error, null)
  assert.ok((await fan.client.from('profiles').update({ role: 'admin' }).eq('id', fan.id)).error)
  await fan.client.from('profiles').update({ display_name: 'forged' }).eq('id', pending.id)
  assert.notEqual(sql(`select display_name from public.profiles where id='${pending.id}'`), 'forged')
  assert.equal(await call(fan.token, 'users', 'suspend', pending.id), 403)
  assert.ok((await fan.client.rpc('apply_fan_performer', { p_user_id: fan.id, p_actor_id: fan.id })).error)
  assert.equal(await call(fan.token, 'performers', 'approve', pending.id), 403)
  assert.equal(await call(fan.token, 'performer-application', 'apply', pending.id), 200)
  assert.equal(await call(admin.token, 'users', 'apply-performer', fan.id), 200)
  assert.equal(sql(`select role from public.profiles where id='${fan.id}'`), 'performer')
  assert.equal((await fan.client.auth.getUser()).data.user?.id, fan.id)
  assert.ok((await fan.client.rpc('manage_performer_account', { p_actor_id: admin.id, p_user_id: fan.id, p_action: 'approve' })).error)
  assert.equal(await call(admin.token, 'performers', 'approve', pending.id), 200)
  assert.equal(sql(`select status from public.profiles where id='${pending.id}'`), 'active')
  assert.equal(await call(admin.token, 'performers', 'reject', reject.id, 'TEST rejection'), 200)
  assert.equal(sql(`select review_status || ':' || rejection_reason from public.performers where id='${reject.id}'`), 'rejected:TEST rejection')
  assert.equal(sql(`select ended_reason from public.live_sessions where performer_id='${reject.id}'`), 'admin_rejected')
  assert.equal((await fan.client.auth.refreshSession()).data.user?.id, fan.id)
  const ban = await sb.auth.admin.updateUserById(fan.id, { ban_duration: '1h' })
  if (ban.error) throw ban.error
  assert.equal(await call(admin.token, 'performers', 'approve', fan.id), 409)
  await assertStaleRestDenied(fan.token, fan.id)
  await failAuthBanOnce(admin.token, pending.id, 'suspend', 'suspended')
  assert.equal(await call(admin.token, 'performers', 'approve', pending.id), 409)
  await assertStaleRestDenied(pending.token, pending.id)
  assert.equal(await call(admin.token, 'users', 'suspend', pending.id), 200)
  assert.ok((await pending.client.auth.signInWithPassword({ email: pending.email, password })).error)

  await failAuthBanOnce(admin.token, reject.id, 'soft-delete', 'deleted')
  assert.equal(await call(admin.token, 'performers', 'approve', reject.id), 409)
  await assertStaleRestDenied(reject.token, reject.id)
  assert.equal(await call(admin.token, 'users', 'soft-delete', reject.id), 200)
  assert.equal(await call(admin.token, 'users', 'suspend', reject.id), 200)
  assert.equal(sql(`select status from public.profiles where id='${reject.id}'`), 'deleted')
  assert.ok((await reject.client.auth.signInWithPassword({ email: reject.email, password })).error)
  await assertStaleRestDenied(recovery.token, recovery.id)
  assert.equal(await call(admin.token, 'users', 'apply-performer', recovery.id), 409)
  const expectedUpdated = sql(`select updated_at from public.profiles where id='${recovery.id}'`)
  const authBefore = sql(`select to_jsonb(u) from auth.users u where id='${recovery.id}'`)
  const recover = (commit: boolean, email = recovery.email) => execFileSync('psql', [
    db!, '-v', 'target_uuid=' + recovery.id, '-v', 'actor_uuid=' + admin.id,
    '-v', 'verified_email=' + email, '-v', 'expected_updated_at=' + expectedUpdated,
    '-v', 'approved_display_name=Recovered TEST member', '-v', 'approval_reference=CI fixture',
    '-v', 'commit_recovery=' + commit, '-f', 'supabase/runbooks/restore_logically_deleted_fan.sql',
  ], { encoding: 'utf8', stdio: 'pipe' })
  assert.throws(() => recover(true, 'different@example.com'), /Profile differs/)
  recover(false)
  assert.equal(sql(`select status from public.profiles where id='${recovery.id}'`), 'deleted')
  assert.equal(sql(`select count(*) from public.admin_audit where target_id='${recovery.id}'`), '0')
  recover(true)
  assert.equal(sql(`select to_jsonb(u) from auth.users u where id='${recovery.id}'`), authBefore)
  assert.equal(sql(`select count(*) from public.admin_audit where target_id='${recovery.id}' and action='user.recover_logical_delete'`), '1')
  assert.throws(() => recover(true), /Profile differs/)
  const restored = await recovery.client.from('profiles').select('id,email,status,role').eq('id', recovery.id).single()
  assert.equal(restored.error, null)
  assert.deepEqual(restored.data, { id: recovery.id, email: recovery.email, status: 'active', role: 'fan' })
  assert.equal(await call(recovery.token, 'performer-application', 'apply', pending.id), 200)
  assert.equal(await call(admin.token, 'performers', 'approve', recovery.id), 200)
  assert.equal(sql(`select review_status from public.performers where id='${recovery.id}'`), 'approved')
  assert.equal((await recovery.client.auth.refreshSession()).data.user?.id, recovery.id)
  assert.equal(snapshot(), before)
  console.log('PASS: real Auth, RLS, cockpit API, approval/rejection, stale JWT denial, injected Ban failure/retry, guarded recovery rehearsal and audited commit, same-session application and approval, UUID/email/Connect/ledger/vote preservation')
}
void main().catch(error => { console.error(error); process.exitCode = 1 })
