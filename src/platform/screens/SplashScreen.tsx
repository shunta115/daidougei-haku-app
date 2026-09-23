import { useEffect, useState, type CSSProperties } from 'react'
import { ArrowRight } from 'lucide-react'
import { BrandLogo } from '../../brand/BrandLogo'
import { searchPerformers } from '../lib/api'

export function SplashScreen({ onStart }: { onStart: () => void }) {
  const [image, setImage] = useState<string | null>(null)
  const [videoAvailable, setVideoAvailable] = useState(true)
  const [reduceMotion, setReduceMotion] = useState(false)

  useEffect(() => {
    let active = true
    void searchPerformers('')
      .then((rows) => {
        const photo = rows.find((row) => row.is_live && row.photo_url)?.photo_url ?? rows.find((row) => row.photo_url)?.photo_url
        if (active && photo) setImage(photo)
      })
      .catch(() => undefined)
    return () => { active = false }
  }, [])

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => setReduceMotion(preference.matches)
    update()
    preference.addEventListener?.('change', update)
    return () => preference.removeEventListener?.('change', update)
  }, [])

  return (
    <main className="pl-splash" style={{ '--splash-image': image ? `url(${image})` : 'none' } as CSSProperties}>
      <div className="pl-splash__ambient" aria-hidden="true" />
      <div className="pl-splash__media" aria-hidden="true" />
      {videoAvailable && !reduceMotion ? (
        <video
          className="pl-splash__video"
          autoPlay
          muted
          playsInline
          loop
          preload="metadata"
          poster={image ?? undefined}
          onError={() => setVideoAvailable(false)}
          aria-hidden="true"
        >
          <source src="/videos/splash.mp4" type="video/mp4" />
        </video>
      ) : null}
      <div className="pl-splash__shade" aria-hidden="true" />
      <section className="pl-splash__content">
        <BrandLogo size={44} variant="lockup" className="pl-splash__logo" />
        <h1>街は、<br />ステージになる。</h1>
        <button type="button" onClick={onStart}>はじめる <ArrowRight size={19} /></button>
      </section>
    </main>
  )
}
