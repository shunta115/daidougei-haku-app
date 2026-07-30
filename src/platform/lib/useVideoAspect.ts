import { useEffect, useState, type RefObject } from 'react'

/** Observe actual video pixel aspect; defaults to 9:16 until metadata loads. */
export function useVideoAspect(videoRef: RefObject<HTMLVideoElement | null>, fallback = 9 / 16) {
  const [ratio, setRatio] = useState(fallback)
  const [orientation, setOrientation] = useState<'portrait' | 'landscape' | 'square'>(
    fallback < 1 ? 'portrait' : fallback > 1 ? 'landscape' : 'square',
  )

  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    const read = () => {
      const w = video.videoWidth
      const h = video.videoHeight
      if (!w || !h) return
      const r = w / h
      setRatio(r)
      setOrientation(r > 1.05 ? 'landscape' : r < 0.95 ? 'portrait' : 'square')
    }

    read()
    video.addEventListener('loadedmetadata', read)
    video.addEventListener('resize', read)
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => read()) : null
    ro?.observe(video)
    const id = window.setInterval(read, 2000)
    return () => {
      video.removeEventListener('loadedmetadata', read)
      video.removeEventListener('resize', read)
      ro?.disconnect()
      window.clearInterval(id)
    }
  }, [videoRef])

  return { ratio, orientation, cssAspect: `${ratio}` }
}
