import { useEffect, useState } from 'react'
import type { Performer } from '../../types'
import { initials } from '../../lib/initials'
import { getDemoNow } from '../../lib/demoClock'
import {
  demoTodayDateString,
  nextSlotForPerformerFromNow,
  slotsByPerformer,
  todaySlotsForPerformer,
} from '../../lib/scheduleEngine'
import { sharePerformer } from '../../lib/share'
import { recordCheerMoment } from '../../lib/cheerMomentStorage'
import { isOnWatchlist, toggleWatchlist } from '../../lib/watchlistStorage'
import { isDemoMode } from '../../config/runtimeConfig'
import { canProcessOnlineSupport, canWatchLiveStream } from '../../lib/productionGuard'
import { shouldShowAsLiveStream } from '../../lib/streamPresence'
import { getCatalogFeaturedEvent } from '../../../catalog/liveCatalog'
import { useAuth } from '../../../platform/lib/auth'
import { follow, getMyVote, isFollowing, unfollow, voteForPerformer } from '../../../platform/lib/api'
import { useTrackView } from '../../../platform/lib/track'
import { isSupabaseConfigured } from '../../../platform/lib/supabase'
import { openPlatform } from '../../../app/routes'
import { useLang } from '../../../i18n/LangProvider'
import { resolvePerformerPhotoUrl } from '../../lib/streamPresence'
import { PerformerDetailProfile } from './performer/PerformerDetailProfile'
import { PerformerDetailSchedule } from './performer/PerformerDetailSchedule'
import { PerformerDetailVideo } from './performer/PerformerDetailVideo'

type PerformerDetailScreenProps = {
  performer: Performer
  favorite: boolean
  onClose: () => void
  onToggleFavorite: () => void
  onOpenTimetable: () => void
  onOpenTips?: () => void
  onOpenMap?: () => void
  onWatchStream?: (id: string) => void
  onSupportStream?: (id: string) => void
  onBetaSupport?: () => void
}

