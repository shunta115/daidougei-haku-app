import { useEffect, useState } from 'react'
import { Avatar } from '../components/Avatar'
import { listLivePerformers } from '../lib/api'
import type { Performer } from '../lib/types'

type FanHomeProps = {
  onOpenPerformer: (id: string) => void
}

export function FanHomeScreen({ onOpenPerformer }: FanHomeProps) {
  const [rows, setRows] = useState<Performer[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    listLivePerformers()
      .then(setRows)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load'))
  }, [])

  return (
    <>
      <h1 className="pl-h1">Live now</h1>
      <p className="pl-muted">Street performers broadcasting right now.</p>
      {error ? <p className="pl-error">{error}</p> : null}
      {rows.length === 0 && !error ? <div className="pl-empty">No one is live yet.</div> : null}
      {rows.map((p) => (
        <button
          key={p.id}
          type="button"
          className="pl-card pl-row"
          style={{ width: '100%', textAlign: 'left', cursor: 'pointer' }}
          onClick={() => onOpenPerformer(p.id)}
        >
          <Avatar url={p.photo_url} name={p.stage_name} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="pl-badge">LIVE</div>
            <div style={{ fontWeight: 700 }}>{p.stage_name}</div>
            <div className="pl-muted">
              {p.genre}
              {p.city ? ` · ${p.city}` : ''}
            </div>
          </div>
        </button>
      ))}
    </>
  )
}
