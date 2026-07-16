import type { Performer, ScheduleSlot, VenueArea } from '../../types'
import { PUBLIC_PERFORMERS } from './performers'
import { PUBLIC_SCHEDULE_SLOTS, PUBLIC_SPOTLIGHT_IDS, PUBLIC_TODAYS_PICK_IDS } from './schedule'
import { PUBLIC_VENUES } from './venues'
import { PUBLIC_EVENT_META } from './eventMeta'

export type PublicDataIssues = {
  errors: string[]
  warnings: string[]
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const TIME_RE = /^\d{2}:\d{2}$/

export function validatePublicFestivalData(input?: {
  performers?: Performer[]
  venues?: VenueArea[]
  slots?: ScheduleSlot[]
}): PublicDataIssues {
  const performers = input?.performers ?? PUBLIC_PERFORMERS
  const venues = input?.venues ?? PUBLIC_VENUES
  const slots = input?.slots ?? PUBLIC_SCHEDULE_SLOTS
  const errors: string[] = []
  const warnings: string[] = []

  const performerIds = new Set<string>()
  for (const p of performers) {
    if (!p.id) errors.push('出演者 id が空です')
    if (performerIds.has(p.id)) errors.push(`出演者 id 重複: ${p.id}`)
    performerIds.add(p.id)
    if (p.isLive && !p.streamUrl) {
      warnings.push(`LIVE指定だが streamUrl なし: ${p.id}`)
    }
    if (p.streamUrl && !/^https?:\/\//i.test(p.streamUrl)) {
      errors.push(`不正な streamUrl: ${p.id}`)
    }
  }

  const venueIds = new Set<string>()
  for (const v of venues) {
    if (!v.id) errors.push('会場 id が空です')
    if (venueIds.has(v.id)) errors.push(`会場 id 重複: ${v.id}`)
    venueIds.add(v.id)
  }

  const slotIds = new Set<string>()
  for (const s of slots) {
    if (!s.id) errors.push('公演 id が空です')
    if (slotIds.has(s.id)) errors.push(`公演 id 重複: ${s.id}`)
    slotIds.add(s.id)
    if (!DATE_RE.test(s.date)) errors.push(`不正な date: ${s.id} (${s.date})`)
    if (!TIME_RE.test(s.start) || !TIME_RE.test(s.end)) errors.push(`不正な時刻: ${s.id}`)
    if (!performerIds.has(s.performerId)) errors.push(`未知の performerId: ${s.id} → ${s.performerId}`)
    if (!venueIds.has(s.venueId)) errors.push(`未知の venueId: ${s.id} → ${s.venueId}`)
  }

  for (const id of PUBLIC_TODAYS_PICK_IDS) {
    if (!performerIds.has(id)) warnings.push(`todaysPick 未知 id: ${id}`)
  }
  for (const id of PUBLIC_SPOTLIGHT_IDS) {
    if (!performerIds.has(id)) warnings.push(`spotlight 未知 id: ${id}`)
  }

  if (!PUBLIC_EVENT_META.dateLabel) {
    warnings.push('開催日ラベル未設定（準備中表示になります）')
  }

  return { errors, warnings }
}

/** 開発時のみコンソール警告（本番では出さない） */
export function warnPublicDataIssuesInDev() {
  if (!import.meta.env.DEV) return
  const { errors, warnings } = validatePublicFestivalData()
  if (errors.length) console.warn('[public-data] errors', errors)
  if (warnings.length) console.warn('[public-data] warnings', warnings)
}
