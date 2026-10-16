import { Track, type TrackProcessor, type VideoProcessorOptions } from 'livekit-client'
import { detectLiveVideoOrientation, type LiveVideoOrientation } from './liveOrientation'

export type { LiveVideoOrientation } from './liveOrientation'

export const LIVE_OUTPUT_WIDTH = 720
export const LIVE_OUTPUT_HEIGHT = 1280
export type DrawRect = { x: number; y: number; width: number; height: number }

export function liveOutputSize(orientation: LiveVideoOrientation) {
  return orientation === 'portrait'
    ? { width: LIVE_OUTPUT_WIDTH, height: LIVE_OUTPUT_HEIGHT }
    : { width: LIVE_OUTPUT_HEIGHT, height: LIVE_OUTPUT_WIDTH }
}

export function currentLiveVideoOrientation(): LiveVideoOrientation {
  return detectLiveVideoOrientation()
}

export function containedRect(sourceWidth: number, sourceHeight: number, targetWidth: number, targetHeight: number): DrawRect {
  const scale = Math.min(targetWidth / sourceWidth, targetHeight / sourceHeight)
  const width = sourceWidth * scale
  const height = sourceHeight * scale
  return { x: (targetWidth - width) / 2, y: (targetHeight - height) / 2, width, height }
}

export function coveredRect(sourceWidth: number, sourceHeight: number, targetWidth: number, targetHeight: number): DrawRect {
  const scale = Math.max(targetWidth / sourceWidth, targetHeight / sourceHeight)
  const width = sourceWidth * scale
  const height = sourceHeight * scale
  return { x: (targetWidth - width) / 2, y: (targetHeight - height) / 2, width, height }
}

type FrameVideo = Pick<HTMLVideoElement, 'currentTime' | 'play' | 'readyState'> & {
  requestVideoFrameCallback?: (callback: VideoFrameRequestCallback) => number
  cancelVideoFrameCallback?: (handle: number) => void
}

function delay(ms: number) {
  return new Promise<void>((resolve) => globalThis.setTimeout(resolve, ms))
}

export async function resumeProcessorVideo(video: FrameVideo) {
  try {
    await video.play()
  } catch (error) {
    if (!(error instanceof DOMException) || error.name !== 'AbortError') throw error
    await delay(100)
    await video.play()
  }
}

/** Resolve only after genuinely new video frames arrive, never from a cached still. */
export function waitForVideoFrameAdvance(video: FrameVideo, minimumFrames = 2, timeoutMs = 2_500) {
  return new Promise<number>((resolve, reject) => {
    let frames = 0
    let frameHandle: number | undefined
    let timer: number | undefined
    let pollTimer: number | undefined
    let settled = false
    const cleanup = () => {
      if (timer != null) globalThis.clearTimeout(timer)
      if (pollTimer != null) globalThis.clearInterval(pollTimer)
      if (frameHandle != null) video.cancelVideoFrameCallback?.(frameHandle)
    }
    const finish = () => {
      if (settled) return
      settled = true
      cleanup()
      resolve(frames)
    }
    const fail = () => {
      if (settled) return
      settled = true
      cleanup()
      reject(new Error('video_frames_not_advancing'))
    }

    timer = globalThis.setTimeout(fail, timeoutMs) as unknown as number
    if (video.requestVideoFrameCallback) {
      const next = () => {
        frames += 1
        if (frames >= minimumFrames) finish()
        else frameHandle = video.requestVideoFrameCallback?.(next)
      }
      frameHandle = video.requestVideoFrameCallback(next)
      return
    }

    let lastTime = video.currentTime
    pollTimer = globalThis.setInterval(() => {
      if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || video.currentTime === lastTime) return
      lastTime = video.currentTime
      frames += 1
      if (frames >= minimumFrames) finish()
    }, 50) as unknown as number
  })
}

/**
 * Produces a fixed 9:16 or 16:9 LiveKit sender track while preserving the
 * complete camera frame. Safari does not reliably update captureStream track
 * dimensions after resizing a canvas, so orientation is immutable per instance.
 */
