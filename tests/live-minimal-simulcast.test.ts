import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import { VideoPreset, VideoPresets } from 'livekit-client'
import { computeVideoEncodings } from '../node_modules/livekit-client/src/room/participant/publishUtils'
const source = readFileSync(new URL('../src/platform/lib/livekit.ts', import.meta.url), 'utf8')
// Read the production declaration without exporting another runtime API.
const layerNames = source.match(/videoSimulcastLayers:\s*\[([^\]]+)\]/)![1].split(',').map(s => s.trim())
const preset480 = source.match(/const VideoPreset480p = new VideoPreset\(([^)]+)\)/)![1].split(',').map(s => Number(s.trim().replaceAll('_', '')))
const layers = layerNames.map(name => {
  if (name === 'VideoPresets.h360') return VideoPresets.h360
  if (name === 'VideoPresets.h720') return VideoPresets.h720
  if (name === 'VideoPreset480p') return new VideoPreset(preset480[0], preset480[1], preset480[2], preset480[3])
  throw new Error(`Unexpected simulcast layer: ${name}`)
})
it.each([[1280, 720, 2500000], [720, 1280, 2500000], [1280, 720, 3000000], [720, 1280, 3000000]])('avoids duplicate 720p with installed SDK: %sx%s at %s bps', (width, height, maxBitrate) => {
  const encodings = computeVideoEncodings(false, width, height, { simulcast: true, videoEncoding: { maxBitrate, maxFramerate: 30 }, videoSimulcastLayers: layers })
  expect(encodings.map(e => e.scaleResolutionDownBy)).toEqual([2, 1.5, 1])
  expect(encodings.map(e => e.maxFramerate)).toEqual([20, 30, 30])
  expect(encodings.reduce((sum, e) => sum + (e.maxBitrate ?? 0), 0)).toBe(maxBitrate + 1350000)
})
