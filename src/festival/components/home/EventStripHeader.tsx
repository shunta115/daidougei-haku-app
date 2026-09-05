import { BrandLogo } from '../../../brand/BrandLogo'
import { getEventHeaderMeta } from '../../services/festivalRepository'
import { useLang } from '../../../i18n/LangProvider'

type EventStripHeaderProps = {
  onShare: () => void
  hasActiveLiveShow?: boolean
}

export function EventStripHeader({ onShare, hasActiveLiveShow = false }: EventStripHeaderProps) {
  const meta = getEventHeaderMeta(hasActiveLiveShow)
  const { t } = useLang()

  return (
    <header className="fe-strip">
      <div className="fe-strip__brand">
        <BrandLogo size={22} />
        <span className="fe-strip__name">{t('appName')}</span>
        {meta.showLivePill ? <span className="fe-strip__pill">LIVE</span> : null}
      </div>
      <div className="fe-strip__meta">
        <span>{meta.dateLabel}</span>
        {meta.placeLabel ? (
          <>
            <span className="fe-strip__sep">·</span>
            <span>{meta.placeLabel}</span>
          </>
        ) : null}
      </div>
      <button type="button" className="fe-strip__share" onClick={() => void onShare()} aria-label="シェア">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8M16 6l-4-4-4 4M12 2v14"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
    </header>
  )
}
