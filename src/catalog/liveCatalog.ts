import type { Performer as FestivalPerformer, ScheduleSlot, VenueArea } from '../festival/types'
import { isDemoMode } from '../festival/config/runtimeConfig'
import { PUBLIC_VENUES } from '../festival/data/public/venues'
import { SCHEDULE_SLOTS, VENUE_AREAS } from '../festival/data/scheduleData'
import { isSupabaseConfigured, supabase } from '../platform/lib/supabase'
import type { Performer as PlatformPerformer } from '../platform/lib/types'
import { getFeaturedEvent, type FeaturedEvent } from '../platform/lib/api'

const PARK_GRADIENT = 'linear-gradient(160deg, #061018 0%, #0e2a22 42%, #2bffdd 92%)'

let venues: VenueArea[] = [...PUBLIC_VENUES]
let slots: ScheduleSlot[] = []
let performers: FestivalPerformer[] = []
let eventDates: string[] = ['2026-10-10', '2026-10-11', '2026-10-12']
let featuredEvent: FeaturedEvent | null = null
let hydrated = false
let version = 0
const listeners = new Set<() => void>()

function notify() {
  version += 1
  listeners.forEach((fn) => fn())
}

export function subscribeLiveCatalog(fn: () => void) {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

export function getLiveCatalogVersion() {
  return version
}

export function getCatalogVenues(): VenueArea[] {
  return venues
}

export function getCatalogSlots(): ScheduleSlot[] {
  return slots
}

export function getCatalogPerformers(): FestivalPerformer[] {
  return performers
}

export function getCatalogEventDates(): string[] {
  return eventDates
}

export function getCatalogFeaturedEvent(): FeaturedEvent | null {
  return featuredEvent
}

export function isLiveCatalogHydrated() {
  return hydrated
}

export function platformToFestival(p: PlatformPerformer): FestivalPerformer {
  const place = [p.country, p.city].filter(Boolean).join(' · ')
  return {
    id: p.id,
    name: p.stage_name,
    nameJa: p.stage_name,
    act: p.genre || 'Performance',
    actJa: p.genre || 'パフォーマンス',
    tagline: p.support_blurb || p.bio.slice(0, 80),
    gradient: PARK_GRADIENT,
    locale: p.city || p.country || '',
    country: place || p.country || '',
    likes: 0,
    saves: 0,
    heat: p.is_live ? 99 : 40,
    approvalStatus: p.is_approved ? 'approved' : 'pending',
    canStream: Boolean(p.is_approved),
    isLive: Boolean(p.is_live),
    streamTitle: p.live_title ?? undefined,
    streamUrl: p.is_live ? `/live?watch=${encodeURIComponent(p.id)}` : undefined,
    supportUrl: '/live',
    photoUrl: p.photo_url ?? undefined,
    bio: p.bio,
    genre: p.genre,
    achievementsDetail: p.awards || undefined,
    introVideoUrl: p.video_url ?? undefined,
  }
}

function asDate(value: unknown): string {
  if (typeof value === 'string') return value.slice(0, 10)
  return String(value ?? '').slice(0, 10)
}

function datesBetween(start: string, end: string): string[] {
  const out: string[] = []
  const cur = new Date(`${start}T00:00:00+09:00`)
  const last = new Date(`${end}T00:00:00+09:00`)
  if (Number.isNaN(cur.getTime()) || Number.isNaN(last.getTime()) || cur > last) {
    return ['2026-10-10', '2026-10-11', '2026-10-12']
  }
  while (cur <= last) {
    const y = cur.getFullYear()
    const m = String(cur.getMonth() + 1).padStart(2, '0')
    const d = String(cur.getDate()).padStart(2, '0')
    out.push(`${y}-${m}-${d}`)
    cur.setDate(cur.getDate() + 1)
  }
  return out
}

export async function refreshLiveCatalog(): Promise<void> {
  if (isDemoMode) {
    venues = [...VENUE_AREAS]
    slots = [...SCHEDULE_SLOTS]
    performers = []
    eventDates = Array.from(new Set(slots.map((s) => s.date))).sort()
    featuredEvent = null
    hydrated = true
    notify()
    return
  }

  if (!isSupabaseConfigured || !supabase) {
    venues = [...PUBLIC_VENUES]
    slots = []
    performers = []
    eventDates = ['2026-10-10', '2026-10-11', '2026-10-12']
    featuredEvent = null
    hydrated = true
    notify()
    return
  }

  try {
    const ev = await getFeaturedEvent()
    featuredEvent = ev
    const eventId = ev?.id
    const [venueRes, slotRes, lineupRes, performerRes] = await Promise.all([
      eventId
        ? supabase.from('event_venues').select('*').eq('event_id', eventId).order('sort_order')
        : Promise.resolve({ data: [], error: null }),
      eventId
        ? supabase.from('event_slots').select('*').eq('event_id', eventId).order('date').order('start_time')
        : Promise.resolve({ data: [], error: null }),
      eventId
        ? supabase.from('event_lineup').select('performer_id').eq('event_id', eventId)
        : Promise.resolve({ data: [], error: null }),
      supabase.from('performers').select('*').eq('is_approved', true).order('is_live', { ascending: false }).limit(200),
    ])

    const venueRows = (venueRes.data ?? []) as Array<{
      id: string
      name_ja: string
      name_en: string
      blurb_ja: string
      blurb_en: string
      lat: number | null
      lng: number | null
    }>
    venues = venueRows.length
      ? venueRows.map((v) => ({
          id: v.id,
          nameJa: v.name_ja,
          nameEn: v.name_en,
          blurbJa: v.blurb_ja,
          blurbEn: v.blurb_en,
          gradient: PARK_GRADIENT,
          lat: v.lat ?? undefined,
          lng: v.lng ?? undefined,
        }))
      : [...PUBLIC_VENUES]

    const slotRows = (slotRes.data ?? []) as Array<{
      id: string
      date: string
      start_time: string
      end_time: string
      performer_id: string | null
      venue_id: string
      stage_ja: string
      stage_en: string
      status: string
      note_ja: string
      note_en: string
      is_stream?: boolean
    }>
    slots = slotRows
      .filter((s) => s.performer_id)
      .map((s) => ({
        id: s.id,
        date: asDate(s.date),
        start: String(s.start_time).slice(0, 5),
        end: String(s.end_time).slice(0, 5),
        performerId: s.performer_id as string,
        venueId: s.venue_id,
        stageJa: s.stage_ja,
        stageEn: s.stage_en,
        status: (s.status as ScheduleSlot['status']) || 'scheduled',
        noteJa: s.note_ja || undefined,
        noteEn: s.note_en || undefined,
        isStream: Boolean(s.is_stream),
      }))

    const allPlatform = (performerRes.data ?? []) as PlatformPerformer[]
    const lineupIds = new Set(((lineupRes.data ?? []) as Array<{ performer_id: string }>).map((r) => r.performer_id))
    const mapped = allPlatform.map(platformToFestival)
    // Lineup is the announced roster. If admin has not filled it yet, still show real approved performers.
    performers = lineupIds.size > 0 ? mapped.filter((p) => lineupIds.has(p.id)) : mapped

    const fromSlots = Array.from(new Set(slots.map((s) => s.date))).sort()
    if (fromSlots.length > 0) {
      eventDates = fromSlots
    } else if (ev?.starts_on && ev?.ends_on) {
      eventDates = datesBetween(asDate(ev.starts_on), asDate(ev.ends_on))
    } else {
      eventDates = ['2026-10-10', '2026-10-11', '2026-10-12']
    }
  } catch {
    venues = [...PUBLIC_VENUES]
    slots = []
    performers = []
    eventDates = ['2026-10-10', '2026-10-11', '2026-10-12']
    featuredEvent = null
  }
  hydrated = true
  notify()
}
