// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { JSDOM } from 'jsdom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LiveWatchScreen } from '../src/platform/screens/LiveWatchScreen'

const state = vi.hoisted(() => ({
  disconnect: vi.fn().mockResolvedValue(undefined),
  connect: vi.fn(),
  getPerformer: vi.fn(),
  follow: vi.fn().mockResolvedValue(undefined),
  unfollow: vi.fn().mockResolvedValue(undefined),
  user: null as null | { id: string },
  comments: [] as Array<Record<string, unknown>>,
  onPerformer: null as null | ((row: { is_live: boolean }) => void),
}))
vi.mock('../src/platform/lib/api', () => ({
  getPerformer: state.getPerformer,
  postLiveComment: vi.fn().mockResolvedValue(undefined),
  subscribePerformerLive: (_id: string, callback: (row: { is_live: boolean }) => void) => {
    state.onPerformer = callback
    return () => { state.onPerformer = null }
  },
  getActiveLiveSessionId: vi.fn().mockResolvedValue('session-1'),
  listLiveComments: vi.fn(async () => state.comments),
  subscribeLiveComments: () => () => undefined,
  canModerateLiveComments: vi.fn().mockResolvedValue(false),
  follow: state.follow,
  unfollow: state.unfollow,
  isFollowing: vi.fn().mockResolvedValue(false),
  updateLiveViewerPeak: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('../src/platform/lib/auth', () => ({ useAuth: () => ({ user: state.user, profile: state.user ? { id: state.user.id, display_name: 'TEST' } : null }) }))
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
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }))
  const storage = new JSDOM('', { url: 'http://localhost' }).window
  vi.stubGlobal('localStorage', storage.localStorage)
  vi.stubGlobal('sessionStorage', storage.sessionStorage)
  localStorage.clear()
  state.user = null
  state.comments = []
  state.onPerformer = null
  state.getPerformer.mockResolvedValue({ id: 'performer-1', stage_name: 'TEST LIVE', is_live: true, live_started_at: null })
  state.connect.mockResolvedValue({ disconnect: state.disconnect, on: vi.fn(), canPlaybackAudio: true, startAudio: vi.fn().mockResolvedValue(undefined), localParticipant: { connectionQuality: 1 } })
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

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

  it('opens compact settings on demand and closes after choosing a display fit', async () => {
    const view = render(<LiveWatchScreen {...props} />)
    await waitFor(() => expect(state.connect).toHaveBeenCalledTimes(1))
    expect(screen.queryByRole('dialog', { name: '視聴設定' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '視聴設定' }))
    expect(screen.getByRole('dialog', { name: '視聴設定' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '全画面', exact: true }))
    expect(screen.queryByRole('dialog', { name: '視聴設定' })).toBeNull()
    expect((view.container.querySelector('.pl-live') as HTMLElement).style.getPropertyValue('--video-fit')).toBe('cover')
    expect(state.connect).toHaveBeenCalledTimes(1)
  })

  it('mutes both existing media elements and preserves performer follow and tip actions', async () => {
    state.user = { id: 'fan-1' }
    const onTip = vi.fn()
    const view = render(<LiveWatchScreen {...props} onTip={onTip} />)
    await waitFor(() => expect(state.connect).toHaveBeenCalledTimes(1))
    fireEvent.click(screen.getByRole('button', { name: '音声をオフ' }))
    expect(view.container.querySelector('video')?.muted).toBe(true)
    expect(view.container.querySelector('audio')?.muted).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: '＋フォロー' }))
    await waitFor(() => expect(state.follow).toHaveBeenCalledWith('fan-1', 'performer-1'))
    fireEvent.click(await screen.findByRole('button', { name: 'フォロー中' }))
    await waitFor(() => expect(state.unfollow).toHaveBeenCalledWith('fan-1', 'performer-1'))
    fireEvent.click(screen.getByRole('button', { name: '応援する' }))
    expect(onTip).toHaveBeenCalledOnce()
  })

  it.each([100, 1000])('renders %i comments with one unchanged media stage', async (total) => {
    state.comments = Array.from({ length: total }, (_, index) => ({ id: String(index), display_name: 'Fan', body: `Comment ${index}`, user_id: 'fan-1' }))
    const view = render(<LiveWatchScreen {...props} />)
    await waitFor(() => expect(view.container.querySelectorAll('.pl-live__comment')).toHaveLength(total))
    await waitFor(() => expect(state.connect).toHaveBeenCalledTimes(1))
    expect(view.container.querySelectorAll('.pl-live__stage')).toHaveLength(1)
    expect(view.container.querySelectorAll('video')).toHaveLength(1)
    expect(state.connect).toHaveBeenCalledTimes(1)
  })
})
