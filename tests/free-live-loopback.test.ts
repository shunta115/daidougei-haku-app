import { afterEach, describe, expect, it, vi } from 'vitest'
import { deviceLoopback } from '../src/experiments/free-live/peer'

class FakePeer extends EventTarget {
  static instances: FakePeer[] = []
  static connect = true
  iceGatheringState = 'complete'
  connectionState = 'new'
  localDescription: {type: string; sdp: string} | null = null
  remoteDescription: {type: string; sdp: string} | null = null
  constructor() { super(); FakePeer.instances.push(this) }
  addTrack() {}
  getSenders() { return [] }
  createOffer() { return Promise.resolve({ type: 'offer', sdp: 'initial' }) }
  createAnswer() { return Promise.resolve({ type: 'answer', sdp: 'initial' }) }
  setLocalDescription(value: {type: string}) {
    this.localDescription = { ...value, sdp: 'complete-with-candidates' }
    if (value.type === 'answer' && FakePeer.connect) this.connectionState = 'connected'
    return Promise.resolve()
  }
  setRemoteDescription(value: {type: string; sdp: string}) {
    expect(value.sdp).toBe('complete-with-candidates')
    this.remoteDescription = value
    if (value.type === 'answer' && FakePeer.connect) this.connectionState = 'connected'
    return Promise.resolve()
  }
  close() { this.connectionState = 'closed' }
}
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); FakePeer.instances = []; FakePeer.connect = true })
const stream = { getTracks: () => [] } as unknown as MediaStream
function setup() { vi.stubGlobal('RTCPeerConnection', FakePeer) }
describe('device loopback transport checks', () => {
  it('exchanges complete candidate descriptions for all five pairs', async () => {
    setup()
    const result = await deviceLoopback(stream, () => {})
    expect(FakePeer.instances).toHaveLength(10)
    expect(FakePeer.instances.every(pc => pc.connectionState === 'connected')).toBe(true)
    result.close()
    expect(FakePeer.instances.every(pc => pc.connectionState === 'closed')).toBe(true)
  })
  it('rejects a stalled connection and closes every allocated peer', async () => {
    setup(); vi.useFakeTimers(); FakePeer.connect = false
    const result = deviceLoopback(stream, () => {})
    const rejection = expect(result).rejects.toThrow('20秒以内')
    await vi.advanceTimersByTimeAsync(20_001)
    await rejection
    expect(FakePeer.instances.every(pc => pc.connectionState === 'closed')).toBe(true)
  })
  it('aborts pending connections instead of reporting success', async () => {
    setup(); const controller = new AbortController(); controller.abort()
    await expect(deviceLoopback(stream, () => {}, controller.signal)).rejects.toThrow('失敗')
    expect(FakePeer.instances).toHaveLength(0)
  })
})
