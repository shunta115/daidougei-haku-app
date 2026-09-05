import { useEffect, useState } from 'react'
import { PLATFORM_PATH, openPlatform, spaGo } from '../../../app/routes'
import { PUBLIC_EVENT_META, type PublicEventMeta } from '../../data/public/eventMeta'
import { isSupabaseConfigured } from '../../../platform/lib/supabase'
import { getFeaturedEvent } from '../../../platform/lib/api'
import { useAuth } from '../../../platform/lib/auth'
import { useLang } from '../../../i18n/LangProvider'

type HomeEventOverviewProps = {
  onOpenTimetable: () => void
  onOpenPerformers?: () => void
}

export function HomeEventOverview({ onOpenTimetable, onOpenPerformers }: HomeEventOverviewProps) {
  const { user } = useAuth()
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
  const official = meta.officialUrl.trim()

  return (
    <section className="fe-home-overview" aria-labelledby="fe-home-overview-title">
      <p className="fe-home-overview__k" lang="en">
        {t('nextEvent')}
      </p>
      <h2 id="fe-home-overview-title" className="fe-home-overview__title">
        {lang === 'en' ? meta.eventNameEn : meta.eventNameJa}
      </h2>
      <p className="fe-home-overview__en" lang="en">
        {lang === 'en' ? meta.eventNameJa : meta.eventNameEn}
      </p>
      <p className="fe-home-overview__presenter">{lang === 'en' ? meta.presenterEn : meta.presenterJa}</p>
      <p className="fe-home-overview__dates">{meta.dateLabel || t('datesPending')}</p>
      {place ? <p className="fe-home-overview__place">{place}</p> : null}
      {hours ? <p className="fe-home-overview__hours">{hours}</p> : null}
      <p className="fe-home-overview__note">{meta.weatherNote}</p>
      <div className="fe-home-overview__actions">
        <button type="button" className="fe-h6-maprow__primary" onClick={onOpenTimetable}>
          {t('timetableTitle')}
        </button>
        {onOpenPerformers ? (
          <button type="button" className="fe-h6-maprow__ghost" onClick={onOpenPerformers}>
            {t('findActs')}
          </button>
        ) : null}
        <button type="button" className="fe-h6-maprow__ghost" onClick={() => (user ? spaGo(PLATFORM_PATH) : openPlatform('?auth=1'))}>
          {t('live')} · {t('tip')}
        </button>
      </div>
      {official ? (
        <p className="fe-home-overview__official">
          <a href={official} target="_blank" rel="noopener noreferrer">
            {t('officialSite')}
          </a>
        </p>
      ) : null}
    </section>
  )
}
