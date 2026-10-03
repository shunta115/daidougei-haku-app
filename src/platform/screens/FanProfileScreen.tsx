import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../lib/auth'
import { Avatar } from '../components/Avatar'
import { useLang } from '../../i18n/LangProvider'
import { listFollowedPerformers, listMyMerchOrders, updateOwnAvatar } from '../lib/api'
import { prepareProfilePhoto } from '../lib/profilePhoto'
import { registrationError } from '../lib/onboarding'
import { formatYen } from '../lib/money'
import type { MerchOrder, Performer } from '../lib/types'
import { Bell, Camera, ChevronRight, Clapperboard, Heart, History, Settings, ShoppingBag, Ticket } from 'lucide-react'

type Props = {
  onOpenPerformer?: (id: string) => void
  onOpenProduct?: (id: string) => void
  onOpenNotifications?: () => void
  onOpenTitle?: () => void
}

export function FanProfileScreen({ onOpenPerformer, onOpenProduct, onOpenNotifications, onOpenTitle }: Props) {
  const { t } = useLang()
  const { profile, user, signOut, refreshProfile } = useAuth()
  const photoInput = useRef<HTMLInputElement>(null)
  const [follows, setFollows] = useState<Performer[]>([])
  const [orders, setOrders] = useState<MerchOrder[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  useEffect(() => {
    if (!user) return
    let cancelled = false
    Promise.all([
      listFollowedPerformers(user.id).catch(() => [] as Performer[]),
      listMyMerchOrders(user.id).catch(() => [] as MerchOrder[]),
    ])
      .then(([followRows, orderRows]) => {
        if (cancelled) return
        setFollows(followRows)
        setOrders(orderRows)
        setError(null)
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : t('profileLoadError'))
      })
    return () => {
      cancelled = true
    }
  }, [t, user])

  const onPhoto = async (file: File | null) => {
    if (!file || !user || busy) return
    setBusy(true)
    setError(null)
    try {
      const photo = await prepareProfilePhoto(file)
      await updateOwnAvatar(user.id, photo)
      await refreshProfile()
    } catch (e) {
      setError(registrationError(e, t('editPhotoFail')))
    } finally {
      setBusy(false)
      if (photoInput.current) photoInput.current.value = ''
    }
  }

  if (!profile) return <p className="pl-muted">{t('processing')}</p>
  const username = (profile.email?.split('@')[0] || profile.id.slice(0, 8)).replace(/[^a-zA-Z0-9._-]/g, '')

  return (
    <>
      <section className="pl-my-hero">
        <div className="pl-my-hero__glow" aria-hidden="true" />
        <button
          type="button"
          className="pl-my-hero__photo"
          disabled={busy || !user}
          onClick={() => photoInput.current?.click()}
          aria-label={t('profileChangePhoto')}
        >
          <Avatar url={profile.avatar_url} name={profile.display_name} large />
          <span className="pl-my-hero__cam" aria-hidden="true"><Camera size={13} /></span>
        </button>
        <input
          ref={photoInput}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif,image/heic,image/heif"
          hidden
          onChange={(e) => void onPhoto(e.target.files?.[0] ?? null)}
        />
        <div>
          <p>MY STREET</p>
          <h1>{profile.display_name}</h1>
          <span>@{username || profile.id.slice(0, 8)}</span>
        </div>
        <div className="pl-my-hero__stats"><span><strong>{follows.length}</strong>{t('profileFollows')}</span><span><strong>0</strong>{t('profileFollowers')}</span><span><strong>0</strong>{t('profileCheers')}</span></div>
      </section>
      {error ? <p className="pl-error">{error}</p> : null}

      <section className="pl-card" aria-labelledby="pl-my-follows">
        <h2 id="pl-my-follows" className="pl-h2" style={{ marginTop: 0 }}>{t('profileFollows')}</h2>
        {follows.length === 0 ? <p className="pl-muted">{t('profileFollowEmpty')}</p> : null}
        {follows.map((p) => (
          <button
            key={p.id}
            type="button"
            className="pl-row pl-my-link"
            onClick={() => onOpenPerformer?.(p.id)}
          >
            <Avatar url={p.photo_url} name={p.stage_name} />
            <span>
              <strong>{p.stage_name}</strong>
              <small>{p.is_live ? t('liveNow') : p.genre || 'Performance'}</small>
            </span>
          </button>
        ))}
      </section>

      <section className="pl-my-menu" aria-label={t('profileMenu')}>
        <button type="button" onClick={() => scrollTo('pl-my-follows')}><span><Heart size={19} />{t('profileFavorites')}</span><ChevronRight size={18} /></button>
        <div><span><History size={19} />{t('profileHistory')}</span><small>{t('profileSoon')}</small></div>
        <div><span><Ticket size={19} />{t('profileTickets')}</span><small>{t('profileSoon')}</small></div>
        <button type="button" onClick={() => scrollTo('pl-my-orders')}><span><ShoppingBag size={19} />{t('profileMerchHistory')}</span><ChevronRight size={18} /></button>
        <button type="button" onClick={onOpenNotifications}><span><Bell size={19} />{t('notifications')}</span><ChevronRight size={18} /></button>
        <div><span><Settings size={19} />{t('profileSettings')}</span><small>{t('profileSoon')}</small></div>
        {onOpenTitle ? (
          <button type="button" onClick={onOpenTitle}><span><Clapperboard size={19} />{t('openTitleScreen')}</span><ChevronRight size={18} /></button>
        ) : null}
      </section>
      <button type="button" className="pl-btn pl-btn--block pl-btn--ghost" onClick={() => void signOut()}>{t('signOut')}</button>

      <section className="pl-card" aria-labelledby="pl-my-orders">
        <h2 id="pl-my-orders" className="pl-h2" style={{ marginTop: 0 }}>{t('profileOrders')}</h2>
        {orders.length === 0 ? <p className="pl-muted">{t('profileOrdersEmpty')}</p> : null}
        {orders.map((o) => (
          <button
            key={o.id}
            type="button"
            className="pl-my-order"
            onClick={() => onOpenProduct?.(o.product_id)}
          >
            <strong>{o.product_name}</strong>
            <span>{formatYen(o.amount_yen)} · {t('orderPieces', { n: o.quantity })} · {o.status}</span>
          </button>
        ))}
      </section>
    </>
  )
}
