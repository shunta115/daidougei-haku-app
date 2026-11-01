/** Numeric RTP evidence only; absence means unknown, never healthy. */
export type RtpSample = {
  id: string; timestamp: number; type: string; kind?: string; mediaType?: string
  bytesSent?: number; bytesReceived?: number; packetsReceived?: number; packetsLost?: number
  jitter?: number; roundTripTime?: number; framesPerSecond?: number; frameWidth?: number
  frameHeight?: number; framesDropped?: number; concealedSamples?: number; totalSamplesReceived?: number
  codecId?: string; qualityLimitationReason?: string
}
export type RtpMetric = {
  direction: 'send' | 'receive' | 'remote-receive'; kind: 'audio' | 'video'
  bitrate: number | null; loss: number | null; jitterMs: number | null; rttMs: number | null
  fps: number | null; width: number | null; height: number | null
  droppedFrames: number | null; concealment: number | null; cpuLimited: boolean
  codec?: { mimeType: string; clockRate: number | null; channels: number | null } | null
}
const valid = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0
const numeric = (v: unknown) => valid(v) ? v : null
function delta(a?: number, b?: number) { return valid(a) && valid(b) && a >= b ? a - b : null }
export function rtpMetric(now: RtpSample, before?: RtpSample): RtpMetric | null {
  const kind = now.kind ?? now.mediaType
  if ((kind !== 'audio' && kind !== 'video') || !['outbound-rtp', 'inbound-rtp', 'remote-inbound-rtp'].includes(now.type)) return null
  const direction = now.type === 'outbound-rtp' ? 'send' : now.type === 'inbound-rtp' ? 'receive' : 'remote-receive'
  const elapsed = before?.id === now.id && before.type === now.type ? now.timestamp - before.timestamp : 0
  const previous = elapsed > 0 && elapsed <= 30_000 ? before : undefined
  const bytes = direction === 'send' ? delta(now.bytesSent, previous?.bytesSent) : delta(now.bytesReceived, previous?.bytesReceived)
  const received = delta(now.packetsReceived, previous?.packetsReceived)
  const lost = delta(now.packetsLost, previous?.packetsLost)
  const concealed = delta(now.concealedSamples, previous?.concealedSamples)
  const samples = delta(now.totalSamplesReceived, previous?.totalSamplesReceived)
  return {
    direction, kind, bitrate: bytes == null ? null : bytes * 8000 / elapsed,
    loss: lost != null && received != null && lost + received > 0 ? lost / (lost + received) : null,
    jitterMs: valid(now.jitter) ? now.jitter * 1000 : null,
    rttMs: valid(now.roundTripTime) ? now.roundTripTime * 1000 : null,
    fps: numeric(now.framesPerSecond), width: numeric(now.frameWidth), height: numeric(now.frameHeight),
    droppedFrames: delta(now.framesDropped, previous?.framesDropped),
    concealment: concealed != null && samples != null && samples > 0 ? Math.min(1, concealed / samples) : null,
    codec: null,
    cpuLimited: now.qualityLimitationReason === 'cpu',
  }
}
/** Three SDK simulcast layers, not resolution promises. Recovery requires a full minute of feedback. */
export class LiveLayerPolicy {
  layer: 0 | 1 | 2 = 2
  private bad = 0
  private good = 0
  update(metrics: RtpMetric[]) {
    const upstream = metrics.filter(m => m.direction === 'remote-receive')
    const bad = metrics.some(m => m.direction === 'send' && m.cpuLimited) || upstream.some(m => (m.loss != null && m.loss > .05) || (m.rttMs != null && m.rttMs > 700))
    const good = upstream.length > 0 && upstream.every(m => m.loss != null && m.loss < .01 && m.rttMs != null && m.rttMs < 250)
    this.bad = bad ? this.bad + 1 : 0
    this.good = !bad && good ? this.good + 1 : 0
    if (this.bad >= 2) { this.layer = Math.max(0, this.layer - 1) as 0 | 1 | 2; this.bad = 0; this.good = 0 }
    if (this.good >= 12) { this.layer = Math.min(2, this.layer + 1) as 0 | 1 | 2; this.good = 0 }
    return this.layer
  }
}

/** A quality badge must come from RTP dimensions, never a connection-quality enum. */
export function observedVideoLabel(metrics: RtpMetric[], direction: 'send' | 'receive') {
  const sides = metrics.filter(m => m.kind === 'video' && m.direction === direction && m.width && m.height)
    .map(m => Math.min(m.width!, m.height!))
  const side = sides.length ? Math.max(...sides) : 0
  if (side >= 1080) return '1080p' as const
  if (side >= 720) return '720p' as const
  if (side >= 480) return '480p' as const
  if (side >= 360) return '360p' as const
  return 'AUTO' as const
}