export function PerformerDetailScreen({
  performer: p,
  favorite,
  onClose,
  onToggleFavorite,
  onOpenTimetable,
  onOpenTips,
  onOpenMap,
  onWatchStream,
  onSupportStream,
  onBetaSupport,
}: PerformerDetailScreenProps) {
  useTrackView('view_performer', { performerId: p.id })
  const schedule = slotsByPerformer(p.id)
  const tips = p.tipLinks ?? []
  const now = getDemoNow()
  const today = demoTodayDateString()
  const todaySlots = todaySlotsForPerformer(p.id, today)
  const nextAfter = nextSlotForPerformerFromNow(p.id, now)
  const [watch, setWatch] = useState(() => isOnWatchlist(p.id))
  const [cheerHint, setCheerHint] = useState<string | null>(null)

  const streamReady = p.approvalStatus === 'approved' && p.canStream
  const isLive = shouldShowAsLiveStream(p)
  const watchable = canWatchLiveStream(p)

  useEffect(() => {
    setWatch(isOnWatchlist(p.id))
  }, [p.id])

  const photo = resolvePerformerPhotoUrl(p.photoUrl)
  const onTip = () => {
    if (onSupportStream) {
      onSupportStream(p.id)
      return
    }
    onOpenTips?.()
  }

  return (
    <div className="fe-detail fe-detail--native fe-detail--step5" role="dialog" aria-modal="true" aria-labelledby="fe-detail-title">
      <header className="fe-detail__bar">
        <button type="button" className="fe-detail__back" onClick={onClose}>
          ← 戻る
        </button>
        <div className="fe-detail__bar-actions">
          <button type="button" className="fe-detail__iconbtn" onClick={() => void sharePerformer(p)} aria-label="シェア">
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
          <button
            type="button"
            className={`fe-detail__fan${favorite ? ' fe-detail__fan--on' : ''}`}
            aria-pressed={favorite}
            onClick={onToggleFavorite}
          >
            {favorite ? '★ 推し' : '☆ 推し'}
          </button>
        </div>
      </header>

      <div
        className={`fe-detail__hero fe-detail__hero--mega fe-detail__hero--step5${photo ? ' fe-detail__hero--photo' : ''}${isLive ? ' fe-detail__hero--streaming' : ''}`}
        style={
          photo
            ? { backgroundImage: `url(${photo})` }
            : { background: p.gradient }
        }
      >
        <div className="fe-detail__hero-shade" aria-hidden="true" />
        {!photo ? <span className="fe-detail__hero-mono">{initials(p.name)}</span> : null}
        {isLive ? (
          <span className="fe-detail__live-badge" lang="en">
            LIVE
          </span>
        ) : null}
        <div className="fe-detail__hero-text">
          {p.genre ? <p className="fe-detail__genre-pill">{p.genre}</p> : null}
          <h1 id="fe-detail-title" className="fe-detail__title">
            {p.nameJa}
          </h1>
          {p.name && p.name !== p.nameJa ? (
            <p className="fe-detail__title-en" lang="en">
              {p.name}
            </p>
          ) : null}
          <p className="fe-detail__acts">
            {p.country ? `${p.country} · ` : null}
            {p.actJa}
          </p>
          {isLive && p.streamTitle ? <p className="fe-detail__tagline">{p.streamTitle}</p> : null}
        </div>
      </div>

      <FollowTipBar performerId={p.id} onTip={onSupportStream || onOpenTips ? onTip : undefined} />

      {streamReady && onWatchStream && onSupportStream ? (
        <div className="fe-detail-stream-cta" aria-label="ライブ配信">
          <p className="fe-detail-stream-cta__status">
            {isLive ? 'いまライブ配信中' : '配信可能なパフォーマーです'}
          </p>
          <div className="fe-detail-stream-cta__row">
            <button
              type="button"
              className="fe-detail-stream-cta__watch"
              disabled={!watchable}
              onClick={() => watchable && onWatchStream(p.id)}
            >
              {watchable ? (isLive ? '視聴する' : '配信ページを開く') : '配信準備中'}
            </button>
          </div>
        </div>
      ) : null}

      <PerformerDetailVideo performer={p} />

      <div className="fe-detail__quick">
        {onOpenMap ? (
          <button type="button" className="fe-detail__qbtn" onClick={onOpenMap}>
            地図
          </button>
        ) : null}
        <button type="button" className="fe-detail__qbtn" onClick={() => void sharePerformer(p)}>
          シェア
        </button>
        <button type="button" className="fe-detail__qbtn" onClick={onOpenTimetable}>
          タイム
        </button>
      </div>

      {nextAfter ? (
        <div className="fe-detail__nextbar">
          <span className="fe-detail__nextbar-tag">このあと出演</span>
          <span className="fe-detail__nextbar-body">
            {nextAfter.date} {nextAfter.start} · {nextAfter.stageJa}
          </span>
        </div>
      ) : null}

      <PerformerVoteBlock performerId={p.id} />

      <main className="fe-detail__main">
        <PerformerDetailSchedule
          performer={p}
          todaySlots={todaySlots}
          allSlots={schedule}
          onOpenTimetable={onOpenTimetable}
        />
        <PerformerDetailProfile performer={p} />

        {isDemoMode ? (
        <section className="fe-detail-cheer" aria-label="応援">
          <h2 className="fe-detail-cheer__h">ライブ応援（端末内 · デモ）</h2>
          <p className="fe-detail-cheer__lead">拍手やメッセージは端末内のみ。本格的な応援はWEB投げ銭へ。</p>
          <div className="fe-detail-cheer__row">
            <button
              type="button"
              className="fe-detail-cheer__btn"
              onClick={() => {
                recordCheerMoment({ performerId: p.id, kind: 'clap', at: new Date().toISOString() })
                setCheerHint('拍手を送りました')
                window.setTimeout(() => setCheerHint(null), 1600)
              }}
            >
              拍手
            </button>
            <button
              type="button"
              className="fe-detail-cheer__btn fe-detail-cheer__btn--heart"
              onClick={() => {
                recordCheerMoment({ performerId: p.id, kind: 'heart', at: new Date().toISOString() })
                setCheerHint('ハートを送りました')
                window.setTimeout(() => setCheerHint(null), 1600)
              }}
            >
              ハート
            </button>
            <button
              type="button"
              className="fe-detail-cheer__btn"
              onClick={() => {
                const text = window.prompt('応援メッセージ（端末内のみ保存）', '')
                if (text == null || !text.trim()) return
                recordCheerMoment({ performerId: p.id, kind: 'message', at: new Date().toISOString(), text: text.trim() })
                setCheerHint('メッセージを届けました')
                window.setTimeout(() => setCheerHint(null), 1600)
              }}
            >
              メッセージ
            </button>
            <button
              type="button"
              className={`fe-detail-cheer__btn${watch ? ' fe-detail-cheer__btn--on' : ''}`}
              onClick={() => setWatch(toggleWatchlist(p.id))}
            >
              見たいリスト
            </button>
          </div>
          {cheerHint ? <p className="fe-detail-cheer__toast">{cheerHint}</p> : null}
        </section>
        ) : null}

        <section className="fe-detail-block" aria-labelledby="fe-d-tip">
          <h2 id="fe-d-tip" className="fe-detail-h">
            投げ銭
          </h2>
          <p className="fe-detail-lead">
            ログイン後、安全な決済ページで応援できます。アプリ内課金はありません。
          </p>
          <button
            type="button"
            className="fe-btn fe-btn--primary fe-btn--block"
            onClick={() => {
              if (onSupportStream) {
                onSupportStream(p.id)
                return
              }
              onBetaSupport?.()
            }}
          >
            投げ銭する
          </button>
          {(p.supportUrl || tips[0]?.url) && canProcessOnlineSupport() ? (
            <div className="fe-tip-grid" style={{ marginTop: streamReady ? 10 : 0 }}>
              <a
                className="fe-btn fe-btn--glass fe-btn--block fe-btn--support-primary"
                href={p.supportUrl || tips[0]!.url}
                target="_blank"
                rel="noopener noreferrer"
              >
                外部サイトで応援する
              </a>
              {tips
                .filter((t) => t.url !== (p.supportUrl || tips[0]?.url))
                .map((t) => (
                  <a
                    key={t.id}
                    className="fe-btn fe-btn--glass fe-btn--block"
                    href={t.url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {t.labelJa}
                  </a>
                ))}
            </div>
          ) : null}
        </section>
      </main>
    </div>
  )
}

function FollowTipBar({ performerId, onTip }: { performerId: string; onTip?: () => void }) {
  const { user } = useAuth()
  const { t } = useLang()
  const [following, setFollowing] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!user || !isSupabaseConfigured) {
      setFollowing(false)
      return
    }
    void isFollowing(user.id, performerId)
      .then(setFollowing)
      .catch(() => setFollowing(false))
  }, [user, performerId])

  return (
    <div className="fe-detail__cta">
      <button
        type="button"
        className={`fe-detail__cta-follow${following ? ' fe-detail__cta-follow--on' : ''}`}
        disabled={busy}
        onClick={() => {
          if (!user || !isSupabaseConfigured) {
            openPlatform('?auth=1')
            return
          }
          setBusy(true)
          const run = following ? unfollow(user.id, performerId) : follow(user.id, performerId)
          void run
            .then(() => setFollowing(!following))
            .catch(() => undefined)
            .finally(() => setBusy(false))
        }}
      >
        {following ? t('following') : t('follow')}
      </button>
      {onTip ? (
        <button type="button" className="fe-detail__cta-tip" onClick={onTip}>
          {t('tip')}
        </button>
      ) : null}
    </div>
  )
}

