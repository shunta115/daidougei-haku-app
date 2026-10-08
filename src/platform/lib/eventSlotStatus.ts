import type { EventSlotRow } from './api'

export function isActiveEventSlot(slot: Pick<EventSlotRow, 'status'>) {
  return slot.status !== 'cancelled'
}

// Public schedule notes are rendered as text by React, never as HTML.
export function eventSlotCancellation(slot: Pick<EventSlotRow, 'status' | 'note_ja' | 'note_en'>) {
  if (isActiveEventSlot(slot)) return null
  const reason = slot.note_ja?.trim() || slot.note_en?.trim()
  return reason ? `中止：${reason}` : '中止'
}
