// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LiveWatchScreen } from '../src/platform/screens/LiveWatchScreen'

const state = vi.hoisted(() => ({
  disconnect: vi.fn().mockResolvedValue(undefined),
  connect: vi.fn(),
  getPerformer: vi.fn(),
  onPerformer: null as null | ((row: { is_live: boolean }) => void),
}))
vi.mock('../src/platform/lib/api', () => ({
  getPerformer: state.getPerformer,
  subscribePerformerLive: (_id: string, callback: (row: { is_live: boolean }) => void) => {
    state.onPerformer = callback
    return () => { state.onPerformer = null }
  },
  getActiveLiveSessionId: vi.fn().mockResolvedValue(null),
  isFollowing: vi.fn().mockResolvedValue(false),
  updateLiveViewerPeak: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('../src/platform/lib/auth', () => ({ useAuth: () => ({ user: null, profile: null }) }))
const translate = vi.hoisted(() => (key: string) => key)
vi.mock('../src/i18n/LangProvider', () => ({ useLang: () => ({ t: translate }) }))
vi.mock('../src/platform/lib/useLiveLayout', () => ({ useLiveLayout: () => ({ mode: 'phone-portrait', isOverlayChrome: true }) }))
vi.mock('../src/platform/lib/useFullscreen', () => ({ useFullscreen: () => ({ active: false, fallback: false, toggle: vi.fn() }) }))
vi.mock('../src/platform/lib/useVideoAspect', () => ({ useVideoAspect: () => ({ ratio: 9 / 16, orientation: 'portrait' }) }))
vi.mock('../src/platform/lib/useLiveFever', () => ({ useLiveFever: () => ({ level: 0, likes: 0, hearts: [], sendLike: vi.fn(), addGift: vi.fn() }) }))
vi.mock('../src/platform/lib/useLiveCommentScroll', () => ({
  useLiveCommentScroll: () => ({ listRef: { current: null }, hasNewComments: false, onScroll: vi.fn(), scrollToLatest: vi.fn() }),
  appendLiveComment: (rows: unknown[], row: unknown) => [...rows, row].slice(-80),
  removeLiveComment: (rows: Array<{id: string}>, id: string) => rows.filter((row) => row.id !== id),
}))
vi.mock('../src/platform/lib/track', () => ({ useTrackView: vi.fn(), trackProductEvent: vi.fn() }))
vi.mock('../src/platform/components/TipGiftOverlay', () => ({ TipGiftOverlay: () => null }))
vi.mock('../src/platform/components/LiveFeverOverlay', () => ({ LiveFeverOverlay: () => null }))
vi.mock('../src/platform/lib/livekit', () => ({
  fetchLiveKitStatus: vi.fn().mockResolvedValue({ configured: true }),
  fetchLiveKitToken: vi.fn().mockResolvedValue({ token: 'test', url: 'wss://example.test' }),
  connectAsViewer: state.connect,
  countViewers: () => 1,
  applyNetworkAdaptation: () => 'AUTO',
  watchRemoteMedia: vi.fn(),
  attachRemoteTrack: vi.fn(),
  liveKitErrorMessage: () => 'LIVE error',
  LiveKitClientError: class LiveKitClientError extends Error {},
}))

const props = { performerId: 'performer-1', onBack: vi.fn(), onTip: vi.fn() }

beforeEach(() => {
  vi.clearAllMocks()
  state.onPerformer = null
  state.getPerformer.mockResolvedValue({ id: 'performer-1', stage_name: 'TEST LIVE', is_live: true, live_started_at: null })
  state.connect.mockResolvedValue({ disconnect: state.disconnect, on: vi.fn(), localParticipant: { connectionQuality: 1 } })
})
afterEach(cleanup)

describe('persistent HAKU DIRECT viewer', () => {
  it('keeps one Room and the same media elements when mini is toggled, then disconnects on close', async () => {
    const onRestore = vi.fn()
    const onClose = vi.fn()
    const view = render(<LiveWatchScreen {...props} onRestore={onRestore} onClose={onClose} />)
    await waitFor(() => expect(state.connect).toHaveBeenCalledTimes(1))
    const video = view.container.querySelector('video')
    const audio = view.container.querySelector('audio')
    view.rerender(<LiveWatchScreen {...props} mini onRestore={onRestore} onClose={onClose} />)
    expect(view.container.querySelector('video')).toBe(video)
    expect(view.container.querySelector('audio')).toBe(audio)
    expect(state.connect).toHaveBeenCalledTimes(1)
    expect(state.disconnect).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'LIVE画面に戻る' }))
    expect(onRestore).toHaveBeenCalledOnce()
    fireEvent.click(screen.getByRole('button', { name: '小窓を閉じる' }))
    expect(onClose).toHaveBeenCalledOnce()
    view.unmount()
    expect(state.disconnect).toHaveBeenCalledTimes(1)
  })

  it('signals the parent and disconnects the Room when the LIVE ends', async () => {
    const onEnded = vi.fn()
    render(<LiveWatchScreen {...props} mini onEnded={onEnded} />)
    await waitFor(() => expect(state.connect).toHaveBeenCalledTimes(1))
    state.onPerformer?.({ is_live: false })
    expect(onEnded).toHaveBeenCalledOnce()
    expect(state.disconnect).toHaveBeenCalledTimes(1)
  })
})
