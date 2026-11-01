import { AudioPresets, VideoPreset, VideoPresets } from 'livekit-client'

/** Three genuinely distinct layers for the existing 720-series Canvas source. */
export function liveStablePublish(mobile: boolean) {
  return {
    videoEncoding: {
      // Preserve top-layer headroom for moving performers; never raise existing ceilings.
      maxBitrate: mobile ? 2_500_000 : VideoPresets.h1080.encoding.maxBitrate,
      maxFramerate: 30,
    },
    videoSimulcastLayers: [VideoPresets.h360, new VideoPreset(854, 480, 900_000, 25)],
    // Same 48kbps payload ceiling as SDK defaults, higher transport priority where supported.
    audioPreset: { ...AudioPresets.music, priority: 'high' as const },
  }
}
