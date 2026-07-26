import type { PerformerFlow } from '../../types'

type PerformerBottomNavProps = {
  flow: PerformerFlow
  onHub: () => void
  onEntry: () => void
  onList: () => void
}

export function PerformerBottomNav({ flow, onHub, onEntry, onList }: PerformerBottomNavProps) {
  const entryActive = flow === 'register' || flow === 'registerComplete'
  const listActive = flow === 'myRegistrations'

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
        <button
          type="button"
          className="fe-pnav__btn"
          data-active={listActive}
          onClick={onList}
          aria-current={listActive ? 'page' : undefined}
        >
          <span className="fe-pnav__icon" aria-hidden="true">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
              <path
                d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
          <span className="fe-pnav__label">List</span>
        </button>
      </div>
    </nav>
  )
}
