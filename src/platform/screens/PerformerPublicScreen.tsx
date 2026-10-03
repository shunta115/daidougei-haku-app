import { useEffect, useMemo, useState } from 'react'
import { BadgeCheck, Copy, Download, Heart, MapPin, Play, QrCode, Share2, X } from 'lucide-react'
import { PerformerAvatar } from '../components/PerformerAvatar'
import { AppBackButton } from '../components/AppBackButton'
import {
  follow,
  getPerformer,
  isFollowing,
  listEventVenues,
  listPerformerEventSlots,
  listSellerMerchProducts,
  sumLiveViews,
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

function weekdayJa(value: string) {
  const day = String(value).slice(0, 10)
  const date = new Date(`${day}T12:00:00+09:00`)
  return ['日', '月', '火', '水', '木', '金', '土'][date.getDay()] ?? ''
}

function dateTimeRange(slot: PerformerEventSlot) {
  const day = String(slot.date).slice(0, 10)
  const [, m, d] = day.split('-')
  const start = String(slot.start_time).slice(0, 5)
  const end = String(slot.end_time).slice(0, 5)
  const wk = weekdayJa(day)
  return `${Number(m)}/${Number(d)}（${wk}） ${start}–${end}`
}

function compactCount(n: number) {
  if (n >= 10000) return `${(n / 1000).toFixed(n >= 100000 ? 0 : 1).replace(/\.0$/, '')}K`
  return String(n)
}

export function PerformerPublicScreen({ performerId, onTip, onBack, onWatchLive, onRequireAuth }: Props) {
  const { user } = useAuth()
  const { t } = useLang()
  useTrackView('performer_view', { performerId })
  const [p, setP] = useState<Performer | null>(null)
  const [following, setFollowing] = useState(false)
  const [merch, setMerch] = useState<MerchProduct[]>([])
  const [supportCount, setSupportCount] = useState(0)
  const [liveViews, setLiveViews] = useState(0)
  const [slots, setSlots] = useState<PerformerEventSlot[]>([])
  const [venues, setVenues] = useState<EventVenueRow[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [section, setSection] = useState<SectionId>('media')
  const [qrOpen, setQrOpen] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [copyState, setCopyState] = useState<'idle' | 'ok' | 'fail'>('idle')
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
    listSellerMerchProducts(performerId)
      .then((items) => { if (alive) setMerch(items.filter((item) => item.status === 'active' || item.status === 'sold_out')) })
      .catch(() => { if (alive) setMerch([]) })
    tipSummaryForPerformer(performerId).then((summary) => { if (alive) setSupportCount(summary.count) }).catch(() => { if (alive) setSupportCount(0) })
    sumLiveViews(performerId).then((n) => { if (alive) setLiveViews(n) }).catch(() => { if (alive) setLiveViews(0) })
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
    if (navigator.share) {
      try {
        await navigator.share({ title: p.stage_name, text, url: canonicalUrl })
      } catch {
        /* cancelled */
      }
      return
    }
    await copyLink()
  }

  const writeCanonicalUrl = async () => {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(canonicalUrl)
      return
    }
    const input = document.createElement('input')
    input.value = canonicalUrl
    input.setAttribute('readonly', '')
    input.style.position = 'fixed'
    input.style.opacity = '0'
    document.body.appendChild(input)
    input.focus()
    input.select()
    input.setSelectionRange(0, canonicalUrl.length)
    const ok = document.execCommand('copy')
    input.remove()
    if (!ok) throw new Error('copy')
  }

  const copyLink = async () => {
    try {
      await writeCanonicalUrl()
      setCopyState('ok')
    } catch {
      setCopyState('fail')
    }
    window.setTimeout(() => setCopyState('idle'), 1800)
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

  const openMap = (venue: EventVenueRow | null) => {
    if (venue?.lat != null && venue?.lng != null) {
      window.open(`https://www.google.com/maps/dir/?api=1&destination=${venue.lat},${venue.lng}`, '_blank', 'noopener,noreferrer')
      return
    }
    spaGo(FESTIVAL_PATH)
  }

  if (!p && !error) return <p className="pl-muted hp-page">{t('hpLoading')}</p>
  if (!p) return <p className="pl-error hp-page">{error}</p>

  const handle = handleOf(p)
  const catchCopy = p.support_blurb || (p.bio ? p.bio.split('\n')[0] : '')
  const bio = p.bio || t('profileReady')
  const upcoming = slots.filter((slot) => slotPhase(slot) !== 'past')
  const next = upcoming[0] ?? null
  const nextVenue = next ? venues.find((venue) => venue.id === next.venue_id) ?? null : null
  const videoHref = safeExternalHref(p.video_url ?? undefined)
  const snsLinks = Array.isArray(p.sns_json)
    ? p.sns_json.map((s) => ({ label: s.label, href: safeExternalHref(s.url) })).filter((s): s is { label: string; href: string } => Boolean(s.href))
    : []
  const goodsPreview = merch.slice(0, 4)
  const later = upcoming.slice(1)
  const goSection = (id: SectionId) => {
    setSection(id)
    window.document.getElementById(`hp-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <article className={`hp-page${p.is_live ? ' hp-page--live' : ''}`}>
      <div className="hp-hero">
        {p.photo_url ? <img src={p.photo_url} alt="" /> : <span className="hp-hero__empty" />}
        <div className="hp-hero__fade" />
        {p.is_live ? <em className="hp-hero__live">LIVE</em> : null}
        <header className="hp-bar">
          <AppBackButton className="hp-icon" iconOnly onClick={onBack} label={t('back')} />
          <div className="hp-bar__actions">
            <button type="button" className="hp-icon" onClick={() => setQrOpen(true)} aria-label={t('hpQr')}>
              <QrCode size={16} />
            </button>
            <button type="button" className="hp-icon" onClick={() => void shareProfile()} aria-label={t('hpShare')}>
              <Share2 size={16} />
            </button>
          </div>
        </header>
      </div>

      <div className="hp-sheet">
        <section className="hp-idrow" aria-labelledby="hp-name">
          <PerformerAvatar
            url={p.photo_url}
            name={p.stage_name}
            isLive={p.is_live}
            size={72}
            onClick={p.is_live ? onWatchLive : undefined}
          />
          <div className="hp-id">
            <h1 id="hp-name">
              {p.stage_name}
              {p.is_approved ? <BadgeCheck size={16} aria-label={t('hpVerified')} /> : null}
            </h1>
            <p className="hp-handle">@{handle}</p>
          </div>
        </section>

        {p.genre ? <p className="hp-genre">{p.genre}</p> : null}
        {catchCopy ? <p className="hp-catch">{catchCopy}</p> : null}

        <ul className="hp-chips">
          {p.city ? <li>📍 {p.city}</li> : null}
          {p.genre ? <li>◉ {p.genre}</li> : null}
          {p.appearances ? <li>✓ {p.appearances}</li> : p.awards ? <li>✓ {p.awards}</li> : null}
        </ul>

        <dl className="hp-metrics">
          <div><dd>{compactCount(0)}</dd><dt>{t('hpAudience')}</dt></div>
          <div><dd>{compactCount(supportCount)}</dd><dt>{t('hpSupport')}</dt></div>
          <div><dd>{compactCount(liveViews)}</dd><dt>{t('hpLiveViews')}</dt></div>
        </dl>

        {p.is_live ? (
          <button type="button" id="hp-live" className="hp-btn hp-btn--live" onClick={onWatchLive}>
            <span /> {t('hpWatchLive')}
          </button>
        ) : (
          <span id="hp-live" hidden />
        )}

        <div className="hp-cta">
          <button type="button" className="hp-btn hp-btn--ghost" disabled={busy} onClick={() => void toggleFollow()}>
            {following ? t('following') : `＋ ${t('follow')}`}
          </button>
          <button type="button" className="hp-btn hp-btn--red" onClick={onTip}>
            <Heart size={15} /> {t('hpCheer')}
          </button>
        </div>

        {next ? (
          <section className="hp-next" aria-labelledby="hp-next-title">
            <h2 id="hp-next-title">{t('hpNextTitle')}</h2>
            <div className="hp-next__row">
              {p.photo_url ? <img src={p.photo_url} alt="" loading="lazy" /> : <span />}
              <div>
                <time>{dateTimeRange(next)}</time>
                <strong>{next.events?.name_ja || t('hpEvent')}</strong>
                <p>{nextVenue?.name_ja || next.stage_ja}</p>
                {next.stage_ja ? <p>{next.stage_ja}</p> : null}
              </div>
              <MapPin size={16} />
            </div>
            <button type="button" className="hp-map" onClick={() => openMap(nextVenue)}>{t('hpMap')}</button>
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

        <section id="hp-media" className="hp-block">
          <h2>{t('hpPerformance')}</h2>
          {p.photo_url || videoHref ? (
            <button
              type="button"
              className="hp-featured"
              onClick={() => { if (p.is_live) onWatchLive(); else if (videoHref) window.open(videoHref, '_blank', 'noopener,noreferrer') }}
            >
              {p.photo_url ? <img src={p.photo_url} alt="" loading="lazy" /> : <span />}
              {videoHref || p.is_live ? <i><Play size={26} fill="currentColor" /></i> : null}
            </button>
          ) : (
            <p className="hp-empty">{t('hpNoMedia')}</p>
          )}
        </section>

        <section id="hp-schedule" className="hp-block">
          <h2>{t('hpUpcoming')}</h2>
          {later.length === 0 && !next ? (
            <p className="hp-empty">{t('hpNoSchedule')}</p>
          ) : (
            <ul className="hp-slots">
              {(later.length ? later : upcoming).map((slot) => {
                const venue = venues.find((row) => row.id === slot.venue_id)
                return (
                  <li key={slot.id}>
                    {p.photo_url ? <img src={p.photo_url} alt="" loading="lazy" /> : <span />}
                    <div>
                      <strong>{dateTimeRange(slot)}</strong>
                      <p>{slot.events?.name_ja}</p>
                      <p>{venue?.name_ja}{slot.stage_ja ? ` · ${slot.stage_ja}` : ''}</p>
                    </div>
                    {slot.events?.slug ? (
                      <button type="button" className="hp-link" onClick={() => spaGo(eventPath(slot.events!.slug))}>{t('hpEvent')}</button>
                    ) : null}
                  </li>
                )
              })}
            </ul>
          )}
        </section>

        <section id="hp-support" className="hp-block hp-support">
          <h2>{t('hpSupportTitle')}</h2>
          <div className="hp-tips">
            {TIP_PRESETS_JPY.filter((yen) => yen !== 300).map((yen) => (
              <button key={yen} type="button" data-on={tipPick === yen} onClick={() => setTipPick(yen)}>
                <span>{TIP_PRESET_LABELS_JA[yen].label}</span>
                <strong>{formatYen(yen)}</strong>
              </button>
            ))}
            <button type="button" className="hp-tips__more" onClick={onTip}>{t('hpChooseAmount')}</button>
          </div>
          <button type="button" className="hp-btn hp-btn--red hp-btn--wide" onClick={onTip}>{t('hpSupportSend')}</button>
        </section>

        <section id="hp-goods" className="hp-block">
          <h2>{t('hpGoods')}</h2>
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
            <button type="button" className="hp-more" onClick={() => spaGo(`${PLATFORM_PATH}?merch=1`)}>
              {t('hpAllGoods')}
            </button>
          ) : null}
        </section>

        <section id="hp-about" className="hp-block">
          <h2>{t('hpProfile')}</h2>
          <p className="hp-bio">{bio}</p>
          {snsLinks.length > 0 ? (
            <p className="hp-sns">
              {snsLinks.map((s, i) => (
                <span key={s.href}>{i > 0 ? ' / ' : null}<a href={s.href} target="_blank" rel="noopener noreferrer">{s.label}</a></span>
              ))}
            </p>
          ) : null}
        </section>
      </div>

      {error ? <p className="pl-error">{error}</p> : null}
      {toast ? <p className="hp-toast" role="status">{toast}</p> : null}

      {qrOpen ? (
        <div className="hp-qr" role="dialog" aria-modal="true" aria-label={t('hpQr')}>
          {p.photo_url ? <img className="hp-qr__bg" src={p.photo_url} alt="" /> : null}
          <header className="hp-qr__top">
            <button type="button" className="hp-icon" onClick={() => setQrOpen(false)} aria-label={t('eventClose')}><X size={16} /></button>
            <strong>{t('hpQr')}</strong>
            <span />
          </header>
          <div className="hp-qr__card">
            <div className="hp-qr__face">
              <PerformerAvatar url={p.photo_url} name={p.stage_name} isLive={false} size={68} />
            </div>
            <b>
              {p.stage_name}
              {p.is_approved ? <BadgeCheck size={14} aria-label={t('hpVerified')} /> : null}
            </b>
            <span>@{handle}</span>
            {qrSrc ? <img className="hp-qr__code" src={qrSrc} alt="" width={240} height={240} /> : null}
            <p>{t('hpQrHint')}</p>
          </div>
          <div className="hp-qr__actions">
            <button type="button" onClick={() => void shareProfile()}><Share2 size={16} /> {t('hpShare')}</button>
            <button type="button" onClick={() => void copyLink()}>
              {copyState === 'ok' ? `✓ ${t('hpCopyDone')}` : copyState === 'fail' ? t('hpCopyFail') : <><Copy size={16} /> {t('hpCopy')}</>}
            </button>
            <button type="button" onClick={() => void saveQr()}><Download size={16} /> {t('hpSave')}</button>
          </div>
        </div>
      ) : null}
    </article>
  )
}
