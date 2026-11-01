/** Decimal GB, payload plus an explicit planning factor. Not a provider invoice or capacity proof. */
export function estimateLiveTransfer(input: {
  videoBps: number; audioBps: number; viewers: number; performers?: number
  hoursPerDay?: number; days?: number; overhead?: number
}) {
  const { videoBps, audioBps, viewers, performers = 1, hoursPerDay = 3, days = 30, overhead = 1.15 } = input
  for (const value of [videoBps, audioBps, viewers, performers, hoursPerDay, days, overhead]) {
    if (!Number.isFinite(value) || value < 0) throw new RangeError('Expected finite non-negative planning inputs')
  }
  if (overhead < 1) throw new RangeError('Overhead factor cannot be below one')
  const receiverBps = (videoBps + audioBps) * overhead
  const receiverGBPerHour = receiverBps * 3600 / 8 / 1e9
  return {
    receiverGBPerHour, serverOutboundMbps: receiverBps * viewers / 1e6,
    serverOutboundGBPerHour: receiverGBPerHour * viewers,
    serverOutboundGBPerMonth: receiverGBPerHour * viewers * hoursPerDay * days * performers,
    // Publisher simulcast, TURN, signalling, Realtime and retransmission bills are separate.
    verifiedAdditionalYen: null,
  }
}
