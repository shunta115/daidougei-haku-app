import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const connection = new URL(process.env.HAKU_RECOVERY_TEST_DB_URL ?? 'about:blank')
assert.ok(['postgres:', 'postgresql:'].includes(connection.protocol) &&
  connection.hostname === '127.0.0.1' && connection.username === 'postgres' &&
  connection.pathname === '/haku_performer_recovery_test' && !connection.search && !connection.hash,
'Use a fresh local haku_performer_recovery_test database')

const env = Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith('PG')))
const exec = promisify(execFile)
const psql = async (...args) => {
  const { stdout } = await exec('psql', ['-XqAtw', '-v', 'ON_ERROR_STOP=1', connection.href, ...args], { env, timeout: 30_000 })
  return stdout.trim()
}
const query = (sql) => psql('-c', sql)
const variables = (values) => Object.entries(values).flatMap(([key, value]) => ['-v', `${key}=${value}`])
const target = '10000000-0000-4000-8000-000000000001'
const actor = '10000000-0000-4000-8000-000000000002'
const other = '10000000-0000-4000-8000-000000000003'
const duplicate = '10000000-0000-4000-8000-000000000004'
const input = {
  target_uuid: target,
  actor_uuid: actor,
  other_uuid: other,
  verified_email: 'performer@example.invalid',
  expected_display_name: 'TEST recovery',
  profile_recovery_reference: 'TEST-PROFILE-RECOVERY',
  approval_reference: 'TEST-PERFORMER-RECOVERY',
}

assert.equal(await query(`select current_database() = 'haku_performer_recovery_test'
  and inet_server_addr() = inet '127.0.0.1' and to_regclass('auth.users') is null`), 't')
await psql(...variables(input), '-f', 'tests/sql/performer-access-recovery-fixture.sql')
input.expected_updated_at = await query(`select updated_at from public.profiles where id = '${target}'`)

const run = (overrides = {}) => psql(...variables({ ...input, ...overrides }),
  '-f', 'supabase/runbooks/restore_performer_access.sql')
const preserved = [
  'auth.users', 'auth.identities', 'auth.sessions', 'public.tips', 'public.follows', 'public.live_reservations',
  'public.merch_orders', 'public.event_device_ballots', 'public.performer_payouts', 'public.product_events',
]
const all = [...preserved, 'public.profiles', 'public.performers', 'public.admin_audit', 'public.account_retirements']
const snapshot = async (tables = all) => JSON.parse(await query(`select jsonb_build_array(${tables.map((table) =>
  `(select coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text), '[]') from ${table} r)`).join(',')})`))
const deny = async (message, overrides = {}) => {
  const before = await snapshot()
  await assert.rejects(run({ commit_recovery: 'true', ...overrides }), (error) => error.stderr.includes(message))
  assert.deepEqual(await snapshot(), before)
}

const original = await snapshot()
assert.match(await run(), new RegExp(`^${target}\\|performer\\|active\\|[^|]+\\|pending\\|f\\|[0-9a-f-]+$`))
assert.deepEqual(await snapshot(), original)

await deny('Profile differs', { verified_email: 'wrong@example.invalid' })
await deny('Profile differs', { expected_updated_at: '2000-01-01T00:00:00Z' })
await deny('Profile differs', { expected_display_name: 'Wrong stage name' })
await deny('separate approval reference', { approval_reference: input.profile_recovery_reference })
await deny('query returned no rows', { profile_recovery_reference: 'TEST-UNRELATED-RECOVERY' })
await deny('active super-admin', { actor_uuid: other })

await query(`update auth.users set banned_until = now() + interval '1 day' where id = '${target}'`)
await deny('Auth account does not meet recovery conditions')
await query(`update auth.users set banned_until = null where id = '${target}'`)

await query(`insert into auth.users (id, email) values ('${duplicate}', upper('${input.verified_email}'))`)
await deny('Another account uses the verified email')
await query(`delete from auth.users where id = '${duplicate}'`)

