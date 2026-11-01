import { afterEach, describe, expect, it, vi } from 'vitest'
import { RoomEvent, type Room } from 'livekit-client'
import { monitorLiveQuality, readLiveQuality } from '../src/platform/lib/liveQualityMonitor'
function fixture() {
  const listeners = new Map<string, Set<() => void>>()
  const stats = vi.fn(async () => new Map([['x', { id: 'x', timestamp: 1000, type: 'outbound-rtp', kind: 'video', bytesSent: 100, frameWidth: 720, frameHeight: 1280 }]]))
  const room = {
    localParticipant: { trackPublications: new Map([['v', { track: { getRTCStatsReport: stats } }]]), videoTrackPublications: new Map() },
    remoteParticipants: new Map(),
    on: (event: string, callback: () => void) => { if (!listeners.has(event)) listeners.set(event, new Set()); listeners.get(event)!.add(callback) },
    off: (event: string, callback: () => void) => { listeners.get(event)?.delete(callback) },
  } as unknown as Room
  return { room, stats, emit: (event: string) => listeners.get(event)?.forEach(cb => cb()) }
}
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs() })
describe('Room monitor lifecycle', () => {
  it('cannot enable experimental layer control in a production build', () => {
    vi.stubEnv('DEV', false); vi.useFakeTimers(); const { room } = fixture()
    const stop = monitorLiveQuality(room, { testLayerControl: true })
    expect(readLiveQuality(room)?.adaptation).toBe('observe'); stop()
  })
  it('keeps one timer and latest snapshot across a simulated 60 minutes', async () => {
    vi.useFakeTimers(); const { room, stats } = fixture()
    const stop = monitorLiveQuality(room)
    await vi.advanceTimersByTimeAsync(60 * 60 * 1000)
    expect(stats).toHaveBeenCalledTimes(720)
    expect(readLiveQuality(room)?.metrics).toHaveLength(1)
    expect(vi.getTimerCount()).toBe(1)
    stop(); expect(vi.getTimerCount()).toBe(0)
  })

  it('starts once, reads existing tracks and disposes on disconnect', async () => {
    vi.useFakeTimers(); const { room, stats, emit } = fixture()
    const stop = monitorLiveQuality(room); expect(monitorLiveQuality(room)).toBe(stop)
    await vi.advanceTimersByTimeAsync(5000); expect(stats).toHaveBeenCalledTimes(1)
    expect(readLiveQuality(room)?.metrics[0].width).toBe(720)
    expect(readLiveQuality(room)?.adaptation).toBe('observe')
    const snapshot = readLiveQuality(room)!; snapshot.metrics[0].width = 999
    expect(readLiveQuality(room)?.metrics[0].width).toBe(720)
    emit(RoomEvent.Reconnecting); expect(readLiveQuality(room)?.reconnects).toBe(1)
    emit(RoomEvent.Disconnected); expect(readLiveQuality(room)).toBeNull()
    await vi.advanceTimersByTimeAsync(15000); expect(stats).toHaveBeenCalledTimes(1)
  })
  it('does not overlap pending stats or publish late results after stop', async () => {
    vi.useFakeTimers(); const { room, stats } = fixture()
    let resolve!: (report: Map<string, never>) => void
    stats.mockImplementation(() => new Promise(r => { resolve = r }))
    const stop = monitorLiveQuality(room)
    await vi.advanceTimersByTimeAsync(20000); expect(stats).toHaveBeenCalledTimes(1)
    stop(); resolve(new Map()); await vi.advanceTimersByTimeAsync(10000)
    expect(readLiveQuality(room)).toBeNull(); expect(stats).toHaveBeenCalledTimes(1)
  })
  it('survives unavailable stats without declaring the network healthy', async () => {
    vi.useFakeTimers(); const { room, stats } = fixture(); stats.mockRejectedValue(new Error('unsupported'))
    const stop = monitorLiveQuality(room); await vi.advanceTimersByTimeAsync(10000)
    expect(stats).toHaveBeenCalledTimes(2); expect(readLiveQuality(room)?.metrics).toEqual([])
    expect(readLiveQuality(room)?.cause).toBe('unknown'); stop()
  })
})
