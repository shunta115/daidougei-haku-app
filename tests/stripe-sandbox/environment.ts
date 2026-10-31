import { readFileSync } from 'node:fs'
export const TEST_REF = 'aeqskxxykzapgaudbeqa'
export function loadTestEnvironment() {
  const values = JSON.parse(readFileSync(process.env.HAKU_SANDBOX_ENV_FILE || '/private/tmp/haku-pr112-env.json', 'utf8'))
  for (const [key,value] of Object.entries(values)) process.env[key] = String(value)
  for (const name of ['SUPABASE_URL','VITE_SUPABASE_URL']) {
    if (new URL(process.env[name] || '').hostname !== `${TEST_REF}.supabase.co`) throw new Error('isolated_test_database_required')
  }
  if (!/^(sk|rk|rkcs)_test_/.test(process.env.STRIPE_SECRET_KEY || '')) throw new Error('isolated_stripe_test_key_required')
  if (process.env.STRIPE_ALLOW_LIVE !== 'false' || process.env.ENABLE_LIVE_PERFORMER_TRANSFERS !== 'false') throw new Error('live_operations_must_be_disabled')
  const payload = JSON.parse(Buffer.from((process.env.SUPABASE_SERVICE_ROLE_KEY || '').split('.')[1], 'base64url').toString())
  if (payload.ref !== TEST_REF || payload.role !== 'service_role') throw new Error('test_service_role_required')
}
