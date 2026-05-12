import type { PerformerFlow } from '../../types'

type PerformerBottomNavProps = {
  flow: PerformerFlow
  onHub: () => void
  onEntry: () => void
}

export function PerformerBottomNav({ flow, onHub, onEntry }: PerformerBottomNavProps) {
  const entryActive = flow === 'register' || flow === 'registerComplete'

  return (
    <nav className="fe-pnav" aria-label="出演者ナビ">
      <div className="fe-pnav__inner">
        <button
          type="button"
          className="fe-pnav__btn"
          data-active={flow === 'hub'}
          onClick={onHub}
          aria-current={flow === 'hub' ? 'page' : undefined}
        >
          <span className="fe-pnav__icon" aria-hidden="true">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
              <path
                d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1v-9.5Z"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinejoin="round"
              />
            </svg>
          </span>
          <span className="fe-pnav__label">Hub</span>
        </button>
        <button
          type="button"
          className="fe-pnav__btn"
          data-active={entryActive}
          onClick={onEntry}
          aria-current={entryActive ? 'page' : undefined}
        >
          <span className="fe-pnav__icon" aria-hidden="true">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
              <path
                d="M4 19.5V5a1 1 0 0 1 1-1h9l6 6v9.5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1Z"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinejoin="round"
              />
              <path d="M14 4v5h5" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
            </svg>
          </span>
          <span className="fe-pnav__label">Entry</span>
        </button>
      </div>
    </nav>
  )
}
