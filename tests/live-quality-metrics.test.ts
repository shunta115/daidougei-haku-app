import { describe, expect, it } from 'vitest'
import { LiveLayerPolicy, rtpMetric, observedVideoLabel, type RtpMetric, type RtpSample } from '../src/platform/lib/liveQualityMetrics'
const sample: RtpSample = { id: 'a', timestamp: 1000, type: 'inbound-rtp', kind: 'audio', bytesReceived: 1000, packetsReceived: 100, packetsLost: 2, totalSamplesReceived: 1000, concealedSamples: 0 }
const health = (loss: number | null, rttMs: number | null): RtpMetric => ({ direction: 'remote-receive', kind: 'video', bitrate: null, loss, rttMs, jitterMs: null, fps: null, width: null, height: null, droppedFrames: null, concealment: null, cpuLimited: false })
describe('RTP interval evidence', () => {
  it('uses interval deltas and correct units', () => {
    const m = rtpMetric({ ...sample, timestamp: 6000, bytesReceived: 31000, packetsReceived: 198, packetsLost: 4, jitter: .012, totalSamplesReceived: 2000, concealedSamples: 100 }, sample)!
    expect(m.bitrate).toBe(48000); expect(m.loss).toBe(.02); expect(m.jitterMs).toBe(12); expect(m.concealment).toBe(.1)
  })
  it('keeps first sample and missing feedback unknown', () => {
    expect(rtpMetric(sample)?.bitrate).toBeNull(); expect(rtpMetric(sample)?.rttMs).toBeNull()
    expect(rtpMetric({ ...sample, type: 'candidate-pair' })).toBeNull()
  })
  it.each([{ timestamp: 1000 }, { timestamp: 500 }, { timestamp: 40000 }, { id: 'new' }, { bytesReceived: 0 }])('rejects discontinuity %j', change => {
    expect(rtpMetric({ ...sample, timestamp: 6000, ...change }, sample)?.bitrate).toBeNull()
  })
  it('does not misinterpret negative loss correction', () => {
    expect(rtpMetric({ ...sample, timestamp: 6000, packetsReceived: 200, packetsLost: -1 }, sample)?.loss).toBeNull()
  })
  it('never exports identifying properties', () => {
    const m = rtpMetric({ ...sample, address: 'private', deviceId: 'secret', codecId: 'secret' } as RtpSample)
    expect(JSON.stringify(m)).not.toContain('secret'); expect(JSON.stringify(m)).not.toContain('private')
  })
})
describe('TEST layer policy', () => {
  it('requires sustained degradation, then a minute of recovery', () => {
    const p = new LiveLayerPolicy(); expect(p.update([health(.1, 800)])).toBe(2)
    expect(p.update([health(.1, 800)])).toBe(1)
    for (let i = 0; i < 11; i++) expect(p.update([health(0, 100)])).toBe(1)
    expect(p.update([health(0, 100)])).toBe(2)
  })
  it('never upgrades without feedback', () => {
    const p = new LiveLayerPolicy(); p.update([health(.1, 800)]); p.update([health(.1, 800)])
    for (let i = 0; i < 100; i++) p.update([health(null, null)])
    expect(p.layer).toBe(1)
  })
  it('stays within three SDK layers', () => {
    const p = new LiveLayerPolicy(); for (let i = 0; i < 100; i++) p.update([health(0, 100)])
    expect(p.layer).toBe(2)
  })
})

it('does not label a good connection as 1080p without RTP evidence', () => {
  expect(observedVideoLabel([], 'receive')).toBe('AUTO')
  expect(observedVideoLabel([{ ...health(0, 100), direction: 'receive', width: 720, height: 1280 }], 'receive')).toBe('720p')
  expect(observedVideoLabel([{ ...health(0, 100), direction: 'receive', width: 1920, height: 1080 }], 'send')).toBe('AUTO')
})

describe('Frame and jitter-buffer interval diagnostics', () => {
  const video: RtpSample = { id: 'v', type: 'inbound-rtp', kind: 'video', timestamp: 1000, framesDecoded: 100, framesPerSecond: 13, jitterBufferDelay: 2, jitterBufferEmittedCount: 100 }
  it('separates measured interval FPS from instantaneous FPS and converts buffer seconds', () => {
    const metric = rtpMetric({ ...video, timestamp: 6000, framesDecoded: 200, jitterBufferDelay: 5, jitterBufferEmittedCount: 200 }, video)!
    expect(metric.intervalFps).toBe(20); expect(metric.fps).toBe(13); expect(metric.jitterBufferMs).toBe(30)
    expect(rtpMetric({ ...video, type: 'outbound-rtp', timestamp: 6000, framesEncoded: 250 }, { ...video, type: 'outbound-rtp', framesEncoded: 100 })?.intervalFps).toBe(30)
  })
  it.each([undefined, { ...video, timestamp: 6000 }, { ...video, timestamp: -30000 }, { ...video, id: 'other' }, { ...video, framesDecoded: 999, jitterBufferDelay: 999, jitterBufferEmittedCount: 999 }])('keeps absent, stale or reset counters unknown', before => {
    const metric = rtpMetric({ ...video, timestamp: 6000 }, before)!
    expect(metric.intervalFps).toBeNull(); expect(metric.jitterBufferMs).toBeNull()
  })
  it('does not divide by an empty emission interval or invent missing frame counters', () => {
    const metric = rtpMetric({ ...video, timestamp: 6000, framesDecoded: undefined }, video)!
    expect(metric.intervalFps).toBeNull(); expect(metric.jitterBufferMs).toBeNull()
  })
})
