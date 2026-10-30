import { describe, expect, it } from 'vitest'
import { appearanceLandingUrl, appearanceShareLinks, appearanceShareText } from '../src/platform/lib/appearanceShare'
import type { PerformerAppearance } from '../src/platform/lib/types'

const appearance = { id: 'appearance id', title: 'Night Show', performance_date: '2026-11-01', start_time: '18:30:00', venue_name: 'Central Park' } as PerformerAppearance

describe('appearance social share', () => {
  it('lands on the public profile and exact appearance', () => {
    const url = appearanceLandingUrl('https://haku.example', 'performer id', appearance.id)
    expect(url).toBe('https://haku.example/?profile=performer+id&schedule=appearance+id')
  })

  it('builds official LINE and X web intents and a useful localized payload', () => {
    const text = appearanceShareText('Alice', appearance)
    const links = appearanceShareLinks('https://haku.example/show', text)
    expect(text).toContain('Alice｜Night Show')
    expect(links.line).toMatch(/^https:\/\/social-plugins\.line\.me\/lineit\/share\?url=/)
    expect(links.x).toMatch(/^https:\/\/twitter\.com\/intent\/tweet\?text=/)
  })
})