function PerformerVoteBlock({ performerId }: { performerId: string }) {
  const { user } = useAuth()
  const { t } = useLang()
  const eventId = getCatalogFeaturedEvent()?.id
  const [mine, setMine] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)

  useEffect(() => {
    if (!eventId || !user || !isSupabaseConfigured) {
      setMine(null)
      return
    }
    void getMyVote(eventId, user.id)
      .then(setMine)
      .catch(() => setMine(null))
  }, [eventId, user, performerId])

  if (!eventId) return null

  const votedHere = mine === performerId

  return (
    <section className="fe-detail-stream-cta" aria-label="投票">
      <p className="fe-detail-stream-cta__status">
        {votedHere ? t('votedHere') : t('voteHint')}
      </p>
      <button
        type="button"
        className="fe-detail-stream-cta__watch"
        disabled={busy}
        onClick={() => {
          if (!user) {
            openPlatform('?auth=1')
            return
          }
          setBusy(true)
          setNote(null)
          void voteForPerformer(eventId, performerId, user.id)
            .then(() => setMine(performerId))
            .catch((e) => setNote(e instanceof Error ? e.message : '投票に失敗しました'))
            .finally(() => setBusy(false))
        }}
      >
        {votedHere ? t('voted') : t('vote')}
      </button>
      {note ? <p className="fe-detail-lead">{note}</p> : null}
    </section>
  )
}
