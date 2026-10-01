import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, BadgeCheck, Copy, Download, Expand, Heart, MapPin, Play, QrCode, Share2 } from 'lucide-react'
import { PerformerAvatar } from '../components/PerformerAvatar'
import {
  countFollowers,
  follow,
  getPerformer,
  isFollowing,
  listEventVenues,
  listPerformerEventSlots,
  listSellerMerchProducts,
  tipSummaryForPerformer,
  unfollow,
  type EventVenueRow,
  type PerformerEventSlot,
} from '../lib/api'
import { useAuth } from '../lib/auth'
import { useLang } from '../../i18n/LangProvider'
import { eventPath, FESTIVAL_PATH, performerPath, PLATFORM_PATH, spaGo } from '../../app/routes'
import { trackProductEvent, useTrackView } from '../lib/track'
import type { MerchProduct, Performer } from '../lib/types'
import { formatYen, TIP_PRESET_LABELS_JA, TIP_PRESETS_JPY } from '../lib/money'
import { safeExternalHref } from '../../festival/lib/safeExternalHref'
import { downloadQrCard, performerQrDataUrl } from '../lib/qr'
import './performer-home.css'

type Props = {
  performerId: string
  onTip: () => void
  onBack: () => void
  onWatchLive: () => void
  onRequireAuth?: () => void
}

type SectionId = 'live' | 'media' | 'goods' | 'schedule' | 'about'

function handleOf(p: Performer) {
  const fromName = p.stage_name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
  return fromName || p.id.replace(/-/g, '').slice(0, 10)
}

function tokyoNow() {
  const date = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Tokyo' })
  const time = new Date().toLocaleTimeString('en-GB', { timeZone: 'Asia/Tokyo', hour: '2-digit', minute: '2-digit' })
  return { date, time }
}

function slotPhase(slot: PerformerEventSlot): 'now' | 'upcoming' | 'past' {
  if (slot.status === 'cancelled') return 'past'
  const { date, time } = tokyoNow()
  const day = String(slot.date).slice(0, 10)
  const start = String(slot.start_time).slice(0, 5)
  const end = String(slot.end_time).slice(0, 5)
  if (day < date) return 'past'
  if (day > date) return 'upcoming'
  if (time < start) return 'upcoming'
  if (time <= end) return 'now'
  return 'past'
}

function dateLabel(value: string) {
  const day = String(value).slice(0, 10)
  const [, m, d] = day.split('-')
  return m && d ? `${Number(m)}/${Number(d)}` : day
}

