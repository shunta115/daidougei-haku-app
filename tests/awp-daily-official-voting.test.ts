import { describe, expect, it } from 'vitest'
import fs from 'node:fs'

const sql = fs.readFileSync('supabase/migrations/20261010_awp_daily_official_voting.sql', 'utf8')
const api = fs.readFileSync('api/votes/device.ts', 'utf8')

describe('AWP daily official voting safety contract', () => {
  it('configures each JST day at 10:00–16:20 without deleting ballots', () => {
    for (const day of ['10', '11', '12']) {
      expect(sql).toContain(`'2026-10-${day} 10:00:00+09'`)
      expect(sql).toContain(`'2026-10-${day} 16:20:00+09'`)
    }
    expect(sql).toContain("if now() < day_rule.starts_at then raise exception 'voting_not_started'")
    expect(sql).toContain("if now() >= day_rule.ends_at then raise exception 'voting_ended'")
    expect(sql).not.toMatch(/delete\s+from\s+public\.event_device_ballots/i)
    expect(sql).not.toMatch(/truncate/i)
  })

  it('enforces three daily votes, one daily vote per performer, and daily isolation in DB', () => {
    expect(sql).toContain('event_device_ballots_daily_performer_unique')
    expect(sql).toContain('(event_id, vote_date, device_hash, performer_id)')
    expect(sql).toContain('vote_date = vote_day and device_hash = p_device_hash')
    expect(sql).toContain('used_votes >= rule.votes_per_device')
    expect(sql).toContain("already_voted_for_performer_today")
    expect(sql).toContain("s.performance_type = 'regular'")
    expect(sql).toContain("not in ('cancelled','canceled')")
  })

  it('does not expose an in-progress ranking and does not invent a tie-break', () => {
    expect(sql).toContain("d.result_status in ('final','tie')")
    expect(sql).toContain("e.slug <> 'award-winning-performers-2026'")
    expect(sql).toContain("top_three_tie_requires_admin")
    expect(sql).toContain("assignment_status='manual_required'")
    expect(sql).toContain('rank() over(order by x.votes desc)')
    expect(sql).not.toContain('row_number() over (order by count(*) desc')
    expect(api).toContain('if (!state.results_public)')
    expect(api).toContain('ranking: []')
  })

  it('uses server-side daily state and prevents cross-day browser ballot restoration', () => {
    expect(api).toContain("rpc('get_event_vote_day_state'")
    expect(api).toContain(".eq('vote_date', voteDate)")
    expect(api).toContain('eligible_performer_ids')
    expect(api).toContain("rpc('finalize_event_vote_day'")
  })

  it('only assigns empty same-day SPECIAL STAGE slots after an unambiguous top three', () => {
    expect(sql).toContain("date=p_vote_date and performance_type='special_final'")
    expect(sql).toContain('assigned_slot_count <> 0')
    expect(sql).toContain("s.ranking_position=r.ranking_position")
    expect(sql).toContain("r.ranking_position between 1 and 3")
  })
})
