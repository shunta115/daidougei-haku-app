import { useEffect, useState } from 'react'
import { Avatar } from '../components/Avatar'
import { LiveBadge } from '../components/LiveBadge'
import {
  addOshi,
  createReport,
  follow,
  getFeaturedEvent,
  getMyVote,
  getPerformer,
  isFollowing,
  isOshi,
  listSellerMerchProducts,
  removeOshi,
  unfollow,
  voteForPerformer,
} from '../lib/api'
import { useAuth } from '../lib/auth'
import { useLang } from '../../i18n/LangProvider'
import { spaGo, PLATFORM_PATH } from '../../app/routes'
import { trackProductEvent, useTrackView } from '../lib/track'
import type { MerchProduct, Performer } from '../lib/types'
import { safeExternalHref } from '../../festival/lib/safeExternalHref'

type Props = {
  performerId: string
  onTip: () => void
  onBack: () => void
  onWatchLive: () => void
}

export function PerformerPublicScreen({ performerId, onTip, onBack, onWatchLive }: Props) {
  const { user } = useAuth()
  const { t } = useLang()
  useTrackView('performer_view', { performerId })
  const [p, setP] = useState<Performer | null>(null)
  const [following, setFollowing] = useState(false)
  const [oshi, setOshi] = useState(false)
  const [voted, setVoted] = useState(false)
  const [eventId, setEventId] = useState<string | null>(null)
  const [merch, setMerch] = useState<MerchProduct[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    getPerformer(performerId)
      .then(setP)
      .catch((e) => setError(e instanceof Error ? e.message : 'Load failed'))
    getFeaturedEvent()
      .then((ev) => setEventId(ev?.id ?? null))
      .catch(() => setEventId(null))
    listSellerMerchProducts(performerId)
      .then((items) => setMerch(items.filter((item) => item.status === 'active' || item.status === 'sold_out').slice(0, 3)))
      .catch(() => setMerch([]))
  }, [performerId])

  useEffect(() => {
    if (!user) return
    isFollowing(user.id, performerId).then(setFollowing).catch(() => setFollowing(false))
    isOshi(user.id, performerId).then(setOshi).catch(() => setOshi(false))
  }, [user, performerId])

  useEffect(() => {
    if (!user || !eventId) return
    getMyVote(eventId, user.id)
      .then((id) => setVoted(id === performerId))
      .catch(() => setVoted(false))
  }, [user, eventId, performerId])

  const toggleFollow = async () => {
    if (!user) return
    setBusy(true)
    trackProductEvent('follow_click', { performerId, props: { surface: 'profile' } })
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
  const videoHref = safeExternalHref(p.video_url ?? undefined)

  return (
    <>
      <button type="button" className="pl-btn pl-btn--ghost" onClick={onBack}>
        {t('back')}
      </button>
      <div className="pl-card" style={{ marginTop: 12, textAlign: 'center' }}>
        <Avatar url={p.photo_url} name={p.stage_name} large />
        {p.is_live ? (
          <p style={{ display: 'flex', justifyContent: 'center', marginTop: 12 }}>
            <LiveBadge />
          </p>
        ) : null}
        <h1 className="pl-h1" style={{ marginTop: 12 }}>
          {p.stage_name}
        </h1>
        <p className="pl-muted">
          {p.genre}
          {p.city ? ` · ${p.city}` : ''}
          {p.country ? ` · ${p.country}` : ''}
        </p>
        {p.is_live && p.live_title ? <p className="pl-muted">{p.live_title}</p> : null}
        <p style={{ marginTop: 12, lineHeight: 1.5 }}>{p.bio || t('profileReady')}</p>
        {p.awards ? (
          <p className="pl-muted" style={{ marginTop: 8 }}>
            受賞歴: {p.awards}
          </p>
        ) : null}
        {p.appearances ? (
          <p className="pl-muted" style={{ marginTop: 8 }}>
            出演歴: {p.appearances}
          </p>
        ) : null}
        {videoHref ? (
          <p className="pl-muted" style={{ marginTop: 8 }}>
            <a href={videoHref} target="_blank" rel="noopener noreferrer">
              紹介動画
            </a>
          </p>
        ) : null}
        {Array.isArray(p.sns_json) && p.sns_json.length > 0 ? (
          <p className="pl-muted" style={{ marginTop: 8 }}>
            {p.sns_json.map((s) => s.label).join(' / ')}
          </p>
        ) : null}
        {p.share_location && p.lat != null && p.lng != null ? (
          <p className="pl-muted">Approx. location shared while live.</p>
        ) : null}
      </div>

      {watchable ? (
        <button type="button" className="pl-btn pl-btn--block pl-btn--live" onClick={onWatchLive}>
          {t('watchInApp')}
        </button>
      ) : null}

      {merch.length > 0 ? (
        <section className="pl-card pl-profile-merch" aria-label="このパフォーマーのグッズ">
          <div>
            <p className="pl-profile-merch__eyebrow">GOODS</p>
            <h2 className="pl-h2" style={{ marginTop: 2 }}>この人をもっと応援する</h2>
          </div>
          <div className="pl-profile-merch__grid">
            {merch.map((item) => (
              <button
                key={item.id}
                type="button"
                className="pl-profile-merch__item"
                onClick={() => spaGo(`${PLATFORM_PATH}?merchProduct=${encodeURIComponent(item.id)}`)}
              >
                {item.image_url ? <img src={item.image_url} alt="" loading="lazy" /> : <span aria-hidden="true" />}
                <strong>{item.name}</strong>
                <small>{item.status === 'sold_out' ? '売り切れ' : '購入できます'}</small>
              </button>
            ))}
          </div>
        </section>
      ) : null}

      {user ? (
        <div style={{ display: 'grid', gap: 10, marginTop: 12 }}>
          <button type="button" className="pl-btn pl-btn--block pl-btn--ghost" disabled={busy || !user} onClick={() => void toggleFollow()}>
            {following ? t('following') : t('follow')}
          </button>
          <button
            type="button"
            className="pl-btn pl-btn--block pl-btn--ghost"
            disabled={busy || !user}
            onClick={() => {
              if (!user) return
              void (async () => {
                setBusy(true)
                try {
                  if (oshi) await removeOshi(user.id, performerId)
                  else await addOshi(user.id, performerId)
                  setOshi(!oshi)
                } catch (e) {
                  setError(e instanceof Error ? e.message : '推しの更新に失敗しました')
                } finally {
                  setBusy(false)
                }
              })()
            }}
          >
            {oshi ? t('oshiOn') : t('oshi')}
          </button>
          <button type="button" className="pl-btn pl-btn--block pl-btn--tip" onClick={onTip}>
            ❤️ この人を応援する
          </button>
          {eventId ? (
            <button
              type="button"
              className="pl-btn pl-btn--block pl-btn--ghost"
              disabled={busy || !user || voted}
              onClick={() => {
                if (!user || !eventId) return
                void voteForPerformer(eventId, performerId, user.id)
                  .then(() => setVoted(true))
                  .catch((e) => setError(e instanceof Error ? e.message : '投票に失敗しました'))
              }}
            >
              {voted ? t('voted') : `${t('vote')}して応援する`}
            </button>
          ) : null}
          <button
            type="button"
            className="pl-btn pl-btn--ghost"
            onClick={() => {
              const reason = window.prompt('通報理由')
              if (!reason || !user) return
              void createReport(user.id, 'performer', performerId, reason).catch(() => undefined)
            }}
          >
            通報
          </button>
        </div>
      ) : (
        <button
          type="button"
          className="pl-btn pl-btn--block"
          style={{ marginTop: 12 }}
          onClick={() => spaGo(`${PLATFORM_PATH}?auth=1`)}
        >
          {t('needAuthActions')}
        </button>
      )}
      {error ? <p className="pl-error">{error}</p> : null}
    </>
  )
}
