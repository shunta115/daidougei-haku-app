import type { Performer } from '../../types'
import { initials } from '../../lib/initials'
import { formatPerformerScheduleSummary } from '../../lib/performerScheduleLabel'
import { resolvePerformerPhotoUrl, shouldShowAsLiveStream } from '../../lib/streamPresence'
import { useLang } from '../../../i18n/LangProvider'

type HomeRecommendedRowProps = {
  performers: readonly Performer[]
  onOpenDetail: (id: string) => void
}

export function HomeRecommendedRow({ performers, onOpenDetail }: HomeRecommendedRowProps) {
  const { t } = useLang()
  if (!performers.length) return null

  return (
    <section className="fe-home-acts" aria-labelledby="fe-home-acts-h">
      <p className="fe-home-acts__k" lang="en">
        FEATURED
      </p>
      <h2 id="fe-home-acts-h" className="fe-home-acts__title">
        {t('featuredActs')}
      </h2>
      <div className="fe-home-acts__row" role="list">
        {performers.slice(0, 6).map((p) => {
          const photo = resolvePerformerPhotoUrl(p.photoUrl)
          const live = shouldShowAsLiveStream(p)
          return (
            <button
              key={p.id}
              type="button"
              role="listitem"
              className="fe-home-acts__card"
              onClick={() => onOpenDetail(p.id)}
            >
              <span
                className={`fe-home-acts__photo${photo ? ' fe-home-acts__photo--img' : ''}`}
                style={photo ? { backgroundImage: `url(${photo})` } : { background: p.gradient }}
              >
                {!photo ? initials(p.nameJa || p.name) : null}
                {live ? (
                  <span className="fe-home-acts__live" lang="en">
                    LIVE
                  </span>
                ) : null}
              </span>
              <span className="fe-home-acts__name">{p.nameJa || p.name}</span>
              <span className="fe-home-acts__genre">{p.genre ?? p.actJa}</span>
              <span className="fe-home-acts__when">{formatPerformerScheduleSummary(p.id)}</span>
            </button>
          )
        })}
      </div>
    </section>
  )
}
