import { AudioPresets, type AudioCaptureOptions, type TrackPublishOptions } from 'livekit-client'
export type LiveAudioTestMode = 'speech' | 'performance' | 'unprocessed'
/** A/B candidates, not a validated optimum. Applied only before initial capture in local TEST. */
export function liveAudioTestProfile(mode: LiveAudioTestMode): {
  capture: AudioCaptureOptions; publish: TrackPublishOptions
} {
  const speech = mode === 'speech'
  const raw = mode === 'unprocessed'
  return {
    capture: {
      sampleRate: { ideal: 48_000 }, channelCount: 1,
      echoCancellation: !raw, autoGainControl: !raw,
      noiseSuppression: speech, voiceIsolation: speech,
    },
    publish: {
      audioPreset: { ...(speech ? AudioPresets.music : AudioPresets.musicHighQuality), priority: 'high' },
      dtx: speech, red: true, forceStereo: false,
    },
  }
}
export function liveAudioSettings(track: MediaStreamTrack) {
  const s = track.getSettings() as MediaTrackSettings & { voiceIsolation?: boolean }
  return {
    sampleRate: s.sampleRate ?? null, channelCount: s.channelCount ?? null,
    echoCancellation: s.echoCancellation ?? null, autoGainControl: s.autoGainControl ?? null,
    noiseSuppression: s.noiseSuppression ?? null, voiceIsolation: s.voiceIsolation ?? null,
    muted: track.muted, enabled: track.enabled, readyState: track.readyState,
  }
}
