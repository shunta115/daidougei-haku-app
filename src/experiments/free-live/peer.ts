export type PeerMessage = {
  type: 'offer' | 'answer' | 'reconnect'; from: string; senderId: string
  to: string; targetId: string; epoch: number; sdp?: RTCSessionDescriptionInit
  connectionId?: string
}
export type Meter = { sent: number; received: number; connected: number; relay: boolean }
export const PHONE_VIDEO = { width: { ideal: 640, max: 640 }, height: { ideal: 360, max: 480 }, frameRate: { ideal: 15, max: 15 }, facingMode: { ideal: 'environment' } }

async function descriptionWithIce(pc: RTCPeerConnection, type: 'offer' | 'answer') {
  const description = type === 'offer' ? await pc.createOffer() : await pc.createAnswer()
  await pc.setLocalDescription(description)
  if (pc.iceGatheringState !== 'complete') await new Promise<void>((resolve, reject) => {
    const done = () => { clearTimeout(timeout); pc.removeEventListener('icegatheringstatechange', check); resolve() }
    const check = () => { if (pc.iceGatheringState === 'complete') done() }
    const timeout = setTimeout(() => { pc.removeEventListener('icegatheringstatechange', check); reject(new Error('ICE接続候補を取得できません。無料中継なしでは接続できない回線があります。')) }, 8000)
    pc.addEventListener('icegatheringstatechange', check); check()
  })
  if (!pc.localDescription) throw new Error('映像接続の準備に失敗しました')
  return { type: pc.localDescription.type, sdp: pc.localDescription.sdp }
}

/** One publisher -> up to five unidirectional peer connections; NO TURN/SFU. */
export class DirectPeers {
  private peers = new Map<string, RTCPeerConnection>()
  private connectionIds = new Map<string, string>()
  private lastBytes = new Map<string, { sent: number; received: number }>()
  private retiredBytes = { sent: 0, received: 0 }
  private closed = false
  constructor(private options: {
    stream?: MediaStream; epoch: number; stun: boolean
    send: (message: Omit<PeerMessage, 'from' | 'senderId'>) => Promise<unknown>
    onRemote: (stream: MediaStream) => void
    onProblem: (error: string) => void
  }) {}
  private create(peerId: string) {
    if (this.closed || this.peers.size >= 5) throw new Error('同時視聴は5人までです')
    const pc = new RTCPeerConnection({ iceServers: this.options.stun ? [{ urls: 'stun:stun.cloudflare.com:3478' }] : [] })
    this.peers.set(peerId, pc)
    pc.ontrack = event => this.options.onRemote(event.streams[0] || new MediaStream([event.track]))
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed') this.options.onProblem('映像を直接接続できません。回線を変えて再接続してください。有料中継への自動切替は行いません。')
    }
    const capabilities = RTCRtpSender.getCapabilities?.('video')
    for (const track of this.options.stream?.getTracks() || []) {
      pc.addTrack(track, this.options.stream!)
    }
    // H.264 preference for Safari; leave its complete supported codec list intact.
    for (const transceiver of pc.getTransceivers()) {
      if (transceiver.sender.track?.kind === 'video' && capabilities && transceiver.setCodecPreferences) {
        const codecs = [...capabilities.codecs].sort((a, b) => Number(b.mimeType.toLowerCase() === 'video/h264') - Number(a.mimeType.toLowerCase() === 'video/h264'))
        transceiver.setCodecPreferences(codecs)
      }
    }
    return pc
  }
  private async limit(pc: RTCPeerConnection) {
    for (const sender of pc.getSenders()) {
      if (!sender.track) continue
      const parameters = sender.getParameters()
      if (!parameters.encodings?.length) parameters.encodings = [{}]
      for (const encoding of parameters.encodings) {
        encoding.maxBitrate = sender.track.kind === 'video' ? 600_000 : 48_000
        if (sender.track.kind === 'video') encoding.maxFramerate = 15
      }
      // Failure is surfaced and stops this connection instead of silently sending uncapped.
      await sender.setParameters(parameters)
    }
  }
  async offer(peerId: string, actorId: string) {
    if (this.peers.has(peerId)) return
    const pc = this.create(peerId)
    const connectionId = crypto.randomUUID(); this.connectionIds.set(peerId, connectionId)
    try {
      const sdp = await descriptionWithIce(pc, 'offer')
      await this.limit(pc)
      if (!this.closed && pc.signalingState !== 'closed') await this.options.send({ type: 'offer', to: peerId, targetId: actorId, epoch: this.options.epoch, connectionId, sdp })
    } catch (error) { this.remove(peerId); throw error }
  }
  async receive(message: PeerMessage) {
    if (this.closed || message.epoch !== this.options.epoch) return
    if (message.type === 'reconnect') { this.remove(message.from); return }
    if (message.type === 'offer' && message.sdp?.type === 'offer') {
      if (!message.connectionId) return
      this.remove(message.from)
      const pc = this.create(message.from)
      this.connectionIds.set(message.from, message.connectionId)
      await pc.setRemoteDescription(message.sdp)
      const sdp = await descriptionWithIce(pc, 'answer')
      if (!this.closed) await this.options.send({ type: 'answer', to: message.from, targetId: message.senderId, epoch: this.options.epoch, connectionId: message.connectionId, sdp })
    } else if (message.type === 'answer' && message.sdp?.type === 'answer') {
      const pc = this.peers.get(message.from)
      if (pc?.signalingState === 'have-local-offer' && message.connectionId === this.connectionIds.get(message.from)) await pc.setRemoteDescription(message.sdp)
    }
  }
  retain(peers: string[]) { for (const key of this.peers.keys()) if (!peers.includes(key)) this.remove(key) }
  remove(peerId: string) {
    const last = this.lastBytes.get(peerId)
    if (last) { this.retiredBytes.sent += last.sent; this.retiredBytes.received += last.received }
    this.lastBytes.delete(peerId); this.connectionIds.delete(peerId); this.peers.get(peerId)?.close(); this.peers.delete(peerId)
  }
  close() { this.closed = true; for (const key of this.peers.keys()) this.remove(key) }
  async meter(): Promise<Meter> {
    const result = { ...this.retiredBytes, connected: 0, relay: false }
    for (const [key, pc] of this.peers) {
      if (pc.connectionState === 'connected') result.connected++
      const stats = await pc.getStats()
      const measured = { sent: 0, received: 0 }
      let hasTransport = false
      stats.forEach(row => {
        if (row.type === 'transport') {
          hasTransport = true; measured.sent += Number(row.bytesSent || 0); measured.received += Number(row.bytesReceived || 0)
        }
        if ((row.type === 'local-candidate' || row.type === 'remote-candidate') && row.candidateType === 'relay') result.relay = true
      })
      if (!hasTransport) stats.forEach(row => {
        if (row.type === 'outbound-rtp') measured.sent += Number(row.bytesSent || 0) + Number(row.headerBytesSent || 0)
        if (row.type === 'inbound-rtp') measured.received += Number(row.bytesReceived || 0) + Number(row.headerBytesReceived || 0)
      })
      this.lastBytes.set(key, measured)
      result.sent += measured.sent; result.received += measured.received
    }
    return result
  }
}

