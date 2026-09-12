import { useEffect, useState } from 'react'
import {
  createMerchCheckout,
  getMerchProduct,
  listActiveMerchProducts,
  listMyMerchOrders,
  listSellerMerchOrders,
  listSellerMerchProducts,
  saveSellerMerchProduct,
  uploadMerchImage,
} from '../lib/api'
import { useAuth } from '../lib/auth'
import { useLang } from '../../i18n/LangProvider'
import { formatYen } from '../lib/money'
import type { MerchOrder, MerchProduct } from '../lib/types'
import { PLATFORM_PATH, spaGo } from '../../app/routes'
import { trackProductEvent, useTrackView } from '../lib/track'

type MerchListProps = {
  onOpenProduct: (id: string) => void
  onOpenSearch?: () => void
}

function productAvailable(p: MerchProduct) {
  return p.status === 'active' && p.stock > 0
}

function orderBuyerLabel(order: MerchOrder) {
  const name = order.checkout_customer_name || order.buyer_display_name || '購入者'
  const email = order.checkout_customer_email || order.buyer_email
  return email ? `${name} · ${email}` : name
}

export function MerchListScreen({ onOpenProduct, onOpenSearch }: MerchListProps) {
  const { user } = useAuth()
  const { lang } = useLang()
  useTrackView('merch_view')
  const [products, setProducts] = useState<MerchProduct[]>([])
  const [orders, setOrders] = useState<MerchOrder[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const [items, mine] = await Promise.all([
          listActiveMerchProducts(),
          user ? listMyMerchOrders(user.id).catch(() => [] as MerchOrder[]) : Promise.resolve([] as MerchOrder[]),
        ])
        if (cancelled) return
        setProducts(items)
        setOrders(mine)
        setError(null)
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'グッズの読み込みに失敗しました')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [user])

  return (
    <>
      <section className="pl-merch-market-hero" aria-labelledby="pl-merch-market-title">
        <p>{lang === 'ja' ? 'グッズ' : 'Merch'}</p>
        <h1 id="pl-merch-market-title">{lang === 'ja' ? '応援を、持ち帰る' : 'Take your support home'}</h1>
        <span>
          {lang === 'ja'
            ? '気に入ったパフォーマーのグッズ購入も、次の演技を支える応援になります。'
            : 'Buying from a performer is another way to support the next show.'}
        </span>
      </section>
      {error ? <p className="pl-error">{error}</p> : null}
      {loading ? <p className="pl-muted">Loading…</p> : null}
      {!loading && products.length === 0 ? (
        <section className="pl-merch-empty-next" aria-label="グッズ準備中">
          <p>グッズは公開準備中です。</p>
          <h2>まず応援したいパフォーマーを見つける</h2>
          <span>プロフィールをフォローしておくと、商品公開やLIVEに戻りやすくなります。</span>
          <button type="button" className="pl-btn pl-btn--block" onClick={onOpenSearch ?? (() => spaGo(PLATFORM_PATH))}>
            パフォーマーを探す
          </button>
        </section>
      ) : null}
      <div className="pl-merch-grid" role="list">
        {products.map((p) => (
          <article key={p.id} className="pl-merch-card" role="listitem">
            <button type="button" className="pl-merch-card__photo" onClick={() => onOpenProduct(p.id)}>
              {p.image_url ? <img src={p.image_url} alt="" loading="lazy" /> : <span aria-hidden="true" />}
              <em>{p.stock > 0 ? `残り ${p.stock}` : 'SOLD OUT'}</em>
            </button>
            <div className="pl-merch-card__body">
              <button type="button" className="pl-merch-card__name" onClick={() => onOpenProduct(p.id)}>{p.name}</button>
              <p>{formatYen(p.price_yen)}</p>
              <button type="button" className="pl-merch-card__cta" onClick={() => onOpenProduct(p.id)}>
                詳細を見る
              </button>
            </div>
          </article>
        ))}
      </div>

      {user ? (
        <>
          <h2 className="pl-h2" style={{ marginTop: 24 }}>購入履歴</h2>
          {orders.length === 0 ? <div className="pl-empty">購入履歴はまだありません。</div> : null}
          {orders.map((o) => (
            <div key={o.id} className="pl-card">
              <div style={{ fontWeight: 700 }}>{o.product_name}</div>
              <div className="pl-muted">
                {formatYen(o.amount_yen)} · {o.quantity}点 · {o.status}
              </div>
            </div>
          ))}
        </>
      ) : null}
    </>
  )
}

