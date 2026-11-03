import { describe, expect, it } from 'vitest'
import { homeDiscovery } from '../src/platform/lib/homeDiscovery'
import type { Performer, LiveSchedule, PerformerAppearance } from '../src/platform/lib/types'
const now = Date.parse('2026-10-31T03:00:00Z')
const p = (id: string, extra = {}) => ({id, stage_name:id,is_approved:true,is_live:false,created_at:'2026-01-01', ...extra}) as Performer
const schedule = (id: string, extra = {}) => ({ id, performer_id:id, status:'scheduled',scheduled_start_at:new Date(now+60000).toISOString(),...extra }) as LiveSchedule
const feed = (people: Performer[], live: Performer[] = [], schedules: LiveSchedule[] = [], appearances: PerformerAppearance[] = [], sessions: Parameters<typeof homeDiscovery>[4] = []) => homeDiscovery(people,live,schedules,appearances,sessions,now)
describe('home discovery evidence and fairness', () => {
  it('requires both live flag and open session, never a YouTube setting or elapsed start', () => {
    const people = [p('live',{is_live:true}),p('configured',{youtube_live_enabled:true}),p('stale',{is_live:true})]
    const result = feed(people,people,[schedule('configured',{scheduled_start_at:new Date(now-60000).toISOString()})],[],[{performer_id:'live',started_at:new Date(now-60000).toISOString(),ended_at:null}])
    expect(result.live.map(p=>p.id)).toEqual(['live'])
    expect(result.upcoming.map(s=>s.id)).toEqual(['configured'])
  })
  it('fails closed for expired heartbeat and private test discovery', () => {
    const people = [p('stale',{is_live:true}),p('hidden',{is_live:true,stage_name:'Test Performer'})]
    const sessions = people.map(p=>({performer_id:p.id,started_at:new Date(now-600000).toISOString(),heartbeat_at:new Date(now-180000).toISOString(),ended_at:null}))
    expect(feed(people,people,[],[],sessions).live).toHaveLength(0)
    expect(feed(people).everyone.map(p=>p.id)).toEqual(['stale'])
  })
  it('excludes cancelled, invalid, old, unapproved and unknown schedules and sorts nearest first', () => {
    const result = feed([p('a'),p('b'),p('c',{is_approved:false})],[],[schedule('a',{scheduled_start_at:new Date(now+120000).toISOString()}),schedule('b'),schedule('c'),schedule('missing'),schedule('a',{id:'cancelled',status:'cancelled'}),schedule('a',{id:'invalid',scheduled_start_at:'invalid'}),schedule('a',{id:'old',scheduled_start_at:'2020-01-01'})])
    expect(result.upcoming.map(s=>s.id)).toEqual(['b','a'])
  })
  it('does not infer profile updates from generic updated_at or treat cancelled appearances as activity', () => {
    const result = feed([p('idle',{updated_at:new Date(now).toISOString()}),p('planned'),p('cancelled'),p('returning')],[],[],[{performer_id:'planned',status:'published',starts_at:new Date(now+60000).toISOString()},{performer_id:'cancelled',status:'cancelled',starts_at:new Date(now+60000).toISOString()}] as PerformerAppearance[],[{performer_id:'returning',started_at:new Date(now-100000).toISOString(),ended_at:new Date(now-50000).toISOString()}])
    expect(new Set(result.active.map(p=>p.id))).toEqual(new Set(['planned','returning']))
    expect(result.reason(p('idle'))).toBe('')
  })
  it('dedicates exposure to newcomers and rotates without popularity', () => {
    const people = [p('a',{created_at:new Date(now-10000).toISOString()}),p('b'),p('c')]
    const today = feed(people)
    const tomorrow = homeDiscovery(people,[],[],[],[],now+86400000)
    expect(today.newcomers.map(p=>p.id)).toEqual(['a'])
    expect(today.everyone[0].id).not.toBe(tomorrow.everyone[0].id)
    expect(new Set(today.everyone.map(p=>p.id))).toEqual(new Set(['a','b','c']))
  })
  it('switches started schedule to watch only when live evidence arrives', () => {
    const person = p('a',{is_live:true})
    const result = feed([person],[person],[schedule('a')],[],[{performer_id:'a',started_at:new Date(now).toISOString(),ended_at:null}])
    expect(result.live).toHaveLength(1); expect(result.upcoming).toHaveLength(0)
  })
})