export class PortraitContainProcessor implements TrackProcessor<Track.Kind.Video, VideoProcessorOptions> {
  readonly name = 'haku-orientation-contain'
  readonly orientation: LiveVideoOrientation
  processedTrack?: MediaStreamTrack

  private canvas?: HTMLCanvasElement
  private context?: CanvasRenderingContext2D
  private element?: HTMLVideoElement
  private animationFrame?: number
  private videoFrame?: number
  private renderedFrames = 0

  constructor(orientation: LiveVideoOrientation = currentLiveVideoOrientation()) {
    this.orientation = orientation
  }

  async init(options: VideoProcessorOptions) {
    if (!(options.element instanceof HTMLVideoElement)) throw new Error('video_processor_element_unavailable')
    const canvas = document.createElement('canvas')
    const output = liveOutputSize(this.orientation)
    canvas.width = output.width
    canvas.height = output.height
    const context = canvas.getContext('2d', { alpha: false })
    if (!context || typeof canvas.captureStream !== 'function') throw new Error('canvas_capture_unavailable')

    this.canvas = canvas
    this.context = context
    this.element = options.element
    this.element.playsInline = true
    this.processedTrack = canvas.captureStream(30).getVideoTracks()[0]
    this.scheduleDraw()
  }

  async restart(options: VideoProcessorOptions) {
    if (!(options.element instanceof HTMLVideoElement)) throw new Error('video_processor_element_unavailable')
    this.cancelDraw()
    this.element = options.element
    this.element.playsInline = true
    await resumeProcessorVideo(this.element)
    await waitForVideoFrameAdvance(this.element)
    this.drawFrame()
    this.scheduleDraw()
  }

  async waitForFrameAdvance(minimumFrames = 2, timeoutMs = 2_500) {
    const start = this.renderedFrames
    const startedAt = Date.now()
    while (this.renderedFrames - start < minimumFrames) {
      if (Date.now() - startedAt >= timeoutMs) throw new Error('canvas_frames_not_advancing')
      await delay(25)
    }
    return this.renderedFrames - start
  }

  async destroy() {
    this.cancelDraw()
    this.processedTrack?.stop()
    this.processedTrack = undefined
    this.element = undefined
    this.context = undefined
    this.canvas = undefined
  }

  private cancelDraw() {
    if (this.animationFrame != null) cancelAnimationFrame(this.animationFrame)
    if (this.videoFrame != null) this.element?.cancelVideoFrameCallback?.(this.videoFrame)
    this.animationFrame = undefined
    this.videoFrame = undefined
  }

  private scheduleDraw = () => {
    const video = this.element
    if (!video) return
    if (video.requestVideoFrameCallback) {
      this.videoFrame = video.requestVideoFrameCallback(() => {
        this.drawFrame()
        this.scheduleDraw()
      })
      return
    }
    this.animationFrame = requestAnimationFrame(() => {
      this.drawFrame()
      this.scheduleDraw()
    })
  }

  private drawFrame() {
    const canvas = this.canvas
    const context = this.context
    const video = this.element
    if (!canvas || !context || !video) return
    const sourceWidth = video.videoWidth
    const sourceHeight = video.videoHeight
    context.fillStyle = '#050608'
    context.fillRect(0, 0, canvas.width, canvas.height)

    if (sourceWidth > 0 && sourceHeight > 0 && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
      const background = coveredRect(sourceWidth, sourceHeight, canvas.width, canvas.height)
      context.save()
      context.globalAlpha = 0.2
      context.drawImage(video, background.x, background.y, background.width, background.height)
      context.restore()
      const foreground = containedRect(sourceWidth, sourceHeight, canvas.width, canvas.height)
      context.drawImage(video, foreground.x, foreground.y, foreground.width, foreground.height)
      this.renderedFrames += 1
    }
  }
}

export function canComposePortraitVideo() {
  return typeof document !== 'undefined' &&
    typeof HTMLCanvasElement !== 'undefined' &&
    typeof HTMLCanvasElement.prototype.captureStream === 'function'
}