export function PerformerPublicScreen({ performerId, onTip, onBack, onWatchLive, onRequireAuth }: Props) {
  const { user } = useAuth()
  const { t } = useLang()
  useTrackView('performer_view', { performerId })
  const [p, setP] = useState<Performer | null>(null)
  const [following, setFollowing] = useState(false)
  const [followers, setFollowers] = useState(0)
  const [merch, setMerch] = useState<MerchProduct[]>([])
  const [supportCount, setSupportCount] = useState(0)
  const [slots, setSlots] = useState<PerformerEventSlot[]>([])
  const [venues, setVenues] = useState<EventVenueRow[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [section, setSection] = useState<SectionId>('about')
  const [bioOpen, setBioOpen] = useState(false)
  const [qrOpen, setQrOpen] = useState(false)
  const [qrFull, setQrFull] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [tipPick, setTipPick] = useState<number>(1000)
  const [qrSrc, setQrSrc] = useState('')

  const canonicalUrl = useMemo(() => {
    const path = performerPath(performerId)
    return typeof window === 'undefined' ? path : `${window.location.origin}${path}`
  }, [performerId])

  useEffect(() => {
    let alive = true
    getPerformer(performerId)
      .then((row) => { if (alive) setP(row) })
      .catch(() => { if (alive) setError(t('hpLoadFail')) })
    countFollowers(performerId).then((n) => { if (alive) setFollowers(n) }).catch(() => { if (alive) setFollowers(0) })
    listSellerMerchProducts(performerId)
      .then((items) => { if (alive) setMerch(items.filter((item) => item.status === 'active' || item.status === 'sold_out')) })
      .catch(() => { if (alive) setMerch([]) })
    tipSummaryForPerformer(performerId).then((summary) => { if (alive) setSupportCount(summary.count) }).catch(() => { if (alive) setSupportCount(0) })
    listPerformerEventSlots(performerId)
      .then(async (rows) => {
        if (!alive) return
        const visible = rows.filter((row) => row.status !== 'cancelled')
        setSlots(visible)
        const eventIds = [...new Set(visible.map((row) => row.event_id))]
        const venueRows = (await Promise.all(eventIds.map((id) => listEventVenues(id).catch(() => [] as EventVenueRow[])))).flat()
        if (alive) setVenues(venueRows)
      })
      .catch(() => { if (alive) { setSlots([]); setVenues([]) } })
    const timer = window.setInterval(() => {
      getPerformer(performerId)
        .then((row) => { if (alive) setP((prev) => (prev ? { ...prev, is_live: row.is_live, live_title: row.live_title } : row)) })
        .catch(() => undefined)
    }, 20000)
    return () => { alive = false; window.clearInterval(timer) }
  }, [performerId, t])

  useEffect(() => {
    let alive = true
    performerQrDataUrl(canonicalUrl, 420)
      .then((src) => { if (alive) setQrSrc(src) })
      .catch(() => { if (alive) setQrSrc('') })
    return () => { alive = false }
  }, [canonicalUrl])

  useEffect(() => {
    if (!user) { setFollowing(false); return }
    isFollowing(user.id, performerId).then(setFollowing).catch(() => setFollowing(false))
  }, [user, performerId])

  const requireAuth = () => {
    if (onRequireAuth) onRequireAuth()
    else spaGo(`${PLATFORM_PATH}?auth=1`)
  }

  const toggleFollow = async () => {
    if (!user) { requireAuth(); return }
    setBusy(true)
    trackProductEvent('follow_click', { performerId, props: { surface: 'profile' } })
    try {
      if (following) await unfollow(user.id, performerId)
      else await follow(user.id, performerId)
      setFollowing(!following)
      setFollowers((n) => Math.max(0, n + (following ? -1 : 1)))
    } catch {
      setError(t('hpFollowFail'))
    } finally {
      setBusy(false)
    }
  }

  const showToast = (message: string) => {
    setToast(message)
    window.setTimeout(() => setToast(null), 2200)
  }

  const shareProfile = async () => {
    if (!p) return
    const text = p.support_blurb || p.bio || t('hpQrHint')
    try {
      if (navigator.share) {
        await navigator.share({ title: p.stage_name, text, url: canonicalUrl })
        return
      }
    } catch {
      /* user cancelled or unsupported */
    }
    await copyLink()
  }

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(canonicalUrl)
    } catch {
      const input = document.createElement('input')
      input.value = canonicalUrl
      document.body.appendChild(input)
      input.select()
      document.execCommand('copy')
      input.remove()
    }
    showToast(t('hpCopied'))
  }

  const saveQr = async () => {
    if (!p) return
    try {
      await downloadQrCard({ url: canonicalUrl, name: p.stage_name, handle: handleOf(p) })
    } catch {
      if (qrSrc) {
        const a = document.createElement('a')
        a.href = qrSrc
        a.download = `${handleOf(p)}-qr.png`
        a.click()
      }
    }
  }

  if (!p && !error) return <p className="pl-muted hp-page">{t('hpLoading')}</p>
  if (!p) return <p className="pl-error hp-page">{error}</p>

  const handle = handleOf(p)
  const catchCopy = p.support_blurb || (p.genre ? t('hpCatch', { genre: p.genre }) : '')
  const bio = p.bio || t('profileReady')
  const bioLong = bio.length > 120
  const visibleBio = bioOpen || !bioLong ? bio : `${bio.slice(0, 120)}…`
  const area = [p.city, p.country].filter(Boolean).join(' · ')
  const upcoming = slots.filter((slot) => slotPhase(slot) !== 'past')
  const next = upcoming[0] ?? null
  const nextVenue = next ? venues.find((venue) => venue.id === next.venue_id) ?? null : null
  const nextNow = next ? slotPhase(next) === 'now' : false
  const videoHref = safeExternalHref(p.video_url ?? undefined)
  const snsLinks = Array.isArray(p.sns_json)
    ? p.sns_json.map((s) => ({ label: s.label, href: safeExternalHref(s.url) })).filter((s): s is { label: string; href: string } => Boolean(s.href))
    : []
  const goodsPreview = merch.slice(0, 4)
  const goSection = (id: SectionId) => {
    setSection(id)
    window.document.getElementById(`hp-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <article className="hp-page">
      <header className="hp-bar">
        <button type="button" className="hp-icon" onClick={onBack} aria-label={t('back')}>
          <ArrowLeft size={18} />
        </button>
        <div className="hp-bar__actions">
          <button type="button" className="hp-icon" onClick={() => { setQrOpen(true); setQrFull(false) }} aria-label={t('hpQr')}>
            <QrCode size={18} />
          </button>
          <button type="button" className="hp-icon" onClick={() => void shareProfile()} aria-label={t('hpShare')}>
            <Share2 size={18} />
          </button>
        </div>
      </header>

      <section className="hp-head" aria-labelledby="hp-name">
        <PerformerAvatar
          url={p.photo_url}
          name={p.stage_name}
          isLive={p.is_live}
          size={92}
          onClick={p.is_live ? onWatchLive : undefined}
        />
        <div className="hp-id">
          <h1 id="hp-name">
            {p.stage_name}
            {p.is_approved ? <BadgeCheck size={16} aria-label={t('hpVerified')} /> : null}
          </h1>
          <p className="hp-handle">@{handle}</p>
          {catchCopy ? <p className="hp-catch">{catchCopy}</p> : null}
        </div>
      </section>

      <p className="hp-bio">{visibleBio}</p>
      {bioLong ? (
        <button type="button" className="hp-more" onClick={() => setBioOpen((v) => !v)}>
          {bioOpen ? t('hpLess') : t('hpMore')}
        </button>
      ) : null}

      <ul className="hp-meta">
        {p.genre ? <li>{t('hpGenre')}<strong>{p.genre}</strong></li> : null}
        {area ? <li>{t('hpArea')}<strong>{area}</strong></li> : null}
        {p.awards ? <li>{t('hpAwards')}<strong>{p.awards}</strong></li> : null}
      </ul>

      <dl className="hp-stats">
        <div><dt>{t('hpFollowers')}</dt><dd>{followers}</dd></div>
        <div><dt>{t('hpShows')}</dt><dd>{slots.length}</dd></div>
        <div><dt>{t('hpSupport')}</dt><dd>{supportCount}</dd></div>
      </dl>

      <div className="hp-cta">
        <button type="button" className="hp-btn hp-btn--ghost" disabled={busy} onClick={() => void toggleFollow()}>
          {following ? t('following') : `＋ ${t('follow')}`}
        </button>
        <button type="button" className="hp-btn hp-btn--red" onClick={onTip}>
          <Heart size={16} /> {t('hpCheer')}
        </button>
        {p.is_live ? (
          <button type="button" className="hp-btn hp-btn--live" onClick={onWatchLive}>
            <span /> {t('hpWatchLive')}
          </button>
        ) : null}
      </div>

      {next ? (
        <section className="hp-card hp-next" aria-labelledby="hp-next-title">
          <p className="hp-kicker">{t('hpNext')}</p>
          <h2 id="hp-next-title">{nextNow ? t('hpNow') : t('hpNextTitle')}</h2>
          <div className="hp-next__when">
            <strong>{dateLabel(next.date)}</strong>
            <span>{String(next.start_time).slice(0, 5)}</span>
            {nextNow ? <em>NOW</em> : null}
            {p.is_live ? <em>LIVE NOW</em> : null}
          </div>
          <p>
            <MapPin size={15} /> {nextVenue?.name_ja || next.events?.name_ja || next.stage_ja}
            {next.stage_ja ? ` · ${next.stage_ja}` : ''}
          </p>
          <div className="hp-next__actions">
            {next.events?.slug ? (
              <button type="button" className="hp-btn hp-btn--ghost" onClick={() => spaGo(eventPath(next.events!.slug))}>
                {t('hpEvent')}
              </button>
            ) : null}
            <button
              type="button"
              className="hp-btn hp-btn--ghost"
              onClick={() => {
                if (nextVenue?.lat != null && nextVenue?.lng != null) {
                  window.open(`https://www.google.com/maps/dir/?api=1&destination=${nextVenue.lat},${nextVenue.lng}`, '_blank', 'noopener,noreferrer')
                  return
                }
                spaGo(FESTIVAL_PATH)
              }}
            >
              {t('hpMap')}
            </button>
            {p.is_live || next.is_stream ? (
              <button type="button" className="hp-btn hp-btn--ghost" onClick={onWatchLive}>{t('hpNavLive')}</button>
            ) : null}
          </div>
        </section>
      ) : null}

      <nav className="hp-jump" aria-label={t('hpJump')}>
        {([
          ['live', t('hpNavLive')],
          ['media', t('hpNavVideo')],
          ['goods', t('hpNavGoods')],
          ['schedule', t('hpNavSchedule')],
          ['about', t('hpNavProfile')],
        ] as const).map(([id, label]) => (
          <button key={id} type="button" data-on={section === id} onClick={() => goSection(id)}>{label}</button>
        ))}
      </nav>

      <section id="hp-media" className="hp-block" aria-labelledby="hp-media-title">
        <p className="hp-kicker">PERFORMANCE</p>
        <h2 id="hp-media-title">{t('hpPerformance')}</h2>
        {p.photo_url || videoHref ? (
          <button
            type="button"
            className="hp-featured"
            onClick={() => { if (p.is_live) onWatchLive(); else if (videoHref) window.open(videoHref, '_blank', 'noopener,noreferrer') }}
          >
            {p.photo_url ? <img src={p.photo_url} alt="" loading="lazy" /> : <span />}
            {videoHref || p.is_live ? <i><Play size={22} fill="currentColor" /></i> : null}
          </button>
        ) : (
          <p className="hp-empty">{t('hpNoMedia')}</p>
        )}
        <div className="hp-media-grid">
          {p.photo_url ? <img src={p.photo_url} alt="" loading="lazy" /> : null}
          {videoHref ? (
            <a href={videoHref} target="_blank" rel="noopener noreferrer" className="hp-clip">
              <Play size={16} /> {t('hpVideo')}
            </a>
          ) : null}
        </div>
      </section>

      <section id="hp-live" className="hp-block" hidden={!p.is_live && !p.live_title}>
        {p.is_live ? (
          <button type="button" className="hp-btn hp-btn--live" onClick={onWatchLive}>
            <span /> {p.live_title || t('hpWatchLive')}
          </button>
        ) : null}
      </section>

      <section id="hp-support" className="hp-block hp-card" aria-labelledby="hp-support-title">
        <p className="hp-kicker">SUPPORT</p>
        <h2 id="hp-support-title">{t('hpSupportTitle')}</h2>
        <p className="hp-lead">{t('hpSupportLead')}</p>
        <div className="hp-tips">
          {TIP_PRESETS_JPY.filter((yen) => yen !== 300).map((yen) => (
            <button key={yen} type="button" data-on={tipPick === yen} onClick={() => setTipPick(yen)}>
              <small>{TIP_PRESET_LABELS_JA[yen].label}</small>
              <strong>{formatYen(yen)}</strong>
            </button>
          ))}
          <button type="button" data-on={!TIP_PRESETS_JPY.includes(tipPick as (typeof TIP_PRESETS_JPY)[number])} onClick={onTip}>
            {t('hpChooseAmount')}
          </button>
        </div>
        <button type="button" className="hp-btn hp-btn--red" onClick={onTip}>{t('hpSupportSend')}</button>
      </section>

      <section id="hp-goods" className="hp-block" aria-labelledby="hp-goods-title">
        <p className="hp-kicker">GOODS</p>
        <h2 id="hp-goods-title">{t('hpGoods')}</h2>
        {goodsPreview.length === 0 ? (
          <p className="hp-empty">{t('hpNoGoods')}</p>
        ) : (
          <div className="hp-goods">
            {goodsPreview.map((item) => (
              <button
                key={item.id}
                type="button"
                className="hp-good"
                onClick={() => spaGo(`${PLATFORM_PATH}?merchProduct=${encodeURIComponent(item.id)}`)}
              >
                {item.image_url ? <img src={item.image_url} alt="" loading="lazy" /> : <span className="hp-good__ph" />}
                <strong>{item.name}</strong>
                <small>{item.status === 'sold_out' ? t('hpSoldOut') : formatYen(item.price_yen)}</small>
              </button>
            ))}
          </div>
        )}
        {merch.length > 0 ? (
          <button type="button" className="hp-btn hp-btn--ghost" onClick={() => spaGo(`${PLATFORM_PATH}?merch=1`)}>
            {t('hpAllGoods')}
          </button>
        ) : null}
      </section>

      <section id="hp-schedule" className="hp-block" aria-labelledby="hp-schedule-title">
        <p className="hp-kicker">UPCOMING</p>
        <h2 id="hp-schedule-title">{t('hpUpcoming')}</h2>
        {upcoming.length === 0 ? (
          <p className="hp-empty">{t('hpNoSchedule')}</p>
        ) : (
          <ul className="hp-slots">
            {upcoming.map((slot) => {
              const venue = venues.find((row) => row.id === slot.venue_id)
              const now = slotPhase(slot) === 'now'
              return (
                <li key={slot.id} className="hp-card">
                  <strong>{dateLabel(slot.date)} {String(slot.start_time).slice(0, 5)}</strong>
                  <p>{slot.events?.name_ja || t('hpEvent')}</p>
                  <p>{venue?.name_ja}{slot.stage_ja ? ` · ${slot.stage_ja}` : ''}</p>
                  <div className="hp-next__actions">
                    {slot.events?.slug ? <button type="button" className="hp-link" onClick={() => spaGo(eventPath(slot.events!.slug))}>{t('hpEvent')}</button> : null}
                    <button type="button" className="hp-link" onClick={() => spaGo(FESTIVAL_PATH)}>{t('hpMap')}</button>
                    {now || p.is_live ? <button type="button" className="hp-link" onClick={onWatchLive}>{t('hpNavLive')}</button> : null}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <section id="hp-about" className="hp-block" aria-labelledby="hp-about-title">
        <p className="hp-kicker">PROFILE</p>
        <h2 id="hp-about-title">{t('hpProfile')}</h2>
        <p className="hp-bio hp-bio--full">{bio}</p>
        {p.genre ? <p>{t('hpGenre')} {p.genre}</p> : null}
        {area ? <p>{t('hpArea')} {area}</p> : null}
        {p.awards ? <p>{t('hpAwards')} {p.awards}</p> : null}
        {p.appearances ? <p>{t('hpShows')} {p.appearances}</p> : null}
        {snsLinks.length > 0 ? (
          <p>
            {t('hpSns')}{' '}
            {snsLinks.map((s, i) => (
              <span key={s.href}>{i > 0 ? ' / ' : null}<a href={s.href} target="_blank" rel="noopener noreferrer">{s.label}</a></span>
            ))}
          </p>
        ) : null}
        {videoHref ? <p><a href={videoHref} target="_blank" rel="noopener noreferrer">{t('hpSite')}</a></p> : null}
      </section>

      <section className="hp-card hp-again" aria-labelledby="hp-again-title">
        <p className="hp-kicker">FOLLOW & MEET AGAIN</p>
        <h2 id="hp-again-title">{t('hpFollowAgain')}</h2>
        <p className="hp-lead">{t('hpFollowAgainLead')}</p>
        <button type="button" className="hp-btn hp-btn--red" disabled={busy} onClick={() => void toggleFollow()}>
          {following ? t('following') : t('hpFollowCta')}
        </button>
      </section>

      {error ? <p className="pl-error">{error}</p> : null}
      {toast ? <p className="hp-toast" role="status">{toast}</p> : null}

      {qrOpen ? (
        <div className={`hp-qr${qrFull ? ' hp-qr--full' : ''}`} role="dialog" aria-modal="true" aria-label={t('hpQr')}>
          <button type="button" className="hp-qr__back" onClick={() => { setQrOpen(false); setQrFull(false) }}>{t('eventClose')}</button>
          <div className="hp-qr__card">
            <PerformerAvatar url={p.photo_url} name={p.stage_name} isLive={false} size={64} />
            <strong>{p.stage_name}</strong>
            <span>@{handle}</span>
            <img src={qrSrc} alt="" width={qrFull ? 320 : 240} height={qrFull ? 320 : 240} />
            <p>{t('hpQrHint')}</p>
          </div>
          <div className="hp-qr__actions">
            <button type="button" onClick={() => void shareProfile()}><Share2 size={16} /> {t('hpShare')}</button>
            <button type="button" onClick={() => void copyLink()}><Copy size={16} /> {t('hpCopy')}</button>
            <button type="button" onClick={() => void saveQr()}><Download size={16} /> {t('hpSave')}</button>
          </div>
          <button type="button" className="hp-qr__full" onClick={() => setQrFull((v) => !v)}>
            <Expand size={16} /> {t('hpQrFull')}
          </button>
        </div>
      ) : null}
    </article>
  )
}
