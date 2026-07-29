import { useEffect, useState } from 'react'
import { Avatar } from '../components/Avatar'
import { follow, getPerformer, isFollowing, unfollow } from '../lib/api'
import { useAuth } from '../lib/auth'
import type { Performer } from '../lib/types'

type Props = {
  performerId: string
  onTip: () => void
  onBack: () => void
  onWatchLive: () => void
}

export function PerformerPublicScreen({ performerId, onTip, onBack, onWatchLive }: Props) {
  const { user, profile } = useAuth()
  const [p, setP] = useState<Performer | null>(null)
  const [following, setFollowing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    getPerformer(performerId)
      .then(setP)
      .catch((e) => setError(e instanceof Error ? e.message : 'Load failed'))
  }, [performerId])

  useEffect(() => {
    if (!user || profile?.role !== 'fan') return
    isFollowing(user.id, performerId).then(setFollowing).catch(() => setFollowing(false))
  }, [user, profile, performerId])

  const toggleFollow = async () => {
    if (!user) return
    setBusy(true)
    try {
      if (following) await unfollow(user.id, performerId)
      else await follow(user.id, performerId)
      setFollowing(!following)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Follow failed')
    } finally {
      setBusy(false)
    }
  }

  if (!p && !error) return <p className="pl-muted">Loading…</p>
  if (!p) return <p className="pl-error">{error}</p>

  const watchable = Boolean(p.is_live)

  return (
    <>
      <button type="button" className="pl-btn pl-btn--ghost" onClick={onBack}>
        Back
      </button>
      <div className="pl-card" style={{ marginTop: 12, textAlign: 'center' }}>
        <Avatar url={p.photo_url} name={p.stage_name} large />
        {p.is_live ? <p className="pl-badge" style={{ justifyContent: 'center', marginTop: 12 }}>LIVE</p> : null}
        <h1 className="pl-h1" style={{ marginTop: 12 }}>
          {p.stage_name}
        </h1>
        <p className="pl-muted">
          {p.genre}
          {p.city ? ` · ${p.city}` : ''}
          {p.country ? ` · ${p.country}` : ''}
        </p>
        {p.is_live && p.live_title ? <p className="pl-muted">{p.live_title}</p> : null}
        <p style={{ marginTop: 12, lineHeight: 1.5 }}>{p.bio || 'No bio yet.'}</p>
        {p.share_location && p.lat != null && p.lng != null ? (
          <p className="pl-muted">Approx. location shared while live.</p>
        ) : null}
      </div>

      {watchable ? (
        <button type="button" className="pl-btn pl-btn--block pl-btn--live" onClick={onWatchLive}>
          アプリで見る
        </button>
      ) : null}

      {profile?.role === 'fan' ? (
        <div style={{ display: 'grid', gap: 10, marginTop: 12 }}>
          <button type="button" className="pl-btn pl-btn--block pl-btn--ghost" disabled={busy || !user} onClick={() => void toggleFollow()}>
            {following ? 'Following' : 'Follow'}
          </button>
          <button type="button" className="pl-btn pl-btn--block" onClick={onTip}>
            Tip
          </button>
        </div>
      ) : null}
      {error ? <p className="pl-error">{error}</p> : null}
    </>
  )
}
