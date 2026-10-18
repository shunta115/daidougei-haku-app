import { describe, expect, it } from 'vitest'
import { officialAppearanceCategory, performerPlace, resolveLinkedGuestPerformer } from '../src/platform/lib/officialAppearances'
import type { Performer } from '../src/platform/lib/types'

const piro = {
  id: 'piro-id',
  stage_name: 'Piro',
  genre: 'パントマイム',
  city: '東京',
  country: '日本',
  photo_url: 'https://cdn.example.test/piro.jpg',
} as Performer

describe('AWP statue/roving guest cards', () => {
  it('resolves only an exact linked performer id, not a name guess', () => {
    const byId = new Map([[piro.id, piro]])
    expect(resolveLinkedGuestPerformer({ linked_performer_id: 'piro-id' }, byId)?.stage_name).toBe('Piro')
    expect(resolveLinkedGuestPerformer({ linked_performer_id: null }, byId)).toBeNull()
    expect(resolveLinkedGuestPerformer({ linked_performer_id: 'someone-else' }, byId)).toBeNull()
  })

  it('keeps the official appearance category separate from the HAKU genre', () => {
    expect(officialAppearanceCategory('statue_roving')).toBe('Statue Carnival / 回遊')
    expect(officialAppearanceCategory('statue_roving')).not.toBe(piro.genre)
    expect(performerPlace(piro)).toBe('東京 / 日本')
    expect(piro.genre).toBe('パントマイム')
  })
})
