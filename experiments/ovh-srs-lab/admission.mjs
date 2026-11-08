/**
 * HAKU 500-viewer capacity admission plan (no network or production changes).
 * Inputs MUST be sustained throughput measured on the exact region/plan,
 * not advertised network speed. This is only a planning gate; a real server
 * needs atomic, shared reservations and live telemetry.
 */
export function planAdmission({
  measuredSustainedMbps,
  simultaneousStreams = 0,
  viewersPerStream = 500,
  videoKbps = 800,
  audioKbps = 48,
  protocolMargin = 0.15,
  headroomFactor = 0.65,
  requiredViewerLimit = 500,
} = {}) {
  if (!Number.isInteger(simultaneousStreams) || simultaneousStreams < 0 ||
      !Number.isInteger(viewersPerStream) || viewersPerStream < 1 ||
      !Number.isFinite(videoKbps) || videoKbps <= 0 ||
      !Number.isFinite(audioKbps) || audioKbps < 0 ||
      !Number.isFinite(protocolMargin) || protocolMargin < 0 || protocolMargin > 1 ||
      !Number.isFinite(headroomFactor) || headroomFactor <= 0 || headroomFactor > 1 ||
      !Number.isInteger(requiredViewerLimit) || requiredViewerLimit < 1) {
    throw new Error('invalid_admission_inputs');
  }
  const streamMbps = viewersPerStream * (videoKbps + audioKbps) * (1 + protocolMargin) / 1000;
  if (!Number.isFinite(measuredSustainedMbps) || measuredSustainedMbps <= 0) {
    return { allowed: false, reason: 'real_network_benchmark_required', streamMbps,
      maxSimultaneousStreams: 0, remainingStreams: 0 };
  }
  const safeMbps = measuredSustainedMbps * headroomFactor;
  const maxSimultaneousStreams = Math.floor(safeMbps / streamMbps);
  const remainingStreams = Math.max(0, maxSimultaneousStreams - simultaneousStreams);
  if (viewersPerStream > requiredViewerLimit) {
    return { allowed: false, reason: 'viewer_limit_exceeded', streamMbps, safeMbps,
      maxSimultaneousStreams, remainingStreams };
  }
  return { allowed: remainingStreams > 0, reason: remainingStreams > 0 ? 'capacity_reserved' : 'network_capacity_exhausted',
    streamMbps, safeMbps, maxSimultaneousStreams, remainingStreams };
}