export function MerchDetailScreen({ productId, onBack }: { productId: string; onBack: () => void }) {
  const { user } = useAuth()
  const [product, setProduct] = useState<MerchProduct | null>(null)
  const [quantity, setQuantity] = useState(1)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    getMerchProduct(productId)
      .then((item) => {
        setProduct(item)
        if (item) trackProductEvent('merch_view', { performerId: item.seller_id, props: { product_id: item.id } })
      })
      .catch((e) => setError(e instanceof Error ? e.message : '商品を読み込めませんでした'))
  }, [productId])

  const buy = async () => {
    if (!product) return
    if (!user) {
      window.sessionStorage.setItem('pl-merch-product', productId)
      spaGo(`${PLATFORM_PATH}?auth=1`)
      return
    }
    setBusy(true)
    setError(null)
    trackProductEvent('merch_checkout_start', { performerId: product.seller_id, props: { product_id: productId, quantity } })
    try {
      const url = await createMerchCheckout(productId, quantity)
      window.location.href = url
    } catch (e) {
      setError(e instanceof Error ? e.message : '購入手続きに失敗しました')
      setBusy(false)
    }
  }

  if (!product && !error) return <p className="pl-muted">Loading…</p>
  if (!product) return <p className="pl-error">{error}</p>
  const available = productAvailable(product)
  const maxQty = Math.min(20, Math.max(1, product.stock))

  return (
    <>
      <button type="button" className="pl-btn pl-btn--ghost" onClick={onBack}>
        Back
      </button>
      <div className="pl-merch-detail">
        {product.image_url ? <img className="pl-merch-detail__image" src={product.image_url} alt="" /> : <div className="pl-merch-detail__image" aria-hidden="true" />}
        <div className="pl-merch-detail__body">
        <p className="pl-merch-detail__k">GOODS</p>
        <h1 className="pl-h1">{product.name}</h1>
        <p className="pl-tip__amount">{formatYen(product.price_yen)}</p>
        <p className="pl-muted">{product.description || 'この商品を購入して、パフォーマーの活動を応援できます。'}</p>
        <p className="pl-merch-detail__stock">{product.stock > 0 ? `在庫 ${product.stock}` : '売り切れ'}</p>
        <label>
          <span className="pl-label">数量</span>
          <input
            className="pl-input"
            type="number"
            min={1}
            max={maxQty}
            value={quantity}
            disabled={!available}
            onChange={(e) => setQuantity(Math.min(maxQty, Math.max(1, Math.floor(Number(e.target.value) || 1))))}
          />
        </label>
        <button type="button" className="pl-btn pl-btn--block pl-btn--tip" disabled={busy || !available} onClick={() => void buy()}>
          {busy ? 'Processing…' : user ? `${formatYen(product.price_yen * quantity)}で購入する` : 'ログインして購入'}
        </button>
        </div>
      </div>
      {error ? <p className="pl-error">{error}</p> : null}
    </>
  )
}

