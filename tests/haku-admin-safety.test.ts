import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (path: string) => readFileSync(path, 'utf8')

describe('HAKU admin and public performer safety', () => {
  it('keeps stripe account ids off the browser performer select list', () => {
    const columns = read('src/platform/lib/performerColumns.ts')
    const api = read('src/platform/lib/api.ts')
    expect(columns).not.toMatch(/'stripe_account_id'/)
    expect(api).toMatch(/PERFORMER_CLIENT_SELECT/)
    expect(api).not.toMatch(/from\('performers'\)[\s\S]{0,80}\.select\('\*'\)/)
  })

  it('serves HAKU ADMIN through requireAdmin and does not expose service role to the client', () => {
    const admin = read('api/ops/_hakuAdmin.ts')
    const guard = read('api/ops/_guard.ts')
    const supabase = read('src/platform/lib/supabase.ts')
    expect(admin).toMatch(/requireAdmin/)
    expect(admin).toMatch(/admin_audit/)
    expect(guard).toMatch(/HAKU_ADMIN_IDENTIFIERS/)
    expect(guard).toMatch(/admin allowlist is not configured/)
    expect(supabase).toMatch(/ANON_KEY/)
    expect(supabase).not.toMatch(/SERVICE_ROLE/)
  })

  it('adds review workflow without destructive schema changes and protects review fields', () => {
    const sql = read('supabase/migrations/20261003_admin_review_workflow.sql')
    expect(sql).toMatch(/add column if not exists review_status/i)
    expect(sql).toMatch(/new\.review_status is distinct from old\.review_status/i)
    expect(sql).toMatch(/admin_audit_admin_only/i)
    expect(sql).not.toMatch(/delete\s+from|truncate|drop\s+table/i)
  })

  it('keeps admin preview read-only and approval decisions server-side', () => {
    const app = read('src/platform/PlatformApp.tsx')
    const admin = read('api/ops/_hakuAdmin.ts')
    expect(app).toMatch(/pl-preview-readonly/)
    expect(app).toMatch(/onClickCapture/)
    expect(admin).toMatch(/action === 'reject'/)
    expect(admin).toMatch(/review_status: 'approved'/)
  })

  it('sets 15% tip and 8% goods system-use fees without rewriting payment rows', () => {
    const sql = read('supabase/migrations/20261003_haku_security_fees_admin.sql')
    expect(sql).toMatch(/tip_fee_bps', '1500'/)
    expect(sql).toMatch(/merch_fee_bps', '800'/)
    expect(sql).not.toMatch(/update\s+public\.tips/i)
    expect(sql).not.toMatch(/update\s+public\.merch_orders/i)
    expect(sql).not.toMatch(/delete\s+from|truncate|drop\s+table/i)
    expect(sql).toMatch(/grant select \(/i)
    expect(sql).toMatch(/chosen_role not in \('fan', 'performer'\)/)
  })
})
