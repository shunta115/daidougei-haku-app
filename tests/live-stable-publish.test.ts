import { expect, it } from 'vitest'
import { VideoPreset, VideoPresets } from 'livekit-client'
import { liveStablePublish } from '../src/platform/lib/liveStablePublish'
import { computeVideoEncodings } from '../node_modules/livekit-client/src/room/participant/publishUtils'

it.each([[1280,720], [720,1280]])('uses the installed SDK to verify distinct layers for %sx%s', (width, height) => {
  const before = computeVideoEncodings(false, width, height, {
    simulcast: true, videoEncoding: { maxBitrate: 2500000, maxFramerate: 30 },
    videoSimulcastLayers: [new VideoPreset(854,480,900000,30), VideoPresets.h720],
  })
  const after = computeVideoEncodings(false, width, height, { simulcast: true, ...liveStablePublish(true) })
  expect(before.map(e=>e.scaleResolutionDownBy)).toEqual([1.5,1,1])
  expect(after.map(e=>e.scaleResolutionDownBy)).toEqual([2,1.5,1])
  expect(after.map(e=>e.maxFramerate)).toEqual([20,25,30])
  expect(before.reduce((sum,e)=>sum+(e.maxBitrate??0),0)).toBe(5100000)
  expect(after.reduce((sum,e)=>sum+(e.maxBitrate??0),0)).toBe(3850000)
})
it('preserves top quality and audio bitrate while raising audio transport priority', () => {
  expect(liveStablePublish(true).videoEncoding.maxBitrate).toBe(2500000)
  expect(liveStablePublish(false).videoEncoding.maxBitrate).toBe(3000000)
  expect(liveStablePublish(true).audioPreset).toEqual({maxBitrate:48000,priority:'high'})
})
