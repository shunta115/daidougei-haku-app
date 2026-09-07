import { useEffect, useState } from 'react'
import { PUBLIC_EVENT_META, type PublicEventMeta } from '../../data/public/eventMeta'
import { isSupabaseConfigured } from '../../../platform/lib/supabase'
import { getFeaturedEvent } from '../../../platform/lib/api'
import { useLang } from '../../../i18n/LangProvider'

export type HomeHeroStatus = 'live' | 'now' | 'soon'

type HomeEventOverviewProps = {
  heroPhotoUrl?: string
  status: HomeHeroStatus
  primaryLabel: string
  onPrimary: () => void
  onOpenTimetable: () => void
}

export function HomeEventOverview({
  heroPhotoUrl,
  status,
  primaryLabel,
  onPrimary,
  onOpenTimetable,
}: HomeEventOverviewProps) {
  const { t, lang } = useLang()
  const [meta, setMeta] = useState<PublicEventMeta>(PUBLIC_EVENT_META)

  useEffect(() => {
    if (!isSupabaseConfigured) return
    void getFeaturedEvent()
      .then((ev) => {
        if (!ev) return
        setMeta({
          eventNameJa: ev.name_ja,
          eventNameEn: ev.name_en,
          presenterJa: ev.presenter_ja,
          presenterEn: ev.presenter_en,
          dateLabel: ev.date_label,
          placeLabel: ev.place_label,
          hoursLabel: ev.hours_label,
          officialUrl: ev.official_url,
          weatherNote: ev.weather_note_ja,
          allowLivePill: true,
        })
      })
      .catch(() => undefined)
  }, [])

  const place = meta.placeLabel.trim()
  const hours = meta.hoursLabel.trim()
  const statusLabel = status === 'live' ? 'LIVE' : status === 'now' ? t('liveNow') : t('heroSoon')

  return (
    <section
      className={`fe-home-hero${heroPhotoUrl ? ' fe-home-hero--photo' : ''}`}
      aria-labelledby="fe-home-hero-title"
      style={
        heroPhotoUrl
          ? { backgroundImage: `url(${heroPhotoUrl})` }
          : undefined
      }
    >
      <div className="fe-home-hero__shade" aria-hidden="true" />
      <div className="fe-home-hero__body">
        <p className="fe-home-hero__brand">{t('appName')}</p>
        <p className={`fe-home-hero__status${status === 'live' ? ' fe-home-hero__status--live' : ''}`}>{statusLabel}</p>
        <h1 id="fe-home-hero-title" className="fe-home-hero__title">
          {lang === 'en' ? meta.eventNameEn : meta.eventNameJa}
        </h1>
        <p className="fe-home-hero__meta">
          <span>{meta.dateLabel || t('datesPending')}</span>
          {place ? <span className="fe-home-hero__dot">·</span> : null}
          {place ? <span>{place}</span> : null}
        </p>
        {hours ? <p className="fe-home-hero__hours">{hours}</p> : null}
        <div className="fe-home-hero__actions">
          <button type="button" className="fe-home-hero__cta" onClick={onPrimary}>
            {primaryLabel}
          </button>
          <button type="button" className="fe-home-hero__ghost" onClick={onOpenTimetable}>
            {t('timetableTitle')}
          </button>
        </div>
      </div>
    </section>
  )
}
