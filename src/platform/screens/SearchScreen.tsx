import { useEffect, useState } from 'react'
import { Avatar } from '../components/Avatar'
import { searchPerformers } from '../lib/api'
import type { Performer } from '../lib/types'

type SearchProps = {
  onOpenPerformer: (id: string) => void
}

export function SearchScreen({ onOpenPerformer }: SearchProps) {
  const [q, setQ] = useState('')
  const [rows, setRows] = useState<Performer[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const t = window.setTimeout(() => {
      searchPerformers(q)
        .then(setRows)
        .catch((e) => setError(e instanceof Error ? e.message : 'Search failed'))
    }, 200)
    return () => window.clearTimeout(t)
  }, [q])

  return (
    <>
      <h1 className="pl-h1">Search</h1>
      <input
        className="pl-input"
        placeholder="Name, genre, city"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      {error ? <p className="pl-error">{error}</p> : null}
      {rows.map((p) => (
        <button
          key={p.id}
          type="button"
          className="pl-card pl-row"
          style={{ width: '100%', textAlign: 'left', cursor: 'pointer' }}
          onClick={() => onOpenPerformer(p.id)}
        >
          <Avatar url={p.photo_url} name={p.stage_name} />
          <div>
            {p.is_live ? <div className="pl-badge">LIVE</div> : null}
            <div style={{ fontWeight: 700 }}>{p.stage_name}</div>
            <div className="pl-muted">
              {p.genre}
              {p.country ? ` · ${p.country}` : ''}
            </div>
          </div>
        </button>
      ))}
    </>
  )
}
