import { useEffect, useState } from 'react'
import { Avatar } from '../components/Avatar'
import { LiveBadge } from '../components/LiveBadge'
import { searchPerformers } from '../lib/api'
import type { Performer } from '../lib/types'

type SearchProps = {
  onOpenPerformer: (id: string) => void
  onWatchLive?: (id: string) => void
}

export function SearchScreen({ onOpenPerformer, onWatchLive }: SearchProps) {
  const [q, setQ] = useState('')
  const [genre, setGenre] = useState('')
  const [region, setRegion] = useState('')
  const [liveOnly, setLiveOnly] = useState(false)
  const [overseasOnly, setOverseasOnly] = useState(false)
  const [rows, setRows] = useState<Performer[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const t = window.setTimeout(() => {
      searchPerformers(q, { liveOnly, genre, country: region, overseasOnly })
        .then(setRows)
        .catch((e) => setError(e instanceof Error ? e.message : '検索に失敗しました'))
    }, 200)
    return () => window.clearTimeout(t)
  }, [q, genre, region, liveOnly, overseasOnly])

  return (
    <>
      <h1 className="pl-h1">検索</h1>
      <input className="pl-input" placeholder="名前・ジャンル・地域" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="pl-chip-row" style={{ marginTop: 10 }}>
        <button type="button" className="pl-chip" data-on={liveOnly} onClick={() => setLiveOnly((v) => !v)}>
          配信中
        </button>
        <button type="button" className="pl-chip" data-on={overseasOnly} onClick={() => setOverseasOnly((v) => !v)}>
          海外
        </button>
      </div>
      <input className="pl-input" style={{ marginTop: 8 }} placeholder="ジャンル" value={genre} onChange={(e) => setGenre(e.target.value)} />
      <input className="pl-input" style={{ marginTop: 8 }} placeholder="国・都市" value={region} onChange={(e) => setRegion(e.target.value)} />
      {error ? <p className="pl-error">{error}</p> : null}
      {!error && rows.length === 0 ? (
        <div className="pl-empty">{q.trim() || genre || region || liveOnly ? '該当なし' : '承認済みパフォーマーはまだいません。'}</div>
      ) : null}
      {rows.map((p) => (
        <button
          key={p.id}
          type="button"
          className="pl-card pl-row"
          style={{ width: '100%', textAlign: 'left', cursor: 'pointer' }}
          onClick={() => {
            if (p.is_live && onWatchLive) onWatchLive(p.id)
            else onOpenPerformer(p.id)
          }}
        >
          <Avatar url={p.photo_url} name={p.stage_name} />
          <div>
            {p.is_live ? <LiveBadge /> : null}
            <div style={{ fontWeight: 700 }}>{p.stage_name}</div>
            <div className="pl-muted">
              {p.genre}
              {p.city ? ` · ${p.city}` : ''}
              {p.country ? ` · ${p.country}` : ''}
            </div>
          </div>
        </button>
      ))}
    </>
  )
}