export function PerformerMerchScreen({ onBack }: { onBack: () => void }) {
  const { performer } = useAuth()
  const [products, setProducts] = useState<MerchProduct[]>([])
  const [orders, setOrders] = useState<MerchOrder[]>([])
  const [draft, setDraft] = useState({
    id: '',
    name: '',
    description: '',
    image_url: '',
    price_yen: 1000,
    stock: 10,
    status: 'draft' as MerchProduct['status'],
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)

  const reload = async () => {
    if (!performer) return
    const [items, sales] = await Promise.all([
      listSellerMerchProducts(performer.id),
      listSellerMerchOrders(performer.id).catch(() => [] as MerchOrder[]),
    ])
    setProducts(items)
    setOrders(sales)
  }

  useEffect(() => {
    void reload().catch((e) => setError(e instanceof Error ? e.message : '読み込みに失敗しました'))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [performer?.id])

  const resetDraft = () => {
    setDraft({ id: '', name: '', description: '', image_url: '', price_yen: 1000, stock: 10, status: 'draft' })
  }

  const save = async () => {
    if (!performer) return
    setBusy(true)
    setError(null)
    setMsg(null)
    try {
      if (!performer.is_approved && draft.status === 'active') {
        throw new Error('承認後に販売開始できます。下書きで保存してください。')
      }
      await saveSellerMerchProduct(performer.id, {
        id: draft.id || undefined,
        name: draft.name,
        description: draft.description,
        image_url: draft.image_url.trim() || null,
        price_yen: draft.price_yen,
        stock: draft.stock,
        status: draft.status,
      })
      setMsg('商品を保存しました')
      resetDraft()
      await reload()
    } catch (e) {
      setError(e instanceof Error ? e.message : '保存に失敗しました')
    } finally {
      setBusy(false)
    }
  }

  const onImage = async (file: File | null) => {
    if (!file || !performer) return
    setBusy(true)
    setError(null)
    try {
      const url = await uploadMerchImage(performer.id, file)
      setDraft((d) => ({ ...d, image_url: url }))
      setMsg('画像をアップロードしました')
    } catch (e) {
      setError(e instanceof Error ? e.message : '画像アップロードに失敗しました')
    } finally {
      setBusy(false)
    }
  }

  if (!performer) return <p className="pl-muted">Loading…</p>

  return (
    <>
      <button type="button" className="pl-btn pl-btn--ghost" onClick={onBack}>
        Back
      </button>
      <h1 className="pl-h1">グッズ管理</h1>
      <p className="pl-muted">商品登録、在庫、販売状態、注文を確認できます。</p>
      {msg ? <p className="pl-muted">{msg}</p> : null}
      {error ? <p className="pl-error">{error}</p> : null}

      <div className="pl-card">
        <input className="pl-input" placeholder="商品名" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
        <textarea className="pl-textarea" placeholder="説明" value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
        <label className="pl-btn pl-btn--ghost" style={{ display: 'inline-block', marginBottom: 10 }}>
          商品画像
          <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" hidden onChange={(e) => void onImage(e.target.files?.[0] ?? null)} />
        </label>
        {draft.image_url ? <img className="pl-merch-hero" src={draft.image_url} alt="" /> : null}
        <input className="pl-input" type="number" min={100} max={1000000} value={draft.price_yen} onChange={(e) => setDraft({ ...draft, price_yen: Number(e.target.value) || 100 })} />
        <input className="pl-input" type="number" min={0} max={9999} value={draft.stock} onChange={(e) => setDraft({ ...draft, stock: Number(e.target.value) || 0 })} />
        <select className="pl-input" value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value as MerchProduct['status'] })}>
          <option value="draft">下書き</option>
          <option value="active">販売中</option>
          <option value="sold_out">売り切れ</option>
          <option value="archived">非公開</option>
        </select>
        <button type="button" className="pl-btn pl-btn--block" disabled={busy || !draft.name.trim()} onClick={() => void save()}>
          {busy ? 'Saving…' : draft.id ? '更新する' : '登録する'}
        </button>
      </div>

      <h2 className="pl-h2">商品一覧</h2>
      {products.length === 0 ? <div className="pl-empty">商品はまだありません。</div> : null}
      {products.map((p) => (
        <div key={p.id} className="pl-card pl-row">
          {p.image_url ? <img className="pl-merch-thumb" src={p.image_url} alt="" loading="lazy" /> : <div className="pl-merch-thumb" aria-hidden="true" />}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700 }}>{p.name}</div>
            <div className="pl-muted">{formatYen(p.price_yen)} · 在庫 {p.stock} · {p.status}</div>
          </div>
          <button type="button" className="pl-btn pl-btn--ghost" onClick={() => setDraft({
            id: p.id,
            name: p.name,
            description: p.description,
            image_url: p.image_url ?? '',
            price_yen: p.price_yen,
            stock: p.stock,
            status: p.status,
          })}>
            編集
          </button>
        </div>
      ))}

      <h2 className="pl-h2">注文</h2>
      {orders.length === 0 ? <div className="pl-empty">注文はまだありません。</div> : null}
      {orders.map((o) => (
        <div key={o.id} className="pl-card">
          <div style={{ fontWeight: 700 }}>{o.product_name}</div>
          <div className="pl-muted">
            {formatYen(o.amount_yen)} · {o.quantity}点 · {o.status}
          </div>
          <div className="pl-muted">{orderBuyerLabel(o)}</div>
          {o.checkout_customer_phone ? <div className="pl-muted">{o.checkout_customer_phone}</div> : null}
          <div className="pl-muted">{new Date(o.created_at).toLocaleString()}</div>
        </div>
      ))}
    </>
  )
}
