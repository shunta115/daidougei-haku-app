import { useEffect, useState, type RefObject } from 'react'

/** Observe actual video pixel aspect; defaults to 9:16 until metadata loads. */
export function useVideoAspect(videoRef: RefObject<HTMLVideoElement | null>, fallback = 9 / 16) {
  const [ratio, setRatio] = useState(fallback)
  const [orientation, setOrientation] = useState<'portrait' | 'landscape' | 'square'>(
    fallback < 1 ? 'portrait' : fallback > 1 ? 'landscape' : 'square',
  )

  useEffect(() => {
    let observed: HTMLVideoElement | null = null
    const detach = () => {
      observed?.removeEventListener('loadedmetadata', read)
      observed?.removeEventListener('resize', read)
    }
    const read = () => {
      const video = videoRef.current
      if (video !== observed) {
        detach()
        observed = video
        video?.addEventListener('loadedmetadata', read)
        video?.addEventListener('resize', read)
      }
      if (!video?.videoWidth || !video.videoHeight) return
      const r = video.videoWidth / video.videoHeight
      setRatio(r)
      setOrientation(r > 1.05 ? 'landscape' : r < 0.95 ? 'portrait' : 'square')
    }
    read()
    // The watch screen mounts its video after asynchronous performer loading.
    const id = window.setInterval(read, 500)
    return () => {
      detach()
      window.clearInterval(id)
    }
  }, [videoRef])

  return { ratio, orientation, cssAspect: `${ratio}` }
}
