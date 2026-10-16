import { Track, type TrackProcessor, type VideoProcessorOptions } from 'livekit-client'

export const LIVE_OUTPUT_WIDTH = 720
export const LIVE_OUTPUT_HEIGHT = 1280

export type LiveVideoOrientation = 'portrait' | 'landscape'

export function liveOutputSize(orientation: LiveVideoOrientation) {
  return orientation === 'portrait'
    ? { width: LIVE_OUTPUT_WIDTH, height: LIVE_OUTPUT_HEIGHT }
    : { width: LIVE_OUTPUT_HEIGHT, height: LIVE_OUTPUT_WIDTH }
}

export function currentLiveVideoOrientation(): LiveVideoOrientation {
  if (typeof window === 'undefined') return 'portrait'
  return window.innerWidth > window.innerHeight ? 'landscape' : 'portrait'
}

export type DrawRect = { x: number; y: number; width: number; height: number }

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

/**
 * Produces a stable 9:16 LiveKit sender track while preserving the complete
 * camera frame. Only the dim background fill is cropped; the foreground is
 * always contained and never stretched.
 */
export class PortraitContainProcessor implements TrackProcessor<Track.Kind.Video, VideoProcessorOptions> {
  readonly name = 'haku-portrait-contain'
  processedTrack?: MediaStreamTrack

  private canvas?: HTMLCanvasElement
  private context?: CanvasRenderingContext2D
  private element?: HTMLVideoElement
  private animationFrame?: number

  async init(options: VideoProcessorOptions) {
    if (!(options.element instanceof HTMLVideoElement)) throw new Error('video_processor_element_unavailable')
    const canvas = document.createElement('canvas')
    const output = liveOutputSize(currentLiveVideoOrientation())
    canvas.width = output.width
    canvas.height = output.height
    const context = canvas.getContext('2d', { alpha: false })
    if (!context || typeof canvas.captureStream !== 'function') throw new Error('canvas_capture_unavailable')

    this.canvas = canvas
    this.context = context
    this.element = options.element
    this.element.playsInline = true
    this.processedTrack = canvas.captureStream(30).getVideoTracks()[0]
    this.draw()
  }

  async restart(options: VideoProcessorOptions) {
    if (options.element instanceof HTMLVideoElement) {
      this.element = options.element
      this.element.playsInline = true
    }
  }

  async destroy() {
    if (this.animationFrame != null) cancelAnimationFrame(this.animationFrame)
    this.animationFrame = undefined
    this.processedTrack?.stop()
    this.processedTrack = undefined
    this.element = undefined
    this.context = undefined
    this.canvas = undefined
  }

  private draw = () => {
    const canvas = this.canvas
    const context = this.context
    const video = this.element
    if (!canvas || !context || !video) return

    const sourceWidth = video.videoWidth
    const sourceHeight = video.videoHeight
    const output = liveOutputSize(currentLiveVideoOrientation())
    if (canvas.width !== output.width || canvas.height !== output.height) {
      canvas.width = output.width
      canvas.height = output.height
    }
    context.fillStyle = '#050608'
    context.fillRect(0, 0, canvas.width, canvas.height)

    if (sourceWidth > 0 && sourceHeight > 0 && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
      const background = coveredRect(sourceWidth, sourceHeight, canvas.width, canvas.height)
      context.save()
      // Keep the fill inexpensive on mobile Safari. It is decorative only;
      // the uncropped foreground below is the actual program image.
      context.globalAlpha = 0.2
      context.drawImage(video, background.x, background.y, background.width, background.height)
      context.restore()

      const foreground = containedRect(sourceWidth, sourceHeight, canvas.width, canvas.height)
      context.drawImage(video, foreground.x, foreground.y, foreground.width, foreground.height)
    }

    this.animationFrame = requestAnimationFrame(this.draw)
  }
}

export function canComposePortraitVideo() {
  return typeof document !== 'undefined' &&
    typeof HTMLCanvasElement !== 'undefined' &&
    typeof HTMLCanvasElement.prototype.captureStream === 'function'
}
