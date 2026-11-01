import { RoomEvent, Track, VideoQuality, type LocalVideoTrack, type Room } from 'livekit-client'
import { liveAudioSettings } from './liveAudioProfile'
import { LiveLayerPolicy, rtpMetric, type RtpMetric, type RtpSample } from './liveQualityMetrics'
export type LiveQualitySnapshot = {
  audioCapture: ReturnType<typeof liveAudioSettings>[]
  metrics: RtpMetric[]; reconnects: number; sampledAt: number
  cause: 'unknown'; serverObserved: false; adaptation: 'observe' | 'test-layers'
}
const monitors = new WeakMap<Room, { stop: () => void; snapshot: () => LiveQualitySnapshot }>()
export function readLiveQuality(room: Room): LiveQualitySnapshot | null {
  const state = monitors.get(room)?.snapshot()
  return state ? { ...state, metrics: state.metrics.map(m => ({ ...m, codec: m.codec ? { ...m.codec } : null })), audioCapture: state.audioCapture.map(s => ({ ...s })) } : null
}
/** Existing tracks only. Latest snapshot + one baseline in memory; no uploads, capture or reconnect. */
export function monitorLiveQuality(room: Room, options: { testLayerControl?: boolean } = {}) {
  const existing = monitors.get(room)
  if (existing) return existing.stop
  // Experimental control is available only in local Vite development, never a production build.
  const control = import.meta.env.DEV && options.testLayerControl === true
  let stopped = false
  let generation = 0
  let timer: ReturnType<typeof setTimeout> | undefined
  let previous = new Map<string, RtpSample>()
  const trackKeys = new WeakMap<object, number>()
  let nextTrackKey = 0
  let state: LiveQualitySnapshot = { audioCapture: [], metrics: [], reconnects: 0, sampledAt: 0, cause: 'unknown', serverObserved: false, adaptation: control ? 'test-layers' : 'observe' }
  const policy = new LiveLayerPolicy()
  const reconnect = () => { generation++; state = { ...state, reconnects: state.reconnects + 1, metrics: [] }; previous.clear() }
  const stop = () => {
    if (stopped) return
    stopped = true
    if (timer) clearTimeout(timer)
    previous.clear()
    room.off(RoomEvent.Reconnecting, reconnect)
    room.off(RoomEvent.Disconnected, stop)
    monitors.delete(room)
  }
  async function sample() {
    const startedGeneration = generation
    const publications = [
      ...room.localParticipant.trackPublications.values(),
      ...Array.from(room.remoteParticipants.values()).flatMap(p => [...p.trackPublications.values()]),
    ]
    const tracks = publications.flatMap(p => p.track ? [p.track] : [])
    const reports = await Promise.allSettled(tracks.map(track => track.getRTCStatsReport()))
    if (stopped || generation !== startedGeneration) return
    const next = new Map<string, RtpSample>()
    const metrics: RtpMetric[] = []
    reports.forEach((report, index) => {
      if (report.status !== 'fulfilled') return
      report.value?.forEach((raw: RtpSample) => {
        const track = tracks[index]
        if (!trackKeys.has(track)) trackKeys.set(track, ++nextTrackKey)
        const key = `${trackKeys.get(track)}:${raw.id}`
        if (next.has(key)) return
        const metric = rtpMetric(raw, previous.get(key))
        if (!metric) return
        const codec = raw.codecId ? report.value?.get(raw.codecId) : undefined
        const mimeType = typeof codec?.mimeType === 'string' ? codec.mimeType.toLowerCase() : ''
        if (/^(audio\/(opus|red|pcmu|pcma|cn)|video\/(h264|vp8|vp9|av1|rtx|red|ulpfec))$/.test(mimeType)) {
          const numeric = (value: unknown) => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null
          metric.codec = { mimeType, clockRate: numeric(codec.clockRate), channels: numeric(codec.channels) }
        }
        next.set(key, {
          id: raw.id, type: raw.type, timestamp: raw.timestamp, kind: raw.kind ?? raw.mediaType,
          bytesSent: raw.bytesSent, bytesReceived: raw.bytesReceived,
          packetsReceived: raw.packetsReceived, packetsLost: raw.packetsLost,
          framesDropped: raw.framesDropped, concealedSamples: raw.concealedSamples,
          totalSamplesReceived: raw.totalSamplesReceived,
          framesEncoded: raw.framesEncoded, framesDecoded: raw.framesDecoded,
          jitterBufferDelay: raw.jitterBufferDelay, jitterBufferEmittedCount: raw.jitterBufferEmittedCount,
        })
        metrics.push(metric)
      })
    })
    previous = next
    const audioCapture = [...room.localParticipant.trackPublications.values()]
      .flatMap(pub => pub.source === Track.Source.Microphone && pub.track ? [liveAudioSettings(pub.track.mediaStreamTrack)] : [])
    state = { ...state, audioCapture, metrics, sampledAt: performance.now() }
    if (control) {
      const layer = policy.update(metrics)
      const quality = layer === 0 ? VideoQuality.LOW : layer === 1 ? VideoQuality.MEDIUM : VideoQuality.HIGH
      for (const pub of room.localParticipant.videoTrackPublications.values()) {
        if (pub.source === Track.Source.Camera) (pub.track as LocalVideoTrack | undefined)?.setPublishingQuality(quality)
      }
    }
  }
  async function tick() {
    try { await sample() } catch {
      if (!stopped) { previous.clear(); state = { ...state, metrics: [] } }
    } finally { if (!stopped) timer = setTimeout(() => { void tick() }, 5000) }
  }
  monitors.set(room, { stop, snapshot: () => state })
  room.on(RoomEvent.Reconnecting, reconnect)
  room.on(RoomEvent.Disconnected, stop)
  timer = setTimeout(() => { void tick() }, 5000)
  return stop
}
