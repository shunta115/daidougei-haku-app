import { useRef, useState } from 'react'
import { cancelLiveReservation, reserveLiveSchedule } from '../../lib/api'
import type { homeDiscovery } from '../../lib/homeDiscovery'

type Props = {
  showDiscovery?: boolean
  feed: ReturnType<typeof homeDiscovery>
  reserved: string[] | null
  setReserved: (ids: string[]) => void
  userId: string | null
  onWatch: (id: string) => void
  onProfile: (id: string) => void
  onTip: (id: string) => void
  onSearch: () => void
}
export function HomeStage({ showDiscovery = true, feed, reserved, setReserved, userId, onWatch, onProfile, onTip, onSearch }: Props) {
  const [busy, setBusy] = useState<string | null>(null)
  const lock = useRef(false)
  const [error, setError] = useState('')
  const [cancelId, setCancelId] = useState<string | null>(null)
  async function change(id: string, cancel: boolean) {
    if (!userId) { setError('LIVE予約にはログインが必要です。マイページからログインしてください。'); return }
    if (lock.current || reserved === null) return
    lock.current = true; setBusy(id); setError('')
    try {
      if (cancel) await cancelLiveReservation(id, userId)
      else await reserveLiveSchedule(id, userId)
      setReserved(cancel ? reserved.filter(x => x !== id) : [...new Set([...reserved, id])])
      setCancelId(null)
    } catch { setError('予約を更新できませんでした。通信を確認して再度お試しください。') }
    finally { lock.current = false; setBusy(null) }
  }
  return <div className="haku-stage">
    <div className="haku-stage__intro"><p>THE STAGE IS YOURS</p><h1>心が動く、その瞬間へ。</h1><span>いま会える才能。次に会いたい才能。</span></div>
    {feed.live.length > 0 && feed.upcoming[0] ? <aside className="haku-stage__quick" aria-label="次のLIVE予約">
      <span><strong>{feed.byId.get(feed.upcoming[0].performer_id)?.stage_name}</strong><small>{new Date(feed.upcoming[0].scheduled_start_at).toLocaleString('ja-JP', {timeZone:'Asia/Tokyo', month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'})} JST</small></span>
      <button type="button" className="haku-stage__primary" disabled={busy !== null || reserved?.includes(feed.upcoming[0].id) || (!!userId && reserved === null)} onClick={() => void change(feed.upcoming[0].id, false)}>{reserved?.includes(feed.upcoming[0].id) ? '予約済み ✓' : userId && reserved === null ? '予約状態を確認できません' : '次のLIVEを予約'}</button>
    </aside> : null}
    {feed.live.length ? <section aria-label="LIVE配信中"><header className="haku-stage__heading"><h2>🔴 LIVE配信中</h2><span>今、このステージで</span></header>
      <div className="haku-stage__rail">{feed.live.map((p, i) => <article className="haku-stage__live" key={p.id}>
        {p.photo_url ? <img src={p.photo_url} alt="" loading={i === 0 ? 'eager' : 'lazy'} /> : <div className="haku-stage__placeholder">{p.stage_name.slice(0,2)}</div>}
        <div className="haku-stage__live-copy"><span className="haku-stage__badge">🔴 LIVE配信中</span><h3>{p.stage_name}</h3><p>{p.live_title || 'LIVEパフォーマンス'}</p>
          <button type="button" className="haku-stage__primary" onClick={() => onWatch(p.id)}>今すぐ視聴 →</button>
          <div className="haku-stage__actions"><button type="button" onClick={() => onProfile(p.id)}>プロフィール・フォロー</button><button type="button" onClick={() => onTip(p.id)}>応援・投げ銭</button></div>
        </div></article>)}</div></section> : <p className="haku-stage__quiet">現在、確認できるLIVE配信はありません</p>}
    <section aria-label="これからのLIVE"><header className="haku-stage__heading"><h2>これからのLIVE</h2><span>次の楽しみを、予約しよう</span></header>
      {feed.upcoming.length ? <div className="haku-stage__rail">{feed.upcoming.slice(0,10).map(s => {
        const p = feed.byId.get(s.performer_id)!
        const saved = reserved?.includes(s.id)
        const date = new Date(s.scheduled_start_at)
        return <article key={s.id} className="haku-stage__upcoming">
          <button type="button" className="haku-stage__person" onClick={() => onProfile(p.id)}>{p.photo_url ? <img src={p.photo_url} alt="" loading="lazy" /> : <span>{p.stage_name.slice(0,2)}</span>}<strong>{p.stage_name}</strong></button>
          <time dateTime={s.scheduled_start_at}>{date.toLocaleString('ja-JP', { timeZone:'Asia/Tokyo', month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit' })} JST</time>
          <h3>{s.title}</h3><p>{date.getTime() < feed.now ? '開始待ち' : date.getTime() - feed.now <= 3_600_000 ? '🟠 まもなくLIVE' : 'LIVE予定'}</p>
          <button type="button" className="haku-stage__primary" disabled={busy !== null || saved || (!!userId && reserved === null)} onClick={() => void change(s.id, false)}>{busy === s.id ? '更新中…' : saved ? '予約済み ✓' : userId && reserved === null ? '予約状態を確認できません' : 'LIVEを予約'}</button>
          {saved ? <details><summary>予約の管理</summary>{cancelId === s.id ? <div><p>このLIVEの予約を解除しますか？</p><button type="button" disabled={busy !== null} onClick={() => void change(s.id, true)}>予約解除を確定</button><button type="button" onClick={() => setCancelId(null)}>戻る</button></div> : <button type="button" onClick={() => setCancelId(s.id)}>予約を解除する</button>}</details> : null}
        </article>
      })}</div> : <p className="haku-stage__quiet">公開されたLIVE予定はまだありません。</p>}
    </section>
    {error ? <p role="alert" className="pl-error">{error}</p> : null}
    {showDiscovery && [{title:'次のステージへ',people:feed.active},{title:'新しい才能との出会い',people:feed.newcomers},{title:'すべてのパフォーマー',people:feed.everyone}].map(({title,people}) => people.length ? <section aria-label={title} key={title}>
      <header className="haku-stage__heading"><h2>{title}</h2><button type="button" onClick={onSearch}>すべてのパフォーマーを見る →</button></header>
      <div className="haku-stage__rail haku-stage__people">{people.slice(0,12).map(p => <button type="button" key={p.id} className="haku-stage__portrait" onClick={() => onProfile(p.id)}>
        {p.photo_url ? <img src={p.photo_url} alt="" loading="lazy" /> : <div className="haku-stage__placeholder">{p.stage_name.slice(0,2)}</div>}
        <span><small>{feed.reason(p)}</small><strong>{p.stage_name}</strong><small>{p.genre}</small></span>
      </button>)}</div>
    </section> : null)}
    {showDiscovery && <details className="haku-stage__criteria"><summary>紹介されるパフォーマーの基準</summary><p>公開中のLIVE予定・出演予定、過去30日以内のLIVE実績を紹介します。新規登録から30日以内の出演者にも専用枠を設けています。各一覧は毎日順番が変わり、人気・投げ銭額・閲覧数・ログイン回数で順位を付けません。一般の更新日時だけではプロフィール更新と判断しません。</p></details>}
  </div>
}
