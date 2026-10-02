import { useEffect, useState, type CSSProperties } from 'react'
import { ArrowRight } from 'lucide-react'
import { BrandLogo } from '../../brand/BrandLogo'
import { useLang } from '../../i18n/LangProvider'

const HERO_POSTER = '/brand/haku-official.jpg'
const HERO_VIDEO = '/videos/splash.mp4'

export function SplashScreen({ onStart }: { onStart: () => void }) {
  const { t } = useLang()
  const [videoAvailable, setVideoAvailable] = useState(true)
  const [reduceMotion, setReduceMotion] = useState(false)

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => setReduceMotion(preference.matches)
    update()
    preference.addEventListener?.('change', update)
    return () => preference.removeEventListener?.('change', update)
  }, [])

  return (
    <main className="pl-splash" style={{ '--splash-image': `url(${HERO_POSTER})` } as CSSProperties}>
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
          poster={HERO_POSTER}
          onError={() => setVideoAvailable(false)}
          aria-hidden="true"
        >
          <source src={HERO_VIDEO} type="video/mp4" />
        </video>
      ) : null}
      <div className="pl-splash__shade" aria-hidden="true" />
      <section className="pl-splash__content">
        <BrandLogo size={104} variant="official" className="pl-splash__logo pl-splash__logo--official" />
        <h1>{t('splashLine1')}<br />{t('splashLine2')}</h1>
        <button type="button" onClick={onStart}>{t('start')} <ArrowRight size={19} /></button>
      </section>
    </main>
  )
}
