// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { YouTubeLiveSetup } from '../src/platform/components/YouTubeLiveSetup'
import { ConnectedLiveWatchScreen } from '../src/platform/screens/ConnectedLiveWatchScreen'
import type { Performer } from '../src/platform/lib/types'

const api = vi.hoisted(() => ({ updatePerformer: vi.fn(), getPerformer: vi.fn(), getSignedInUserId: vi.fn().mockResolvedValue(null), isFollowing: vi.fn().mockResolvedValue(false), follow: vi.fn(), unfollow: vi.fn(), subscribePerformerLive: () => () => undefined }))
vi.mock('../src/platform/lib/api', () => api)
vi.mock('../src/platform/lib/track', () => ({ trackProductEvent: vi.fn() }))
vi.mock('../src/platform/components/YouTubeLivePlayer', () => ({
  YouTubeLivePlayer: ({ videoId }: { videoId: string }) => <div data-testid="youtube-preview">preview:{videoId}</div>,
}))
vi.mock('../src/platform/screens/LiveWatchScreen', () => ({
  LiveWatchScreen: () => <div data-testid="direct-live">HAKU DIRECT</div>,
}))

const performer: Performer = {
  id: 'performer-1', stage_name: 'テスト演者', bio: '', genre: '', country: '日本', city: '', photo_url: null,
  support_blurb: '', stripe_account_id: null, stripe_onboarding_complete: true, is_approved: true, is_live: false,
  live_started_at: null, live_title: null, stream_url: null, share_location: false, lat: null, lng: null,
  location_updated_at: null, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
  youtube_live_video_id: null, youtube_live_url: null, youtube_live_enabled: false,
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('YouTube LIVE simple registration UI', () => {
  beforeEach(() => { vi.clearAllMocks(); api.updatePerformer.mockResolvedValue(undefined); api.getPerformer.mockResolvedValue(performer) })

  it('extracts the video ID, previews it, and publishes the canonical URL', async () => {
    const onSaved = vi.fn().mockResolvedValue(undefined)
    render(<YouTubeLiveSetup performer={performer} onBack={vi.fn()} onChooseDirect={vi.fn()} onPreview={vi.fn()} onSaved={onSaved} />)
    fireEvent.change(screen.getByLabelText('YouTube LIVEのURL'), { target: { value: 'https://youtu.be/abcdefghijk?feature=share' } })
    expect(screen.getByText(/動画IDを確認しました：abcdefghijk/)).toBeTruthy()
    expect(screen.getByTestId('youtube-preview').textContent).toBe('preview:abcdefghijk')
    fireEvent.click(screen.getByRole('button', { name: 'HAKUで公開する' }))
    await waitFor(() => expect(api.updatePerformer).toHaveBeenCalledWith('performer-1', {
      youtube_live_video_id: 'abcdefghijk',
      youtube_live_url: 'https://www.youtube.com/watch?v=abcdefghijk',
      youtube_live_enabled: true,
    }))
    expect(onSaved).toHaveBeenCalledOnce()
    expect(await screen.findByText(/公開しました/)).toBeTruthy()
  })

  it('rejects arbitrary URLs before any update', () => {
    render(<YouTubeLiveSetup performer={performer} onBack={vi.fn()} onChooseDirect={vi.fn()} onPreview={vi.fn()} onSaved={vi.fn()} />)
    fireEvent.change(screen.getByLabelText('YouTube LIVEのURL'), { target: { value: 'https://evil.example/live/abcdefghijk' } })
    expect(screen.getByRole('alert').textContent).toContain('YouTube LIVEのURLを確認')
    expect(screen.getByRole('button', { name: 'HAKUで公開する' })).toHaveProperty('disabled', true)
    expect(api.updatePerformer).not.toHaveBeenCalled()
  })

  it('turns publication off and unlinks the same stored setting', async () => {
    const linked = { ...performer, youtube_live_video_id: 'abcdefghijk', youtube_live_url: 'https://www.youtube.com/watch?v=abcdefghijk', youtube_live_enabled: true }
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const { rerender } = render(<YouTubeLiveSetup performer={linked} onBack={vi.fn()} onChooseDirect={vi.fn()} onPreview={vi.fn()} onSaved={vi.fn().mockResolvedValue(undefined)} />)
    fireEvent.click(screen.getByRole('switch'))
    await waitFor(() => expect(api.updatePerformer).toHaveBeenCalledWith('performer-1', { youtube_live_enabled: false }))
    api.updatePerformer.mockClear()
    rerender(<YouTubeLiveSetup performer={linked} onBack={vi.fn()} onChooseDirect={vi.fn()} onPreview={vi.fn()} onSaved={vi.fn().mockResolvedValue(undefined)} />)
    fireEvent.click(screen.getByRole('button', { name: /連携を解除/ }))
    await waitFor(() => expect(api.updatePerformer).toHaveBeenCalledWith('performer-1', {
      youtube_live_video_id: null, youtube_live_url: null, youtube_live_enabled: false,
    }))
  })

  it('updates an existing registration using the same performer fields', async () => {
    const linked = { ...performer, youtube_live_video_id: 'abcdefghijk', youtube_live_url: 'https://www.youtube.com/watch?v=abcdefghijk', youtube_live_enabled: true }
    render(<YouTubeLiveSetup performer={linked} onBack={vi.fn()} onChooseDirect={vi.fn()} onPreview={vi.fn()} onSaved={vi.fn().mockResolvedValue(undefined)} />)
    fireEvent.change(screen.getByLabelText('YouTube LIVEのURL'), { target: { value: 'https://www.youtube.com/live/zyxwvutsrqp' } })
    fireEvent.click(screen.getByRole('button', { name: 'HAKUで公開する' }))
    await waitFor(() => expect(api.updatePerformer).toHaveBeenCalledWith('performer-1', {
      youtube_live_video_id: 'zyxwvutsrqp',
      youtube_live_url: 'https://www.youtube.com/watch?v=zyxwvutsrqp',
      youtube_live_enabled: true,
    }))
  })
})

describe('viewer routing', () => {
  beforeEach(() => { vi.clearAllMocks(); api.getSignedInUserId.mockResolvedValue(null); api.isFollowing.mockResolvedValue(false) })

  it('keeps HAKU DIRECT ahead of YouTube when both are active', async () => {
    api.getPerformer.mockResolvedValue({ ...performer, is_live: true, youtube_live_enabled: true, youtube_live_video_id: 'abcdefghijk', youtube_live_url: 'https://www.youtube.com/watch?v=abcdefghijk' })
    render(<ConnectedLiveWatchScreen performerId="performer-1" onBack={vi.fn()} onTip={vi.fn()} />)
    expect(await screen.findByTestId('direct-live')).toBeTruthy()
    expect(screen.queryByTestId('youtube-live-watch')).toBeNull()
  })

  it('shows the official YouTube player path and passes the performer to the HAKU tip action', async () => {
    api.getPerformer.mockResolvedValue({ ...performer, youtube_live_enabled: true, youtube_live_video_id: 'abcdefghijk', youtube_live_url: 'https://www.youtube.com/watch?v=abcdefghijk' })
    const onTip = vi.fn()
    render(<ConnectedLiveWatchScreen performerId="performer-1" onBack={vi.fn()} onTip={onTip} />)
    expect(await screen.findByTestId('youtube-preview')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /HAKUで応援する/ }))
    expect(onTip).toHaveBeenCalledOnce()
  })
})
