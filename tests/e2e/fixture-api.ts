import type { Performer, PerformerAppearance } from '../../src/platform/lib/types'
export const performer = {
  id: '10000000-0000-4000-8000-000000000001', stage_name: 'Safari出演者', genre: 'Juggling',
  bio: '', country: 'JP', city: '東京', photo_url: null, support_blurb: '', stripe_account_id: null,
  stripe_onboarding_complete: false, is_approved: true, is_live: true, live_title: 'Fixture LIVE',
  live_started_at: new Date().toISOString(), stream_url: null, share_location: true,
  lat: 35.7, lng: 139.7, location_updated_at: new Date().toISOString(), created_at: '', updated_at: '',
} as Performer
const rows: PerformerAppearance[] = []
const storeKey = 'haku-e2e-appearances'
try { rows.push(...JSON.parse(localStorage.getItem(storeKey) || '[]')) } catch { /* empty fixture */ }
const save = () => localStorage.setItem(storeKey, JSON.stringify(rows))
const publicRow = (r: PerformerAppearance) => r.status === 'published' || (r.published_at && ['cancelled', 'postponed'].includes(r.status))
const normalize = (input: any) => ({ ...input,
  starts_at: new Date(`${input.performance_date}T${input.start_time}+09:00`).toISOString(),
  ends_at: input.end_time ? new Date(`${input.performance_date}T${input.end_time}+09:00`).toISOString() : null,
})
export async function listPerformerAppearances(_id: string, privateRows = false) { return structuredClone(rows.filter(r => privateRows || publicRow(r))) }
export async function listUpcomingPublishedAppearances() { return structuredClone(rows.filter(publicRow)) }
export async function createPerformerAppearance(id: string, input: any) {
  const row = normalize({ ...input, id: crypto.randomUUID(), performer_id: id,
    published_at: input.status === 'published' ? new Date().toISOString() : null })
  rows.push(row); save(); return row
}
export async function createPerformerAppearances(id: string, inputs: any[]) { return Promise.all(inputs.map(input => createPerformerAppearance(id, input))) }
export async function updatePerformerAppearance(id: string, input: any) {
  const index = rows.findIndex(r => r.id === id)
  rows[index] = normalize({ ...rows[index], ...input }); save(); return rows[index]
}
export async function deletePerformerAppearance() { throw new Error('deletion_disabled_in_e2e') }
export async function listApprovedPerformers() { return [performer] }
export async function listApprovedPerformersByIds() { return [performer] }
export async function getPerformer() { return performer }
export async function getFeaturedEvent() { return null }
export async function getSignedInUserId() { return null }
export async function listFollowedPerformers() { return [] }
export async function listLiveRanking() { return [] }
export async function listEventSlots() { return [] }
export async function listEventVenues() { return [] }
export function subscribePerformerMapUpdates() { return () => undefined }
export async function listSellerMerchProducts() { return [] }
export async function listPerformerEventSlots() { return [] }
export async function getPerformerProfileStats() { return { followers: 0, appearances: 0, supporters: 0, liveViews: 0 } }
export async function isFollowing() { return false }
export async function follow() { return undefined }
export async function unfollow() { return undefined }