/** Same-device loopback is explicitly a device test, not five real viewers. */
export async function deviceLoopback(stream: MediaStream, onRemote: (index: number, stream: MediaStream) => void, signal?: AbortSignal) {
  const pairs: RTCPeerConnection[] = []
  let closed = false
  const close = () => { closed = true; pairs.forEach(pc => pc.close()) }
  signal?.addEventListener('abort', close, { once: true })
  if (signal?.aborted) close()
  try {
    for (let i = 0; i < 5; i++) {
      if (closed) break
      const a = new RTCPeerConnection({ iceServers: [] }), b = new RTCPeerConnection({ iceServers: [] })
      pairs.push(a, b)
      stream.getTracks().forEach(track => a.addTrack(track, stream))
      b.ontrack = event => { if (!closed) onRemote(i, event.streams[0] || new MediaStream([event.track])) }
      a.onicecandidate = event => { if (event.candidate && !closed) void b.addIceCandidate(event.candidate).catch(() => undefined) }
      b.onicecandidate = event => { if (event.candidate && !closed) void a.addIceCandidate(event.candidate).catch(() => undefined) }
      const offer = await a.createOffer(); await a.setLocalDescription(offer); await b.setRemoteDescription(offer)
      const answer = await b.createAnswer(); await b.setLocalDescription(answer); await a.setRemoteDescription(answer)
      for (const sender of a.getSenders()) {
        const p = sender.getParameters(); p.encodings ||= [{}]
        p.encodings.forEach(e => { e.maxBitrate = sender.track?.kind === 'video' ? 600_000 : 48_000 })
        await sender.setParameters(p)
      }
    }
    return { close, meter: async () => {
      const reports = await Promise.all(pairs.map(pc => pc.getStats()))
      let sent = 0, received = 0
      reports.forEach(report => report.forEach(row => { if (row.type === 'transport') { sent += Number(row.bytesSent || 0); received += Number(row.bytesReceived || 0) } }))
      return { sent, received, connected: pairs.filter(pc => pc.connectionState === 'connected').length / 2, relay: false }
    } }
  } catch (error) { close(); throw error }
}
