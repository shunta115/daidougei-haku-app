import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (path: string) => readFileSync(path, 'utf8')

describe('P0 migration safety', () => {
  it('restricts public signup without rewriting existing users or roles', () => {
    const sql = read('supabase/migrations/20260921_restrict_public_signup_roles.sql')
    expect(sql).toMatch(/begin;/i)
    expect(sql).toMatch(/commit;/i)
    expect(sql).toMatch(/chosen_role not in \('fan', 'performer'\)/i)
    expect(sql).not.toMatch(/update\s+public\.profiles/i)
    expect(sql).not.toMatch(/delete\s+from|truncate|drop\s+table/i)
  })

  it('keeps product event names in sync with the client and rolls back on validation failure', () => {
    const sql = read('supabase/migrations/20260910_product_event_kpis.sql')
    const source = read('src/platform/lib/track.ts')
    const union = source.slice(source.indexOf('export type ProductEventName'), source.indexOf('const SID_KEY'))
    const clientNames = [...union.matchAll(/'([^']+)'/g)].map((match) => match[1]).sort()
    const migrationNames = [...sql.matchAll(/^\s*'([^']+)'/gm)].map((match) => match[1]).sort()
    expect(migrationNames).toEqual(clientNames)
    expect(sql).toMatch(/not valid/i)
    expect(sql).toMatch(/validate constraint product_events_name_check/i)
    expect(sql).not.toMatch(/delete\s+from|truncate|drop\s+table/i)
  })

  it('keeps event schema additions non-destructive and seed previews rollback-only', () => {
    const migration = read('supabase/migrations/20260921_event_schedule_types.sql')
    const seed = read('supabase/seed_202610_event_template.sql')
    const finalists = read('supabase/assign_202610_finalists_template.sql')
    expect(migration).not.toMatch(/delete\s+from|truncate|drop\s+table/i)
    expect(migration).toContain("'special_final'")
    expect(migration).toContain('event_slot_id')
    expect(seed.trimEnd().endsWith('rollback;')).toBe(true)
    expect(finalists.trimEnd().endsWith('rollback;')).toBe(true)
    expect(seed).toMatch(/count\(s\.\*\) <> 3/i)
    expect(seed).toContain("'16:00'")
    expect(seed).toContain("'17:00'")
  })

  it('prevents public clients from self-assigning office, approval, or payout state', () => {
    const sql = read('supabase/migrations/20260924_protect_privileged_profile_fields.sql')
    expect(sql).toMatch(/new\.role is distinct from old\.role/i)
    expect(sql).toMatch(/new\.status is distinct from old\.status/i)
    expect(sql).toMatch(/new\.is_approved is distinct from old\.is_approved/i)
    expect(sql).toMatch(/new\.stripe_account_id is distinct from old\.stripe_account_id/i)
    expect(sql).toMatch(/stripe_onboarding_complete = false/i)
    expect(sql).not.toMatch(/delete\s+from|truncate|drop\s+table/i)
  })

  it('adds secure event voting without destructive data operations', () => {
    const sql = read('supabase/migrations/20260925_event_experience_and_secure_voting.sql')
    expect(sql).toMatch(/create table if not exists public\.event_ballots/i)
    expect(sql).toMatch(/create or replace function public\.cast_event_vote/i)
    expect(sql).toMatch(/pg_advisory_xact_lock/i)
    expect(sql).toMatch(/used_votes >= rule\.votes_per_user_per_day/i)
    expect(sql).toMatch(/role = 'fan' and status = 'active'/i)
    expect(sql).toMatch(/results_published_at <= now\(\) or public\.is_admin\(\)/i)
    expect(sql).toMatch(/status in \('published', 'archived'\)/i)
    expect(sql).toMatch(/revoke insert, delete on public\.event_votes from authenticated/i)
    expect(sql).not.toMatch(/delete\s+from|truncate|drop\s+table/i)
  })

  it('adds LIVE heartbeat tracking without destructive schema operations', () => {
    const sql = read('supabase/migrations/20260926_live_presence_heartbeat.sql')
    const presence = read('api/livekit/presence.ts')
    expect(sql).toMatch(/add column if not exists heartbeat_at timestamptz/i)
    expect(sql).toMatch(/add column if not exists ended_reason text/i)
    expect(sql).not.toMatch(/delete\s+from|truncate|drop\s+table/i)
    expect(presence).toMatch(/STALE_SECONDS = 90/)
    expect(presence).toMatch(/heartbeat_timeout/)
    expect(presence).toMatch(/requireAdmin/)
    expect(presence).toMatch(/admin_forced/)
  })

  it('keeps guest tips server-priced and preserves Direct Charges', () => {
    const tip = read('api/stripe/tip.ts')
    const screen = read('src/platform/screens/TipScreen.tsx')
    expect(tip).toMatch(/getOptionalAuthUser/)
    expect(tip).toMatch(/fan_id: payerId/)
    expect(tip).toMatch(/application_fee_amount: fee/)
    expect(tip).toMatch(/stripeAccount: connectedAccountId/)
    expect(screen).toMatch(/登録なしでStripeの安全な決済へ進めます/)
    expect(screen).not.toMatch(/if \(!user\) \{\s*window\.sessionStorage\.setItem\('pl-tip-to'/)
  })

  it('keeps MAP in the fan bottom navigation and search in HOME', () => {
    const nav = read('src/platform/components/BottomNav.tsx')
    const app = read('src/platform/PlatformApp.tsx')
    const fanNav = nav.slice(nav.lastIndexOf(': ['))
    expect(nav).toMatch(/key: 'map-schedule'.*MapPinned/)
    expect(fanNav).not.toMatch(/key: 'search', label: labels\.discover, icon: Search/)
    expect(app).toMatch(/onOpenSearch=\{\(\) => setScreen\('search'\)\}/)
  })
})
