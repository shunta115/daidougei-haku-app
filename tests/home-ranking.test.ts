import { describe, it, expect } from 'vitest'
import { rankHome, slotTimestamp, type RankingCandidate, type HomeAppearance } from '../shared/homeRanking'
import { appearanceLabel } from '../src/platform/lib/homeRanking'
const now = Date.parse('2026-10-31T03:00:00Z')
const p = (id: string, extra: Partial<RankingCandidate> = {}): RankingCandidate => ({ id, stage_name: id, is_approved: true, is_private_test: false, stripe_onboarding_complete: false, ...extra })
const a = (id: string, start: string, end: string | null = null): HomeAppearance => ({ performerId: id, startsAt: start, endsAt: end, title: '公開予定' })
describe('home priority', () => {
  it('uses the newest actor/login evidence before Stripe and completeness; never generic updated_at', () => {
    const result = rankHome([p('paid', { stripe_onboarding_complete: true }), p('login', { lastSignIn: '2026-10-30T00:00:00Z' }), p('actor', { lastAction: '2026-10-31T00:00:00Z' })], [], now)
    expect(result.featured).toEqual(['actor', 'login', 'paid'])
  })
  it('breaks ties with onboarding, completion, then stable ID; no view/login counts', () => {
    expect(rankHome([p('blank'), p('complete', { bio: '紹介' }), p('paid', { stripe_onboarding_complete: true })], [], now).featured).toEqual(['paid', 'complete', 'blank'])
  })
  it('fails closed for unapproved/private/missing visibility/test and deduplicates', () => {
    expect(rankHome([p('ok'),p('ok'),p('pending',{is_approved:false}),p('private',{is_private_test:true}),p('old',{is_private_test:undefined}),p('test',{stage_name:'Test Performer'})],[],now).ids).toEqual(['ok'])
  })
  it('prioritizes ongoing, then chronological published inputs; no synthetic dates', () => {
    const result = rankHome([p('today'),p('tomorrow'),p('current'),p('none')],[a('tomorrow','2026-11-01T03:00:00Z'),a('today','2026-10-31T05:00:00Z'),a('current','2026-10-31T02:00:00Z','2026-10-31T04:00:00Z'),a('today','2026-11-02T03:00:00Z')],now)
    expect(result.upcoming.map(x=>x.performerId)).toEqual(['current','today','tomorrow'])
    expect(result.upcoming.some(x=>x.performerId==='none')).toBe(false)
  })
  it('excludes ended/invalid/past with unknown end and nonpublic actors', () => {
    expect(rankHome([p('a')],[a('a','bad'),a('a','2026-10-31T01:00:00Z'),a('a','2026-10-31T01:00:00Z','2026-10-31T02:00:00Z'),a('private','2026-11-01T03:00:00Z')],now).upcoming).toEqual([])
  })
  it('ignores invalid or future activity evidence', () => {
    expect(rankHome([p('future',{lastAction:'2099-01-01'}),p('real',{lastSignIn:'2026-10-30'})],[],now).featured).toEqual(['real','future'])
  })
  it('keeps more than 100 eligible performers and fills discovery without duplicate featured cards', () => {
    const result=rankHome(Array.from({length:120},(_,i)=>p(String(i).padStart(3,'0'))),[],now)
    expect(result.ids).toHaveLength(120)
    expect(result.recent).toHaveLength(8)
    expect(result.recent.some(id=>result.featured.includes(id))).toBe(false)
  })
  it('keeps unscheduled fallback in activity, Stripe, completeness order without synthetic dates', () => {
    const result = rankHome([p('blank'),p('filled',{bio:'bio'}),p('paid',{stripe_onboarding_complete:true}),p('new',{lastAction:'2026-10-31T00:00:00Z'}),p('scheduled')],[a('scheduled','2026-11-01T03:00:00Z')],now)
    expect(result.unscheduled).toEqual(['new','paid','filled','blank'])
    expect(result.upcoming.map(x=>x.performerId)).toEqual(['scheduled'])
  })
  it('returns no private evidence in the public payload', () => {
    const result=JSON.stringify(rankHome([p('a',{lastSignIn:'2026-10-30',lastAction:'2026-10-31'})],[],now))
    expect(result).not.toMatch(/lastSignIn|lastAction|2026|stripe|bio/)
  })
  it('parses Japan event slots without Safari date ambiguity', () => {
    expect(slotTimestamp('2026-10-31','12:30')).toBe('2026-10-31T12:30:00+09:00')
    expect(slotTimestamp('2026-10-31','25:00')).toBeNull()
  })
  it('labels real windows with JST day/week transitions', () => {
    expect(appearanceLabel(a('a','2026-10-31T02:00:00Z','2026-10-31T04:00:00Z'),now)).toBe('出演中')
    expect(appearanceLabel(a('a','2026-10-31T05:00:00Z'),now)).toMatch(/^本日/)
    expect(appearanceLabel(a('a','2026-11-01T05:00:00Z'),now)).toMatch(/^明日/)
    expect(appearanceLabel(a('a','2026-11-02T05:00:00Z'),now)).not.toMatch(/^今週/)
  })
})