await query(`insert into public.performers (id, stage_name, is_approved, review_status, stripe_account_id)
  values ('${target}', 'Preserve this performer', true, 'approved', 'fixture-legacy-connect')`)
await deny('existing performer record')
await query(`delete from public.performers where id = '${target}'`)

await query(`update public.performers set stage_name = '${input.expected_display_name}' where id = '${other}'`)
await deny('existing performer record')
await query(`update public.performers set stage_name = 'Other performer' where id = '${other}'`)

await query(`insert into public.account_retirements (original_auth_user_id, email_sha256)
  values ('${duplicate}', encode(sha256(convert_to('${input.verified_email}', 'UTF8')), 'hex'))`)
await deny('Account retirement')
await query('delete from public.account_retirements')

await query(`update public.tips set original_performer_id = '${target}'`)
await deny('Historical performer evidence')
await query('update public.tips set original_performer_id = null')

await query(`alter table public.admin_audit add constraint reject_test_recovery check (action <> 'performer.recover_access')`)
await deny('reject_test_recovery')
await query('alter table public.admin_audit drop constraint reject_test_recovery')

const unchanged = await snapshot(preserved)
const originalPerformer = await query(`select to_jsonb(f) from public.performers f where id = '${other}'`)
const profileFields = `select to_jsonb(p) - 'role' - 'updated_at' from public.profiles p where id = '${target}'`
const originalProfile = await query(profileFields)
const priorAudit = await query(`select to_jsonb(a) from public.admin_audit a where action = 'user.recover_logical_delete'`)
const both = await Promise.allSettled([run({ commit_recovery: 'true' }), run({ commit_recovery: 'true' })])
assert.equal(both.filter(({ status }) => status === 'fulfilled').length, 1)
assert.match(both.find(({ status }) => status === 'rejected').reason.stderr, /Profile differs/)

assert.equal(await query(`select role || ':' || status from public.profiles where id = '${target}'`), 'performer:active')
assert.equal(await query(profileFields), originalProfile)
assert.equal(await query(`select to_jsonb(f) from public.performers f where id = '${other}'`), originalPerformer)
assert.equal(await query(`select to_jsonb(a) from public.admin_audit a where action = 'user.recover_logical_delete'`), priorAudit)
assert.equal(await query(`select count(*) from public.performers where id = '${target}' and stage_name = '${input.expected_display_name}'
  and review_status = 'pending' and not (is_approved or is_live or share_location or is_private_test or stripe_onboarding_complete)
  and stripe_account_id is null`), '1')
assert.equal(await query(`select count(*) from public.admin_audit a join public.admin_audit prior
  on a.meta->>'profile_recovery_audit_id' = prior.id::text
  where a.target_id = '${target}' and a.admin_id = '${actor}' and a.action = 'performer.recover_access'
    and a.meta->>'approval_reference' = '${input.approval_reference}' and a.meta->>'review_status' = 'pending'`), '1')
assert.deepEqual(await snapshot(preserved), unchanged)
await deny('Profile differs')

assert.equal(await query(`begin; set local role anon;
  select count(*) from public.performers where id = '${target}'; rollback;`), '0')
assert.equal(await query(`begin; set local role authenticated; set local request.jwt.claim.sub = '${other}';
  select count(*) from public.performers where id = '${target}'; rollback;`), '0')
const owner = `begin; set local role authenticated; set local request.jwt.claim.sub = '${target}';`
assert.equal(await query(`${owner} update public.performers set bio = 'Owner can edit'
  where id = '${target}' returning bio; rollback;`), 'Owner can edit')
await assert.rejects(query(`${owner} update public.performers set is_approved = true where id = '${target}';`),
  (error) => error.stderr.includes('Approval, review, and payout status can only be changed by the office'))

console.log('Performer recovery passed rollback, guards, atomicity, concurrent retry, identity/history and RLS checks.')
