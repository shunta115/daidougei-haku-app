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

async function call(token: string, resource: string, action: string, id: string) {
  let status = 0
  const res = { status(code: number) { status = code; return this }, json() { return this }, setHeader() {} }
  await handler({ method: 'POST', query: {}, headers: { authorization: 'Bearer ' + token }, body: { resource, action, payload: { id } } } as VercelRequest, res as unknown as VercelResponse)
  return status
}

async function main() {
  const fan = await fixture('fan')
  const admin = await fixture('admin')
  const pending = await fixture('pending', 'performer')
  sql(`update public.profiles set role='admin' where id='${admin.id}';
    insert into public.admin_members(user_id,name,email) values ('${admin.id}','Test admin','${admin.email}');
    insert into public.performers(id,stage_name,stripe_account_id) values ('${fan.id}','Existing performer','acct_fixture_preserved');
    insert into public.follows(fan_id,performer_id) values ('${fan.id}','${pending.id}');
    insert into public.tips(fan_id,performer_id,amount_cents,stripe_payment_intent)
    values ('${fan.id}','${pending.id}',700,'pi_fixture_preserved');`)
  const snapshot = () => sql(`select jsonb_build_array(
    (select jsonb_agg(to_jsonb(t)) from public.tips t),
    (select jsonb_agg(to_jsonb(f)) from public.follows f),
    (select stripe_account_id from public.performers where id='${fan.id}'),
    (select email from auth.users where id='${fan.id}'))`)
  const before = snapshot()
  assert.ok((await fan.client.rpc('apply_fan_performer', { p_user_id: fan.id, p_actor_id: fan.id })).error)
  assert.equal(await call(fan.token, 'performers', 'approve', pending.id), 403)
  assert.equal(await call(fan.token, 'performer-application', 'apply', pending.id), 200)
  assert.equal(await call(admin.token, 'users', 'apply-performer', fan.id), 200)
  assert.equal(sql(`select role from public.profiles where id='${fan.id}'`), 'performer')
  assert.equal((await fan.client.auth.getUser()).data.user?.id, fan.id)
  assert.ok((await fan.client.rpc('manage_performer_account', { p_actor_id: admin.id, p_user_id: fan.id, p_action: 'approve' })).error)
  assert.equal(await call(admin.token, 'performers', 'approve', pending.id), 200)
  assert.equal(sql(`select status from public.profiles where id='${pending.id}'`), 'active')
  const ban = await sb.auth.admin.updateUserById(fan.id, { ban_duration: '1h' })
  if (ban.error) throw ban.error
  assert.equal(await call(admin.token, 'performers', 'approve', fan.id), 409)
  assert.equal(await call(admin.token, 'users', 'suspend', pending.id), 200)
  assert.equal(await call(admin.token, 'performers', 'approve', pending.id), 409)
  assert.ok((await pending.client.auth.signInWithPassword({ email: pending.email, password })).error)
  assert.equal(await call(admin.token, 'users', 'soft-delete', pending.id), 200)
  assert.equal(await call(admin.token, 'users', 'suspend', pending.id), 200)
  assert.equal(await call(admin.token, 'performers', 'approve', pending.id), 409)
  assert.equal(sql(`select status from public.profiles where id='${pending.id}'`), 'deleted')
  assert.equal(snapshot(), before)
  console.log('PASS: real Auth, RLS, cockpit API, approval, ban, suspension, deletion retry, UUID/email/Connect/history preservation')
}
void main().catch(error => { console.error(error); process.exitCode = 1 })
