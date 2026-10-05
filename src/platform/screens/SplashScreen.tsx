import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { ArrowRight, Volume2, VolumeX } from 'lucide-react'
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
  const [muted, setMuted] = useState(true)

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

  const enableSound = async () => {
    const current = active === 0 ? firstRef.current : secondRef.current
    if (!current) return
    current.muted = false
    try { await current.play(); setMuted(false) } catch { current.muted = true; setMuted(true) }
  }

  const showVideo = !reduceMotion && !firstFailed

  return (
    <main className="pl-splash" style={{ '--splash-image': `url(${HERO_POSTER})` } as CSSProperties}>
      <div className="pl-splash__ambient" aria-hidden="true" />
      <div className="pl-splash__media" aria-hidden="true" />
      {showVideo ? (
        <div className="pl-splash__stage pl-splash__stage--on" aria-hidden="true">
          <video
            ref={firstRef}
            className={`pl-splash__video${active === 0 ? ' pl-splash__video--on' : ''}`}
            autoPlay
            muted={muted}
            playsInline
            preload="auto"
            src={HERO_2024}
            onPlaying={() => {
              setLoadSecond(true)
            }}
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
              muted={muted}
              playsInline
              preload="auto"
              src={HERO_2025}
              onEnded={() => playIndex(0)}
              onError={() => playIndex(0)}
              aria-hidden="true"
            />
          ) : null}
        </div>
      ) : null}
      {showVideo ? <button type="button" className="pl-splash__sound" onClick={() => muted ? void enableSound() : setMuted(true)} aria-label={muted ? '音声をオンにする' : '音声をオフにする'}>{muted ? <Volume2 size={16} /> : <VolumeX size={16} />}{muted ? '音声ON' : '音声OFF'}</button> : null}
      <div className="pl-splash__shade" aria-hidden="true" />
      <section className="pl-splash__content">
        <BrandLogo size={104} variant="official" className="pl-splash__logo pl-splash__logo--official" />
        <h1>{t('splashLine1')}<br />{t('splashLine2')}</h1>
        <button type="button" onClick={onStart}>{t('start')} <ArrowRight size={19} /></button>
      </section>
    </main>
  )
}
