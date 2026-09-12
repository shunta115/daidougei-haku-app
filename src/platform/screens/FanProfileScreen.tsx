import { useEffect, useState } from 'react'
import { useAuth } from '../lib/auth'
import { Avatar } from '../components/Avatar'
import { LanguageToggle, useLang } from '../../i18n/LangProvider'
import { listFollowedPerformers, listMyMerchOrders } from '../lib/api'
import { formatYen } from '../lib/money'
import type { MerchOrder, Performer } from '../lib/types'

type Props = {
  onOpenPerformer?: (id: string) => void
  onOpenProduct?: (id: string) => void
}

export function FanProfileScreen({ onOpenPerformer, onOpenProduct }: Props) {
  const { t } = useLang()
  const { profile, user, signOut } = useAuth()
  const [follows, setFollows] = useState<Performer[]>([])
  const [orders, setOrders] = useState<MerchOrder[]>([])
  const [error, setError] = useState<string | null>(null)

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

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
        <LanguageToggle />
      </div>
      <div className="pl-card pl-row">
        <Avatar url={profile.avatar_url} name={profile.display_name} large />
        <div>
          <h1 className="pl-h1" style={{ margin: 0, fontSize: '1.4rem' }}>
            {profile.display_name}
          </h1>
          <p className="pl-muted" style={{ margin: '4px 0 0' }}>
            {profile.email ?? user?.email}
          </p>
        </div>
      </div>
      <button type="button" className="pl-btn pl-btn--block pl-btn--ghost" onClick={() => void signOut()}>
        {t('signOut')}
      </button>
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
