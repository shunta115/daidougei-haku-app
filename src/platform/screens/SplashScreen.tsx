import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { ArrowRight } from 'lucide-react'
import { BrandLogo } from '../../brand/BrandLogo'
import { useLang } from '../../i18n/LangProvider'

const HERO_POSTER = '/brand/haku-official.jpg'
const HERO_2024 = '/videos/haku-2024.mp4'
const HERO_2025 = '/videos/haku-2025.mp4'

export function SplashScreen({ onStart }: { onStart: () => void }) {
  const { t } = useLang()
  const firstRef = useRef<HTMLVideoElement>(null)
  const secondRef = useRef<HTMLVideoElement>(null)
  const [active, setActive] = useState(0)
  const [loadSecond, setLoadSecond] = useState(false)
  const [firstFailed, setFirstFailed] = useState(false)
  const [reduceMotion, setReduceMotion] = useState(false)

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => setReduceMotion(preference.matches)
    update()
    preference.addEventListener?.('change', update)
    return () => preference.removeEventListener?.('change', update)
  }, [])

  const playIndex = (index: number) => {
    const current = index === 0 ? firstRef.current : secondRef.current
    const other = index === 0 ? secondRef.current : firstRef.current
    if (!current) return
    other?.pause()
    try { current.currentTime = 0 } catch { /* ignore seek before ready */ }
    void current.play().catch(() => {
      if (index === 0) setFirstFailed(true)
    })
    setActive(index)
  }

  const showVideo = !reduceMotion && !firstFailed

  return (
    <main className="pl-splash" style={{ '--splash-image': `url(${HERO_POSTER})` } as CSSProperties}>
      <div className="pl-splash__ambient" aria-hidden="true" />
      <div className="pl-splash__media" aria-hidden="true" />
      {showVideo ? (
        <>
          <video
            ref={firstRef}
            className={`pl-splash__video${active === 0 ? ' pl-splash__video--on' : ''}`}
            autoPlay
            muted
            playsInline
            preload="auto"
            poster={HERO_POSTER}
            src={HERO_2024}
            onPlaying={() => setLoadSecond(true)}
            onEnded={() => {
              if (secondRef.current) playIndex(1)
              else playIndex(0)
            }}
            onError={() => setFirstFailed(true)}
            aria-hidden="true"
          />
          {loadSecond ? (
            <video
              ref={secondRef}
              className={`pl-splash__video${active === 1 ? ' pl-splash__video--on' : ''}`}
              muted
              playsInline
              preload="auto"
              src={HERO_2025}
              onEnded={() => playIndex(0)}
              onError={() => playIndex(0)}
              aria-hidden="true"
            />
          ) : null}
        </>
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
