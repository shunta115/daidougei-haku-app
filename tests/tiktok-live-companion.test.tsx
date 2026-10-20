// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { parseTikTokLiveEntry } from '../src/platform/lib/tiktokLive'

const mocks = vi.hoisted(() => ({ getPerformer: vi.fn(), track: vi.fn() }))
vi.mock('../src/platform/lib/api', () => ({ getPerformer: mocks.getPerformer }))
vi.mock('../src/platform/lib/track', () => ({ trackProductEvent: mocks.track }))

import { TikTokLiveCompanionScreen } from '../src/platform/screens/TikTokLiveCompanionScreen'

afterEach(() => { cleanup(); vi.clearAllMocks() })

describe('TikTok LIVE companion', () => {
  it('creates only a canonical TikTok LIVE URL from a safe handle', () => {
    expect(parseTikTokLiveEntry('?tiktokLive=%40quest_tcg&performerId=p1')).toEqual({
      handle: 'quest_tcg', performerId: 'p1', url: 'https://www.tiktok.com/@quest_tcg/live',
    })
    expect(parseTikTokLiveEntry('?tiktokLive=https://evil.example')).toBeNull()
    expect(parseTikTokLiveEntry('?tiktokLive=bad%2F..')).toBeNull()
  })

  it('opens official TikTok without an iframe and exposes HAKU tip for an approved performer', async () => {
    mocks.getPerformer.mockResolvedValue({ id: 'p1', stage_name: 'Quest', is_approved: true })
    const onTip = vi.fn()
    const view = render(<TikTokLiveCompanionScreen handle="quest_tcg" performerId="p1" liveUrl="https://www.tiktok.com/@quest_tcg/live" onBack={() => undefined} onTip={onTip} />)
    const link = await screen.findByRole('link', { name: /(?:TikTok LIVEを開く|Open TikTok LIVE)/ })
    expect(link.getAttribute('href')).toBe('https://www.tiktok.com/@quest_tcg/live')
    expect(link.getAttribute('rel')).toContain('noopener')
    expect(view.container.querySelector('iframe')).toBeNull()
    fireEvent.click(await screen.findByRole('button', { name: /(?:HAKUで投げ銭する|Tip on HAKU)/ }))
    expect(onTip).toHaveBeenCalledOnce()
  })

  it('does not offer a tip destination when the performer is absent or unapproved', async () => {
    mocks.getPerformer.mockResolvedValue({ id: 'p1', stage_name: 'Quest', is_approved: false })
    render(<TikTokLiveCompanionScreen handle="quest_tcg" performerId="p1" liveUrl="https://www.tiktok.com/@quest_tcg/live" onBack={() => undefined} onTip={() => undefined} />)
    await waitFor(() => expect(mocks.getPerformer).toHaveBeenCalledWith('p1'))
    expect(screen.queryByRole('button', { name: /(?:HAKUで投げ銭する|Tip on HAKU)/ })).toBeNull()
    expect(screen.getByRole('status').textContent).toMatch(/(?:未接続|not linked)/)
  })
})

