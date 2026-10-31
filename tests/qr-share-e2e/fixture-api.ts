import type { Performer, PerformerAppearance } from '../../src/platform/lib/types'
export const performer = { id: '10000000-0000-4000-8000-000000000001', stage_name: 'Safari出演者', genre: 'Juggling', bio: '', country: 'JP', city: '東京', photo_url: null, support_blurb: '', stripe_account_id: null, stripe_onboarding_complete: false, is_approved: true, is_live: false, live_started_at: null, live_title: null, stream_url: null, share_location: false, lat: null, lng: null, location_updated_at: null, created_at: '', updated_at: '' } as Performer
export const appearance = { id: '20000000-0000-4000-8000-000000000001', performer_id: performer.id, title: '共有確認ステージ', performance_date: '2026-11-01', start_time: '10:00:00', end_time: '11:00:00', timezone: 'Asia/Tokyo', starts_at: '2026-11-01T01:00:00Z', ends_at: '2026-11-01T02:00:00Z', venue_name: '公開テスト会場', venue_address: '東京', region: '東京', country: 'JP', description: '', admission_type: 'free', admission_details: '', image_url: null, ticket_url: null, is_live_planned: false, rain_policy: '', organizer_info: '', notes: '', status: 'published', published_at: '2026-10-31T00:00:00Z', cancelled_at: null, created_at: '', updated_at: '' } as PerformerAppearance
export async function listUpcomingPublishedAppearances() { return [appearance] }
export async function listPerformerAppearances() { return [appearance] }
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
