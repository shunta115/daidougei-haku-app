import { expect, it } from 'vitest'
import { liveAudioSettings, liveAudioTestProfile } from '../src/platform/lib/liveAudioProfile'
it('offers a music candidate without assuming all audio processing must be disabled', () => {
  const p = liveAudioTestProfile('performance')
  expect(p.capture.echoCancellation).toBe(true); expect(p.capture.autoGainControl).toBe(true)
  expect(p.capture.noiseSuppression).toBe(false); expect(p.capture.voiceIsolation).toBe(false)
  expect(p.publish.audioPreset?.maxBitrate).toBe(96000); expect(p.publish.dtx).toBe(false)
})
it('separates raw comparison from speech', () => {
  expect(liveAudioTestProfile('unprocessed').capture.echoCancellation).toBe(false)
  expect(liveAudioTestProfile('speech').publish.audioPreset?.maxBitrate).toBe(48000)
  expect(liveAudioTestProfile('speech').publish.red).toBe(true)
})
it('reads the existing track without acquiring audio or inventing unsupported settings', () => {
  const settings = liveAudioSettings({ getSettings: () => ({ sampleRate: 44100, deviceId: 'secret' }), enabled: true, muted: false, readyState: 'live' } as MediaStreamTrack)
  expect(settings.sampleRate).toBe(44100); expect(settings.noiseSuppression).toBeNull()
  expect(JSON.stringify(settings)).not.toContain('secret')
})
