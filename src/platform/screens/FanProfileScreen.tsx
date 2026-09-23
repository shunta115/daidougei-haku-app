import { useEffect, useState } from 'react'
import { useAuth } from '../lib/auth'
import { Avatar } from '../components/Avatar'
import { LanguageToggle, useLang } from '../../i18n/LangProvider'
import { listFollowedPerformers, listMyMerchOrders } from '../lib/api'
import { formatYen } from '../lib/money'
import type { MerchOrder, Performer } from '../lib/types'
import { Bell, ChevronRight, Heart, History, Settings, ShoppingBag, Ticket } from 'lucide-react'

type Props = {
  onOpenPerformer?: (id: string) => void
  onOpenProduct?: (id: string) => void
  onOpenNotifications?: () => void
}

export function FanProfileScreen({ onOpenPerformer, onOpenProduct, onOpenNotifications }: Props) {
  const { t } = useLang()
  const { profile, user, signOut } = useAuth()
  const [follows, setFollows] = useState<Performer[]>([])
  const [orders, setOrders] = useState<MerchOrder[]>([])
  const [error, setError] = useState<string | null>(null)

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
        if (!cancelled) setError(e instanceof Error ? e.message : 'マイページの読み込みに失敗しました')
      })
    return () => {
      cancelled = true
    }
  }, [user])

  if (!profile) return <p className="pl-muted">Loading…</p>
  const username = (profile.email?.split('@')[0] || profile.id.slice(0, 8)).replace(/[^a-zA-Z0-9._-]/g, '')

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
        <LanguageToggle />
      </div>
      <section className="pl-my-hero">
        <div className="pl-my-hero__glow" aria-hidden="true" />
        <Avatar url={profile.avatar_url} name={profile.display_name} large />
        <div>
          <p>MY STREET</p>
          <h1>{profile.display_name}</h1>
          <span>@{username || profile.id.slice(0, 8)}</span>
        </div>
        <div className="pl-my-hero__stats"><span><strong>{follows.length}</strong>フォロー</span><span><strong>0</strong>フォロワー</span><span><strong>0</strong>応援した数</span></div>
      </section>
      {error ? <p className="pl-error">{error}</p> : null}

      <section className="pl-card" aria-labelledby="pl-my-follows">
        <h2 id="pl-my-follows" className="pl-h2" style={{ marginTop: 0 }}>フォロー</h2>
        {follows.length === 0 ? <p className="pl-muted">気になるパフォーマーをフォローすると、ここからすぐ戻れます。</p> : null}
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
              <small>{p.is_live ? 'LIVE中' : p.genre || 'Performance'}</small>
            </span>
          </button>
        ))}
      </section>

      <section className="pl-my-menu" aria-label="マイメニュー">
        <button type="button" onClick={() => scrollTo('pl-my-follows')}><span><Heart size={19} />お気に入り</span><ChevronRight size={18} /></button>
        <div><span><History size={19} />応援履歴</span><small>準備中</small></div>
        <div><span><Ticket size={19} />チケット</span><small>準備中</small></div>
        <button type="button" onClick={() => scrollTo('pl-my-orders')}><span><ShoppingBag size={19} />グッズ購入履歴</span><ChevronRight size={18} /></button>
        <button type="button" onClick={onOpenNotifications}><span><Bell size={19} />通知</span><ChevronRight size={18} /></button>
        <div><span><Settings size={19} />設定・ヘルプ</span><small>準備中</small></div>
      </section>
      <button type="button" className="pl-btn pl-btn--block pl-btn--ghost" onClick={() => void signOut()}>{t('signOut')}</button>

      <section className="pl-card" aria-labelledby="pl-my-orders">
        <h2 id="pl-my-orders" className="pl-h2" style={{ marginTop: 0 }}>購入履歴</h2>
        {orders.length === 0 ? <p className="pl-muted">グッズ購入後、注文内容をここで確認できます。</p> : null}
        {orders.map((o) => (
          <button
            key={o.id}
            type="button"
            className="pl-my-order"
            onClick={() => onOpenProduct?.(o.product_id)}
          >
            <strong>{o.product_name}</strong>
            <span>{formatYen(o.amount_yen)} · {o.quantity}点 · {o.status}</span>
          </button>
        ))}
      </section>
    </>
  )
}
