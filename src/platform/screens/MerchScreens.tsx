import { useEffect, useRef, useState } from 'react'
import {
  createMerchCheckout,
  createMerchReservation,
  getPerformer,
  getMerchProduct,
  listActiveMerchProducts,
  listMyMerchOrders,
  listSellerMerchOrders,
  listSellerMerchProducts,
  saveSellerMerchProduct,
  uploadMerchImage,
  updateMerchOrderHandoff,
} from '../lib/api'
import { useAuth } from '../lib/auth'
import { useLang } from '../../i18n/LangProvider'
import { formatYen } from '../lib/money'
import type { MerchOrder, MerchProduct, Performer } from '../lib/types'
import { PLATFORM_PATH, spaGo } from '../../app/routes'
import { trackProductEvent, useTrackView } from '../lib/track'
import { ShoppingBag, ShoppingCart, Ticket, UsersRound } from 'lucide-react'
import { AppBackButton } from '../components/AppBackButton'
import { paymentErrorMessage } from '../lib/paymentErrors'

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

function pickupDeadlineLabel(value?: string | null) {
  if (!value) return '商品ごとにパフォーマーへご確認ください'
  return new Intl.DateTimeFormat('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value))
}

const MERCH_PREVIEW = [
  { name: 'オフィシャルTシャツ', type: 'WEAR' },
  { name: 'フェイスタオル', type: 'TOWEL' },
  { name: 'ステッカーセット', type: 'STICKER' },
  { name: 'イベントパス', type: 'PASS' },
]

export function MerchListScreen({ onOpenProduct, onOpenSearch }: MerchListProps) {
  const { user } = useAuth()
  const { lang } = useLang()
  useTrackView('merch_view')
  const [products, setProducts] = useState<MerchProduct[]>([])
  const [orders, setOrders] = useState<MerchOrder[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [market, setMarket] = useState<'goods' | 'tickets' | 'club'>('goods')

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
        <span className="pl-merch-market-hero__cart" aria-label="カートは商品公開後に利用できます"><ShoppingCart size={20} /></span>
        <p>{lang === 'ja' ? 'グッズ' : 'Merch'}</p>
        <h1 id="pl-merch-market-title">{lang === 'ja' ? '応援を、持ち帰る' : 'Take your support home'}</h1>
        <span>
          {lang === 'ja'
            ? '気に入ったパフォーマーのグッズ購入も、次の演技を支える応援になります。'
            : 'Buying from a performer is another way to support the next show.'}
        </span>
      </section>
      <div className="pl-market-tabs" role="tablist" aria-label="応援メニュー">
        <button type="button" role="tab" aria-selected={market === 'goods'} data-active={market === 'goods'} onClick={() => setMarket('goods')}><ShoppingBag size={16} />グッズ</button>
        <button type="button" role="tab" aria-selected={market === 'tickets'} data-active={market === 'tickets'} onClick={() => setMarket('tickets')}><Ticket size={16} />チケット</button>
        <button type="button" role="tab" aria-selected={market === 'club'} data-active={market === 'club'} onClick={() => setMarket('club')}><UsersRound size={16} />ファンクラブ</button>
      </div>
      {error ? <p className="pl-error">{error}</p> : null}
      {loading ? <p className="pl-muted">Loading…</p> : null}
      {market === 'goods' && !loading && products.length === 0 ? (
        <section className="pl-merch-preview" aria-label="公開予定のグッズ表示例">
          <header><div><p>COMING SOON</p><h2>公開予定のグッズ</h2></div><span>商品公開後に購入できます</span></header>
          <div className="pl-merch-grid" role="list">
            {MERCH_PREVIEW.map((item, index) => (
              <article key={item.name} className="pl-merch-card pl-merch-card--preview" role="listitem" aria-disabled="true">
                <div className={`pl-merch-card__photo pl-merch-card__photo--preview pl-merch-card__photo--${index + 1}`}><span>{item.type}</span><em>COMING SOON</em></div>
                <div className="pl-merch-card__body"><strong className="pl-merch-card__name">{item.name}</strong><p>価格公開予定</p><button type="button" className="pl-merch-card__cta" disabled>近日公開</button></div>
              </article>
            ))}
          </div>
          <button type="button" className="pl-action pl-action--glass" onClick={onOpenSearch ?? (() => spaGo(PLATFORM_PATH))}>応援したい人を見つける</button>
        </section>
      ) : null}
      {market === 'goods' ? <div className="pl-merch-grid" role="list">
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
      </div> : (
        <section className="pl-market-coming" aria-label={market === 'tickets' ? 'チケット' : 'ファンクラブ'}>
          {market === 'tickets' ? <Ticket size={30} /> : <UsersRound size={30} />}
          <p>{market === 'tickets' ? 'TICKETS' : 'FAN CLUB'}</p>
          <h2>{market === 'tickets' ? '次に会える場所へ。' : '好きな人を、長く応援する。'}</h2>
          <span>公開中の案内は各パフォーマーのプロフィールから確認できます。</span>
          <button type="button" className="pl-action pl-action--primary" onClick={onOpenSearch ?? (() => spaGo(PLATFORM_PATH))}>パフォーマーを探す</button>
        </section>
      )}

      {user && market === 'goods' ? (
        <>
          <h2 className="pl-h2" style={{ marginTop: 24 }}>購入履歴</h2>
          {orders.length === 0 ? <div className="pl-empty">購入履歴はまだありません。</div> : null}
          {orders.map((o) => (
            <div key={o.id} className="pl-card">
              <div style={{ fontWeight: 700 }}>{o.product_name}</div>
              <div className="pl-muted">
                {o.order_kind === 'cash_reservation' ? '当日現金・取り置き' : 'キャッシュレス'} · {formatYen(o.amount_yen)} · {o.quantity}点
              </div>
              <div className="pl-muted">番号 {o.order_number || '発行前'} · {o.fulfillment_status === 'fulfilled' ? '受取済み' : '未受取'}</div>
              {o.order_kind === 'cash_reservation' && o.fulfillment_status === 'awaiting_pickup' ? (
                <button type="button" className="pl-btn pl-btn--ghost" onClick={async () => {
                  try {
                    await updateMerchOrderHandoff(o.id, 'cancel')
                    setOrders((current) => current.map((item) => item.id === o.id ? { ...item, status: 'failed', fulfillment_status: 'cancelled' } : item))
                  } catch { setError('取り置きをキャンセルできませんでした。') }
                }}>取り置きをキャンセル</button>
              ) : null}
            </div>
          ))}
        </>
      ) : null}
    </>
  )
}

export function MerchDetailScreen({
  productId,
  onBack,
  onRequireAuth,
}: {
  productId: string
  onBack: () => void
  onRequireAuth?: () => void
}) {
  const { user } = useAuth()
  const { lang } = useLang()
  const [product, setProduct] = useState<MerchProduct | null>(null)
  const [seller, setSeller] = useState<Performer | null>(null)
  const [quantity, setQuantity] = useState(1)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [reservation, setReservation] = useState<{ orderNumber: string } | null>(null)
  const checkoutRequestId = useRef<string | null>(null)

  useEffect(() => {
    checkoutRequestId.current = null
  }, [productId, quantity])

  useEffect(() => {
    getMerchProduct(productId)
      .then((item) => {
        setProduct(item)
        if (item) void getPerformer(item.seller_id).then(setSeller).catch(() => setSeller(null))
        if (item) trackProductEvent('merch_view', { performerId: item.seller_id, props: { product_id: item.id } })
      })
      .catch((e) => setError(e instanceof Error ? e.message : '商品を読み込めませんでした'))
  }, [productId])

  const buy = async () => {
    if (!product) return
    if (!user) {
      window.sessionStorage.setItem('pl-merch-product', productId)
      if (onRequireAuth) onRequireAuth()
      else spaGo(`${PLATFORM_PATH}?auth=1`)
      return
    }
    setBusy(true)
    setError(null)
    trackProductEvent('merch_checkout_start', { performerId: product.seller_id, props: { product_id: productId, quantity } })
    try {
      checkoutRequestId.current ||= crypto.randomUUID()
      const url = await createMerchCheckout(productId, quantity, checkoutRequestId.current)
      window.location.href = url
    } catch (e) {
      setError(paymentErrorMessage(e instanceof Error ? e.message : 'checkout_failed', lang))
      setBusy(false)
    }
  }

  const reserve = async () => {
    if (!product) return
    if (!user) {
      window.sessionStorage.setItem('pl-merch-product', productId)
      if (onRequireAuth) onRequireAuth()
      else spaGo(`${PLATFORM_PATH}?auth=1`)
      return
    }
    setBusy(true)
    setError(null)
    try {
      const result = await createMerchReservation(productId, quantity, crypto.randomUUID())
      setReservation({ orderNumber: result.orderNumber })
      setProduct((current) => current ? { ...current, stock: Math.max(0, current.stock - quantity) } : current)
    } catch (e) {
      const code = e instanceof Error ? e.message : 'reservation_failed'
      setError(code === 'product_unavailable' ? '在庫が不足しているか、取り置き受付が終了しました。' : '取り置きを受け付けられませんでした。時間をおいてお試しください。')
    } finally {
      setBusy(false)
    }
  }

  if (!product && !error) return <p className="pl-muted">Loading…</p>
  if (!product) return <p className="pl-error">{error}</p>
  const available = productAvailable(product)
  // The server checks the connected account against Stripe on every checkout
  // and repairs a stale stripe_onboarding_complete flag. Do not block that
  // authoritative refresh with an older public performer snapshot.
  const checkoutAllowed = Boolean(seller?.is_approved)
  const reservationReady = Boolean(seller?.is_approved && product.reservation_enabled !== false)
  const maxQty = Math.min(20, Math.max(1, product.stock))

  return (
    <>
      <AppBackButton className="pl-btn pl-btn--ghost" onClick={onBack} label="戻る" />
      <div className="pl-merch-detail">
        {product.image_url ? <img className="pl-merch-detail__image" src={product.image_url} alt="" /> : <div className="pl-merch-detail__image" aria-hidden="true" />}
        <div className="pl-merch-detail__body">
        <p className="pl-merch-detail__k">GOODS</p>
        <h1 className="pl-h1">{product.name}</h1>
        <p className="pl-tip__amount">{formatYen(product.price_yen)}</p>
        <p className="pl-muted">{product.description || 'この商品を購入して、パフォーマーの活動を応援できます。'}</p>
        <dl className="pl-merch-pickup-info">
          <div><dt>在庫</dt><dd>{product.stock > 0 ? `${product.stock}点` : '売り切れ'}</dd></div>
          <div><dt>受取場所</dt><dd>{product.pickup_location || 'イベント会場・パフォーマー物販受付'}</dd></div>
          <div><dt>受取期限</dt><dd>{pickupDeadlineLabel(product.pickup_deadline)}</dd></div>
          <div><dt>送料</dt><dd>0円（会場で手渡し）</dd></div>
        </dl>
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
        {reservation ? (
          <section className="pl-merch-reservation-success" role="status">
            <strong>取り置きを受け付けました</strong>
            <span>取り置き番号</span><b>{reservation.orderNumber}</b>
            <p>会場でこの番号を見せ、パフォーマーへ現金でお支払いください。</p>
          </section>
        ) : (
          <div className="pl-merch-buy-options">
            <section className="pl-merch-buy-option pl-merch-buy-option--recommended">
              <span className="pl-merch-buy-option__badge">おすすめ</span>
              <h2>先にキャッシュレスで支払う</h2>
              <p>決済後に購入番号を発行します。会場では番号を見せて受け取るだけです。</p>
              {!checkoutAllowed && seller ? <p className="pl-registration__notice" role="status">{paymentErrorMessage('seller_checkout_unavailable', lang)} 無料取り置きをご利用ください。</p> : null}
              <button type="button" className="pl-btn pl-btn--block pl-btn--tip" disabled={busy || !available || !seller || !checkoutAllowed} onClick={() => void buy()}>
                {busy ? '手続き中…' : !seller ? '販売状態を確認中…' : user ? `${formatYen(product.price_yen * quantity)}を支払って会場受取` : 'ログインして購入'}
              </button>
              <small>HAKUの決済画面で安全にお支払い · 送料0円</small>
            </section>
            <section className="pl-merch-buy-option">
              <h2>無料で取り置く</h2>
              <p>今は支払いません。在庫だけ確保し、当日パフォーマーへ直接現金でお支払いください。</p>
              <button type="button" className="pl-btn pl-btn--block pl-btn--ghost" disabled={busy || !available || !reservationReady} onClick={() => void reserve()}>
                {user ? '無料で取り置く' : 'ログインして取り置く'}
              </button>
              <small>取り置きにHAKU販売手数料はかかりません</small>
            </section>
          </div>
        )}
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
    pickup_location: 'イベント会場・パフォーマー物販受付',
    pickup_deadline: '',
    reservation_enabled: true,
  })
  const [busy, setBusy] = useState(false)
  const [imageStatus, setImageStatus] = useState<'idle' | 'preview' | 'uploading' | 'success' | 'error'>('idle')
  const [imagePreview, setImagePreview] = useState('')
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
    setDraft({ id: '', name: '', description: '', image_url: '', price_yen: 1000, stock: 10, status: 'draft', pickup_location: 'イベント会場・パフォーマー物販受付', pickup_deadline: '', reservation_enabled: true })
    setImagePreview('')
    setImageStatus('idle')
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
        pickup_location: draft.pickup_location,
        pickup_deadline: draft.pickup_deadline ? new Date(draft.pickup_deadline).toISOString() : null,
        reservation_enabled: draft.reservation_enabled,
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
    const reader = new FileReader()
    reader.onload = () => { setImagePreview(typeof reader.result === 'string' ? reader.result : '') }
    reader.readAsDataURL(file)
    setBusy(true)
    setImageStatus('uploading')
    setError(null)
    setMsg(null)
    try {
      const url = await uploadMerchImage(performer.id, file)
      setDraft((d) => ({ ...d, image_url: url }))
      setImagePreview(url)
      setImageStatus('success')
      setMsg('商品画像をアップロードしました。商品を保存すると登録が完了します。')
    } catch (e) {
      setImageStatus('error')
      setError(e instanceof Error ? e.message : '画像をアップロードできませんでした。5MB以下のJPEG・PNG・WebP・GIFでお試しください。')
    } finally {
      setBusy(false)
    }
  }

  if (!performer) return <p className="pl-muted">Loading…</p>
  const cashlessSalesYen = orders
    .filter((order) => order.order_kind !== 'cash_reservation' && order.status === 'succeeded')
    .reduce((sum, order) => sum + order.amount_yen, 0)
  const cashSalesYen = orders
    .filter((order) => order.order_kind === 'cash_reservation' && order.fulfillment_status === 'fulfilled')
    .reduce((sum, order) => sum + order.amount_yen, 0)
  const awaitingPickupCount = orders.filter((order) => order.fulfillment_status === 'awaiting_pickup').length

  return (
    <>
      <AppBackButton className="pl-btn pl-btn--ghost" onClick={onBack} label="戻る" />
      <h1 className="pl-h1">グッズ管理</h1>
      <p className="pl-muted">パフォーマンスを好きになってくれたファンへ、あなたのオリジナルグッズを届けられます。</p>
      {!performer.stripe_onboarding_complete ? <p className="pl-registration__notice" role="status">商品画像・説明・在庫は今から登録して下書き保存できます。Stripe受取設定が完了するまでは、お客様のキャッシュレス購入は開始されません。</p> : <p className="pl-registration__notice" role="status">Stripe受取設定済みです。販売中の商品はお客様がキャッシュレスで購入できます。</p>}
      {msg ? <p className="pl-muted">{msg}</p> : null}
      {error ? <p className="pl-error">{error}</p> : null}

      <div className="pl-merch-sales-summary" aria-label="グッズ販売状況">
        <div><span>未受取</span><strong>{awaitingPickupCount}件</strong></div>
        <div><span>キャッシュレス売上</span><strong>{formatYen(cashlessSalesYen)}</strong></div>
        <div><span>当日現金売上</span><strong>{formatYen(cashSalesYen)}</strong><small>HAKU手数料なし</small></div>
      </div>

      <div className="pl-card">
        <label><span className="pl-label">商品名</span><input className="pl-input" placeholder="例：オリジナルTシャツ" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></label>
        <label><span className="pl-label">商品説明</span><textarea className="pl-textarea" placeholder="サイズ、素材、受け渡し方法など" value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} /></label>
        <span className="pl-label">商品画像</span>
        <label className="pl-btn pl-btn--ghost" style={{ display: 'inline-flex', marginBottom: 10 }}>
          {imageStatus === 'uploading' ? 'アップロード中…' : draft.image_url || imagePreview ? '画像を変更' : '画像を選択'}
          <input aria-label="商品画像" type="file" accept="image/jpeg,image/png,image/webp,image/gif" hidden onChange={(e) => void onImage(e.target.files?.[0] ?? null)} />
        </label>
        {imagePreview || draft.image_url ? <figure className="pl-merch-upload-preview"><img className="pl-merch-hero" src={imagePreview || draft.image_url} alt="選択した商品画像のプレビュー" /><figcaption>{imageStatus === 'uploading' ? '画像をアップロードしています…' : imageStatus === 'success' ? '画像アップロード完了' : imageStatus === 'error' ? '画像をアップロードできませんでした' : '選択した画像のプレビュー'}</figcaption></figure> : null}
        <label><span className="pl-label">価格（税込・円）</span><input className="pl-input" type="number" min={100} max={1000000} value={draft.price_yen} onChange={(e) => setDraft({ ...draft, price_yen: Number(e.target.value) || 100 })} /></label>
        <label><span className="pl-label">在庫数</span><input className="pl-input" type="number" min={0} max={9999} value={draft.stock} onChange={(e) => setDraft({ ...draft, stock: Number(e.target.value) || 0 })} /></label>
        <label><span className="pl-label">会場での受取場所</span><input className="pl-input" value={draft.pickup_location} onChange={(e) => setDraft({ ...draft, pickup_location: e.target.value })} /></label>
        <label><span className="pl-label">受取期限</span><input className="pl-input" type="datetime-local" value={draft.pickup_deadline} onChange={(e) => setDraft({ ...draft, pickup_deadline: e.target.value })} /></label>
        <label className="pl-check"><input type="checkbox" checked={draft.reservation_enabled} onChange={(e) => setDraft({ ...draft, reservation_enabled: e.target.checked })} /><span>無料取り置きを受け付ける</span></label>
        <label><span className="pl-label">販売状態</span><select className="pl-input" value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value as MerchProduct['status'] })}>
          <option value="draft">下書き</option>
          <option value="active">販売中</option>
          <option value="sold_out">売り切れ</option>
          <option value="archived">非公開</option>
        </select></label>
        <button type="button" className="pl-btn pl-btn--block" disabled={busy || !draft.name.trim()} onClick={() => void save()}>
          {busy ? '保存中…' : draft.id ? '商品を更新する' : products.length ? 'グッズを追加する' : '最初の商品を登録する'}
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
          <button type="button" className="pl-btn pl-btn--ghost" onClick={() => {
            setDraft({ id: p.id, name: p.name, description: p.description, image_url: p.image_url ?? '', price_yen: p.price_yen, stock: p.stock, status: p.status, pickup_location: p.pickup_location ?? 'イベント会場・パフォーマー物販受付', pickup_deadline: p.pickup_deadline ? new Date(p.pickup_deadline).toISOString().slice(0, 16) : '', reservation_enabled: p.reservation_enabled !== false })
            setImagePreview(p.image_url ?? '')
            setImageStatus(p.image_url ? 'success' : 'idle')
          }}>
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
            {o.order_kind === 'cash_reservation' ? '当日現金・無料取り置き' : 'キャッシュレス決済'} · {formatYen(o.amount_yen)} · {o.quantity}点
          </div>
          <div className="pl-muted">番号 {o.order_number || '発行前'} · {o.fulfillment_status === 'fulfilled' ? '受取済み' : '未受取'}</div>
          <div className="pl-muted">{orderBuyerLabel(o)}</div>
          {o.checkout_customer_phone ? <div className="pl-muted">{o.checkout_customer_phone}</div> : null}
          <div className="pl-muted">{new Date(o.created_at).toLocaleString()}</div>
          {o.fulfillment_status === 'awaiting_pickup' ? (
            <button type="button" className="pl-btn pl-btn--ghost" disabled={busy} onClick={async () => {
              setBusy(true); setError(null)
              try { await updateMerchOrderHandoff(o.id, 'fulfill'); await reload(); setMsg('受取完了を登録しました') }
              catch (e) { setError(e instanceof Error && e.message === 'payment_not_confirmed' ? '決済完了が確認できないため、受取完了にできません。' : '受取完了を登録できませんでした') }
              finally { setBusy(false) }
            }}>受取完了にする</button>
          ) : null}
        </div>
      ))}
    </>
  )
}
