type EventStripHeaderProps = {
  onShare: () => void
}

/** LP的ヒーローを避け、ネイティブ風の極薄ヘッダ */
export function EventStripHeader({ onShare }: EventStripHeaderProps) {
  return (
    <header className="fe-strip">
      <div className="fe-strip__brand">
        <span className="fe-strip__dot" aria-hidden="true" />
        <span className="fe-strip__name">大道芸博</span>
        <span className="fe-strip__pill">LIVE</span>
      </div>
      <div className="fe-strip__meta">
        <span>11.07–11.09</span>
        <span className="fe-strip__sep">·</span>
        <span>みなとみらい</span>
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
