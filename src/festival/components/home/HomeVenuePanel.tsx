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
      <p className="fe-home-venue__k" lang="en">
        VENUE
      </p>
      <h2 id="fe-home-venue-h" className="fe-home-venue__title">
        {name}
      </h2>
      {venue.blurbJa ? <p className="fe-home-venue__blurb">{lang === 'en' ? venue.blurbEn || venue.blurbJa : venue.blurbJa}</p> : null}
      <div className="fe-home-venue__actions">
        <button type="button" className="fe-home-venue__btn fe-home-venue__btn--primary" onClick={onOpenMap}>
          {t('openMap')}
        </button>
        <button type="button" className="fe-home-venue__btn" onClick={onNearShows}>
          {t('nearby')}
        </button>
      </div>
    </section>
  )
}
