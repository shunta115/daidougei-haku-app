import { useLang } from '../../../i18n/LangProvider'
import type { VenueArea } from '../../types'

type HomeVenuePanelProps = {
  venue: VenueArea
  onOpenMap: () => void
  onNearShows: () => void
}

export function HomeVenuePanel({ venue, onOpenMap, onNearShows }: HomeVenuePanelProps) {
  const { t, lang } = useLang()
  const name = lang === 'en' ? venue.nameEn || venue.nameJa : venue.nameJa

  return (
    <section className="fe-home-venue" aria-labelledby="fe-home-venue-h">
      <p className="fe-home-venue__k">
        <svg className="fe-home-venue__pin" width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M12 21s-7-4.35-7-10a7 7 0 1 1 14 0c0 5.65-7 10-7 10Z"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinejoin="round"
          />
          <circle cx="12" cy="11" r="2.2" stroke="currentColor" strokeWidth="1.8" />
        </svg>
        {lang === 'ja' ? '会場' : 'Venue'}
      </p>
      <h2 id="fe-home-venue-h" className="fe-home-venue__title">
        {name}
      </h2>
      {venue.blurbJa ? <p className="fe-home-venue__blurb">{lang === 'en' ? venue.blurbEn || venue.blurbJa : venue.blurbJa}</p> : null}
      <div className="fe-home-venue__actions">
        <button type="button" className="fe-home-venue__btn fe-home-venue__btn--primary" onClick={onOpenMap}>
          {t('venueMapSee')}
        </button>
        <button type="button" className="fe-home-venue__btn" onClick={onNearShows}>
          {t('fromHere')}
        </button>
      </div>
    </section>
  )
}
