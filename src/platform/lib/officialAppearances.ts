import type { EventGuestAppearanceRow } from './api'
import type { Performer } from './types'

export function officialAppearanceCategory(type: EventGuestAppearanceRow['appearance_type']) {
  if (type === 'roving') return '回遊パフォーマー'
  if (type === 'statue') return 'スタチューパフォーマー'
  return 'Statue Carnival / 回遊'
}

export function resolveLinkedGuestPerformer(
  row: Pick<EventGuestAppearanceRow, 'linked_performer_id'>,
  byId: Map<string, Performer>,
): Performer | null {
  if (!row.linked_performer_id) return null
  return byId.get(row.linked_performer_id) ?? null
}

export function performerPlace(performer: Pick<Performer, 'city' | 'country'>) {
  return [performer.city, performer.country].map((value) => value.trim()).filter(Boolean).join(' / ')
}
