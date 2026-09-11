import type { Performer } from '../../types'
import { initials } from '../../lib/initials'
import { formatPerformerScheduleSummary } from '../../lib/performerScheduleLabel'
import { resolvePerformerPhotoUrl, shouldShowAsLiveStream } from '../../lib/streamPresence'
import { useLang } from '../../../i18n/LangProvider'

type HomeRecommendedRowProps = {
  performers: readonly Performer[]
  onOpenDetail: (id: string) => void
  onSupport?: (id: string) => void
  onWatch?: (id: string) => void
}

export function HomeRecommendedRow({ performers, onOpenDetail, onSupport, onWatch }: HomeRecommendedRowProps) {
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
            <article
              key={p.id}
              role="listitem"
              className="fe-home-acts__card"
            >
              <button
                type="button"
                className={`fe-home-acts__photo${photo ? ' fe-home-acts__photo--img' : ''}`}
                style={photo ? { backgroundImage: `url(${photo})` } : { background: p.gradient }}
                aria-label={`${p.nameJa || p.name}の詳細を見る`}
                onClick={() => onOpenDetail(p.id)}
              >
                {!photo ? initials(p.nameJa || p.name) : null}
                {live ? (
                  <span className="fe-home-acts__live" lang="en">
                    LIVE
                  </span>
                ) : null}
              </button>
              <button type="button" className="fe-home-acts__name" onClick={() => onOpenDetail(p.id)}>
                {p.nameJa || p.name}
              </button>
              <span className="fe-home-acts__genre">{p.genre ?? p.actJa}</span>
              <span className="fe-home-acts__when">{formatPerformerScheduleSummary(p.id)}</span>
              <div className="fe-home-acts__actions">
                <button type="button" onClick={() => (live && onWatch ? onWatch(p.id) : onOpenDetail(p.id))}>
                  見る
                </button>
                <button type="button" onClick={() => onOpenDetail(p.id)}>
                  フォロー
                </button>
                {onSupport ? (
                  <button type="button" onClick={() => onSupport(p.id)}>
                    応援
                  </button>
                ) : null}
              </div>
            </article>
          )
        })}
      </div>
    </section>
  )
}
