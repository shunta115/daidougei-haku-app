import { getCatalogVenues } from '../../../catalog/liveCatalog'
import { enableMockCrowdLevels } from '../../config/runtimeConfig'
import type { VenueArea } from '../../types'

type HomeCrowdStripProps = {
  hotVenueId?: string
  onOpenMap: () => void
}

function crowdLabel(crowd: VenueArea['crowd']) {
  switch (crowd) {
    case 'high':
      return '高'
    case 'mid':
      return '中'
    case 'low':
      return '低'
    default:
      return '—'
  }
}

export function HomeCrowdStrip({ hotVenueId, onOpenMap }: HomeCrowdStripProps) {
  const venues = getCatalogVenues()

  return (
    <section className="fe-h6-crowd" aria-label="会場">
      <div className="fe-h6-crowd__head">
        <h2 className="fe-h6-crowd__title">{enableMockCrowdLevels ? '会場の混雑度' : '会場'}</h2>
        <button type="button" className="fe-h6-crowd__link" onClick={onOpenMap}>
          マップ
        </button>
      </div>
      {venues.length === 0 ? (
        <p className="fe-h6-crowd__hint">会場情報は準備中です</p>
      ) : (
        <>
          <div className="fe-h6-crowd__row" role="list">
            {venues.map((v) => (
              <button
                key={v.id}
                type="button"
                role="listitem"
                className={`fe-h6-crowd__chip${v.id === hotVenueId ? ' fe-h6-crowd__chip--hot' : ''}`}
                onClick={onOpenMap}
              >
                <span className="fe-h6-crowd__name">{v.nameJa}</span>
                {enableMockCrowdLevels ? (
                  <span className="fe-h6-crowd__lv" aria-label={`混雑 ${crowdLabel(v.crowd)}`}>
                    {crowdLabel(v.crowd)}
                  </span>
                ) : null}
              </button>
            ))}
          </div>
          <p className="fe-h6-crowd__hint">{enableMockCrowdLevels ? '低 · 中 · 高 — デモデータ。タップでマップへ' : 'タップでマップへ'}</p>
        </>
      )}
    </section>
  )
}
