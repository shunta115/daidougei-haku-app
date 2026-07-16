import { VENUE_AREAS } from '../../data/scheduleData'
import { enableMockCrowdLevels, isPublicMode } from '../../config/runtimeConfig'
import { PUBLIC_EVENT_COPY } from '../../services/festivalRepository'
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
  if (!VENUE_AREAS.length || !enableMockCrowdLevels) {
    return (
      <section className="fe-h6-crowd" aria-label="会場の混雑度">
        <div className="fe-h6-crowd__head">
          <h2 className="fe-h6-crowd__title">会場の混雑度</h2>
        </div>
        <p className="fe-h6-crowd__hint">
          {isPublicMode ? PUBLIC_EVENT_COPY.venuePending : '混雑度データはありません'}
        </p>
      </section>
    )
  }

  return (
    <section className="fe-h6-crowd" aria-label="会場の混雑度">
      <div className="fe-h6-crowd__head">
        <h2 className="fe-h6-crowd__title">会場の混雑度</h2>
        <button type="button" className="fe-h6-crowd__link" onClick={onOpenMap}>
          マップ
        </button>
      </div>
      <div className="fe-h6-crowd__row" role="list">
        {VENUE_AREAS.map((v) => (
          <button
            key={v.id}
            type="button"
            role="listitem"
            className={`fe-h6-crowd__chip fe-h6-crowd__chip--${v.crowd ?? 'mid'}${v.id === hotVenueId ? ' fe-h6-crowd__chip--hot' : ''}`}
            onClick={onOpenMap}
          >
            <span className="fe-h6-crowd__name">{v.nameJa}</span>
            <span className="fe-h6-crowd__lv" aria-label={`混雑 ${crowdLabel(v.crowd)}`}>
              {crowdLabel(v.crowd)}
            </span>
          </button>
        ))}
      </div>
      <p className="fe-h6-crowd__hint">低 · 中 · 高 — デモデータ。タップでマップへ</p>
    </section>
  )
}
