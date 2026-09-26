import { useEffect, useState } from 'react'
import {
  addEventLineup,
  deleteEventSlot,
  deleteEventVenue,
  createEvent,
  getEventVoteRule,
  getFeaturedEvent,
  getTipFeeBps,
  listAdminVoteRanking,
  listApprovedPerformers,
  listEventLineup,
  listEventLiveSessions,
  listEventSlots,
  listEventVenues,
  listManagedEvents,
  notifyEventAppearances,
  removeEventLineup,
  saveFeaturedEventPatch,
  saveEventVoteRule,
  setTipFeeBps,
  upsertEventSlot,
  upsertEventVenue,
  type EventSlotRow,
  type EventVenueRow,
  type EventVoteRule,
  type FeaturedEvent,
} from '../lib/api'
import type { LiveSession, Performer } from '../lib/types'
import { refreshLiveCatalog } from '../../catalog/liveCatalog'
import { supabaseAuthHeaders } from '../lib/supabase'

type Tab = 'meta' | 'venues' | 'slots' | 'lineup' | 'voting' | 'live'

export function AdminEventScreen() {
  const [tab, setTab] = useState<Tab>('meta')
  const [event, setEvent] = useState<Awaited<ReturnType<typeof getFeaturedEvent>>>(null)
  const [events, setEvents] = useState<FeaturedEvent[]>([])
  const [voteRule, setVoteRule] = useState<EventVoteRule | null>(null)
  const [voteRanking, setVoteRanking] = useState<Array<{ performer_id: string; votes: number }>>([])
  const [feeBps, setFeeBps] = useState(1000)
  const [venues, setVenues] = useState<EventVenueRow[]>([])
  const [slots, setSlots] = useState<EventSlotRow[]>([])
  const [lineup, setLineup] = useState<string[]>([])
  const [lives, setLives] = useState<LiveSession[]>([])
  const [approved, setApproved] = useState<Performer[]>([])
  const [error, setError] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)

  const [venueDraft, setVenueDraft] = useState({ id: '', name_ja: '', name_en: '', blurb_ja: '', lat: '', lng: '', venue_type: 'stage' as EventVenueRow['venue_type'] })
  const [slotDraft, setSlotDraft] = useState({
    date: '2026-10-10',
    start_time: '12:00',
    end_time: '12:30',
    venue_id: '',
    performer_id: '',
    stage_ja: '',
    status: 'scheduled',
    is_stream: false,
    performance_type: 'regular' as 'regular' | 'special_final',
    round_no: '' as '' | '1' | '2' | '3',
    ranking_position: '' as '' | '1' | '2' | '3',
  })
  const [lineupPick, setLineupPick] = useState('')
  const [newEvent, setNewEvent] = useState({ slug: '', name_ja: '', name_en: '' })

  const forceEndLive = async (session: LiveSession) => {
    if (!window.confirm('このLIVEを強制終了しますか？配信者の画面にも終了状態が反映されます。')) return
    try {
      const response = await fetch('/api/livekit/force-end', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await supabaseAuthHeaders()) },
        body: JSON.stringify({ sessionId: session.id }),
      })
      if (!response.ok) throw new Error('force end failed')
      setMsg('LIVEを強制終了しました。')
      await reload(event?.id)
    } catch { setError('LIVEを終了できませんでした。再読み込みしてもう一度お試しください。') }
  }

  const reload = async (preferredId?: string) => {
    try {
      const [managed, featured, bps] = await Promise.all([listManagedEvents(), getFeaturedEvent(), getTipFeeBps()])
      const ev = managed.find((item) => item.id === (preferredId || event?.id)) ?? featured ?? managed[0] ?? null
      setEvents(managed)
      setEvent(ev)
      setFeeBps(bps)
      if (ev) {
        const [v, s, l, p, sessions, rule, ranking] = await Promise.all([
          listEventVenues(ev.id),
          listEventSlots(ev.id),
          listEventLineup(ev.id),
          listApprovedPerformers(),
          listEventLiveSessions(ev.id),
          getEventVoteRule(ev.id).catch(() => null),
          listAdminVoteRanking(ev.id).catch(() => []),
        ])
        setVenues(v)
        setSlots(s)
        setLineup(l)
        setApproved(p)
        setLives(sessions)
        setVoteRule(rule)
        setVoteRanking(ranking)
        setSlotDraft((d) => ({ ...d, venue_id: d.venue_id || v[0]?.id || '' }))
        setLineupPick((cur) => cur || p[0]?.id || '')
      }
      setError(null)
      await refreshLiveCatalog()
    } catch (e) {
      setError(e instanceof Error ? e.message : '読み込み失敗（migration 未適用の可能性）')
    }
  }

  useEffect(() => {
    void reload()
  }, [])

  const saveEvent = async () => {
    if (!event) return
    try {
      await saveFeaturedEventPatch(event.id, {
        name_ja: event.name_ja,
        name_en: event.name_en,
        presenter_ja: event.presenter_ja,
        date_label: event.date_label,
        place_label: event.place_label,
        hours_label: event.hours_label,
        weather_note_ja: event.weather_note_ja,
        hero_kicker_ja: event.hero_kicker_ja,
        main_copy_ja: event.main_copy_ja,
        sub_copy_ja: event.sub_copy_ja,
        admission_label: event.admission_label,
        starts_on: event.starts_on,
        ends_on: event.ends_on,
        status: event.status,
        is_featured: event.is_featured,
        results_published_at: event.results_published_at,
      })
      setMsg('イベントを保存しました')
      await refreshLiveCatalog()
    } catch (e) {
      setError(e instanceof Error ? e.message : '保存に失敗しました')
    }
  }

  const addEvent = async () => {
    if (!newEvent.slug.trim() || !newEvent.name_ja.trim()) return
    try {
      const created = await createEvent({ slug: newEvent.slug.trim(), name_ja: newEvent.name_ja.trim(), name_en: newEvent.name_en.trim() || newEvent.name_ja.trim() })
      setNewEvent({ slug: '', name_ja: '', name_en: '' })
      setMsg('下書きイベントを作成しました')
      await reload(created.id)
    } catch (e) { setError(e instanceof Error ? e.message : 'イベントを作成できませんでした') }
  }

  const saveVoting = async () => {
    if (!event || !voteRule) return
    try { await saveEventVoteRule(event.id, voteRule); setMsg('投票設定を保存しました'); await reload(event.id) }
    catch (e) { setError(e instanceof Error ? e.message : '投票設定を保存できませんでした') }
  }

  const publishResults = async (published: boolean) => {
    if (!event) return
    try {
      await saveEventVoteRule(event.id, { voting_open: false })
      await saveFeaturedEventPatch(event.id, { results_published_at: published ? new Date().toISOString() : null })
      setMsg(published ? '投票結果を公開しました' : '投票結果を非公開にしました')
      await reload(event.id)
    } catch (e) { setError(e instanceof Error ? e.message : '結果公開を更新できませんでした') }
  }

  const assignFinalists = async () => {
    if (!event || voteRanking.length < 3) return
    const finals = slots.filter((slot) => slot.performance_type === 'special_final').sort((a, b) => (a.ranking_position ?? 99) - (b.ranking_position ?? 99))
    if (finals.length !== 3 || !window.confirm('現在の上位3組をSPECIAL NIGHT出演枠へ設定しますか？')) return
    try {
      await Promise.all(finals.map((slot, index) => upsertEventSlot({ ...slot, performer_id: voteRanking[index].performer_id })))
      setMsg('上位3組をSPECIAL NIGHTへ設定しました。公開前に時間と会場を確認してください。')
      await reload(event.id)
    } catch (e) { setError(e instanceof Error ? e.message : '上位3組を設定できませんでした') }
  }

  const saveFee = async () => {
    try {
      await setTipFeeBps(feeBps)
      setMsg(`手数料を ${(feeBps / 100).toFixed(1)}% に更新しました`)
    } catch (e) {
      setError(e instanceof Error ? e.message : '手数料の保存に失敗しました')
    }
  }

  const saveVenue = async () => {
    if (!event || !venueDraft.id.trim() || !venueDraft.name_ja.trim()) return
    try {
      await upsertEventVenue({
        id: venueDraft.id.trim(),
        event_id: event.id,
        name_ja: venueDraft.name_ja.trim(),
        name_en: venueDraft.name_en.trim() || venueDraft.name_ja.trim(),
        blurb_ja: venueDraft.blurb_ja.trim(),
        blurb_en: venueDraft.blurb_ja.trim(),
        lat: venueDraft.lat ? Number(venueDraft.lat) : null,
        lng: venueDraft.lng ? Number(venueDraft.lng) : null,
        sort_order: venues.length,
        venue_type: venueDraft.venue_type,
      })
      setVenueDraft({ id: '', name_ja: '', name_en: '', blurb_ja: '', lat: '', lng: '', venue_type: 'stage' })
      setMsg('会場を保存しました')
      await reload()
    } catch (e) {
      setError(e instanceof Error ? e.message : '会場の保存に失敗しました')
    }
  }

  const saveSlot = async () => {
    if (!event || !slotDraft.venue_id || !slotDraft.performer_id) return
    try {
      await upsertEventSlot({
        event_id: event.id,
        venue_id: slotDraft.venue_id,
        performer_id: slotDraft.performer_id,
        date: slotDraft.date,
        start_time: slotDraft.start_time,
        end_time: slotDraft.end_time,
        stage_ja: slotDraft.stage_ja,
        stage_en: slotDraft.stage_ja,
        status: slotDraft.status,
        note_ja: '',
        note_en: '',
        is_stream: slotDraft.is_stream,
        performance_type: slotDraft.performance_type,
        round_no: slotDraft.performance_type === 'regular' && slotDraft.round_no ? Number(slotDraft.round_no) : null,
        ranking_position: slotDraft.performance_type === 'special_final' && slotDraft.ranking_position ? Number(slotDraft.ranking_position) : null,
      })
      setMsg('出演枠を追加しました')
      await reload()
    } catch (e) {
      setError(e instanceof Error ? e.message : '出演枠の保存に失敗しました')
    }
  }

  return (
    <>
      <h1 className="pl-h1">イベント管理</h1>
      <p className="pl-muted">会場・出演者・時間割はここで登録します。決まっていない時間は空のままにしてください。</p>
      {error ? <p className="pl-error">{error}</p> : null}
      {msg ? <p className="pl-muted">{msg}</p> : null}

      <div className="pl-card">
        <label><span className="pl-label">管理するイベント</span><select className="pl-input" value={event?.id ?? ''} onChange={(e) => void reload(e.target.value)}>{events.map((item) => <option key={item.id} value={item.id}>{item.name_ja}（{item.status}）</option>)}</select></label>
        <details><summary>新しいイベントを下書き作成</summary><label><span className="pl-label">URL slug</span><input className="pl-input" value={newEvent.slug} onChange={(e) => setNewEvent({ ...newEvent, slug: e.target.value })} placeholder="event-name-2027" /></label><label><span className="pl-label">イベント名</span><input className="pl-input" value={newEvent.name_ja} onChange={(e) => setNewEvent({ ...newEvent, name_ja: e.target.value })} /></label><label><span className="pl-label">英語名</span><input className="pl-input" value={newEvent.name_en} onChange={(e) => setNewEvent({ ...newEvent, name_en: e.target.value })} /></label><button type="button" className="pl-btn pl-btn--block" onClick={() => void addEvent()}>下書きを作成</button></details>
      </div>

      <div className="pl-live-tabs">
        {(['meta', 'venues', 'slots', 'lineup', 'voting', 'live'] as const).map((key) => (
          <button key={key} type="button" className="pl-live-tabs__btn" data-active={tab === key} onClick={() => setTab(key)}>
            {key === 'meta' ? '開催情報' : key === 'venues' ? '会場' : key === 'slots' ? '時間割' : key === 'lineup' ? '出演者' : key === 'voting' ? '投票' : 'LIVE'}
          </button>
        ))}
      </div>

      {tab === 'meta' ? (
        event ? (
          <>
            <div className="pl-card">
              <label>
                <span className="pl-label">イベント名（JA）</span>
                <input className="pl-input" value={event.name_ja} onChange={(e) => setEvent({ ...event, name_ja: e.target.value })} />
              </label>
              <label>
                <span className="pl-label">イベント名（EN）</span>
                <input className="pl-input" value={event.name_en} onChange={(e) => setEvent({ ...event, name_en: e.target.value })} />
              </label>
              <label>
                <span className="pl-label">Presented by</span>
                <input className="pl-input" value={event.presenter_ja} onChange={(e) => setEvent({ ...event, presenter_ja: e.target.value })} />
              </label>
              <label>
                <span className="pl-label">日程ラベル</span>
                <input className="pl-input" value={event.date_label} onChange={(e) => setEvent({ ...event, date_label: e.target.value })} />
              </label>
              <label>
                <span className="pl-label">会場</span>
                <input className="pl-input" value={event.place_label} onChange={(e) => setEvent({ ...event, place_label: e.target.value })} />
              </label>
              <label>
                <span className="pl-label">開場時間</span>
                <input className="pl-input" value={event.hours_label} onChange={(e) => setEvent({ ...event, hours_label: e.target.value })} />
              </label>
              <label>
                <span className="pl-label">運営メモ</span>
                <textarea className="pl-textarea" value={event.weather_note_ja} onChange={(e) => setEvent({ ...event, weather_note_ja: e.target.value })} />
              </label>
              <label><span className="pl-label">Hero上部コピー</span><input className="pl-input" value={event.hero_kicker_ja ?? ''} onChange={(e) => setEvent({ ...event, hero_kicker_ja: e.target.value })} /></label>
              <label><span className="pl-label">メインコピー</span><input className="pl-input" value={event.main_copy_ja ?? ''} onChange={(e) => setEvent({ ...event, main_copy_ja: e.target.value })} /></label>
              <label><span className="pl-label">サブコピー</span><input className="pl-input" value={event.sub_copy_ja ?? ''} onChange={(e) => setEvent({ ...event, sub_copy_ja: e.target.value })} /></label>
              <label><span className="pl-label">入場案内</span><input className="pl-input" value={event.admission_label ?? ''} onChange={(e) => setEvent({ ...event, admission_label: e.target.value })} /></label>
              <label><span className="pl-label">開始日</span><input className="pl-input" type="date" value={event.starts_on ?? ''} onChange={(e) => setEvent({ ...event, starts_on: e.target.value })} /></label>
              <label><span className="pl-label">終了日</span><input className="pl-input" type="date" value={event.ends_on ?? ''} onChange={(e) => setEvent({ ...event, ends_on: e.target.value })} /></label>
              <label><span className="pl-label">公開状態</span><select className="pl-input" value={event.status ?? 'draft'} onChange={(e) => setEvent({ ...event, status: e.target.value as FeaturedEvent['status'] })}><option value="draft">非公開（下書き）</option><option value="published">公開</option><option value="archived">アーカイブ</option></select></label>
              <label className="pl-muted" style={{ display: 'flex', gap: 8, alignItems: 'center' }}><input type="checkbox" checked={Boolean(event.is_featured)} onChange={(e) => setEvent({ ...event, is_featured: e.target.checked })} />HAKUの注目イベントに設定</label>
              <button type="button" className="pl-btn pl-btn--block" onClick={() => void saveEvent()}>
                開催情報を保存
              </button>
            </div>
            <div className="pl-card" style={{ marginTop: 16 }}>
              <label>
                <span className="pl-label">投げ銭手数料（bps、1000 = 10%）</span>
                <input
                  className="pl-input"
                  type="number"
                  min={0}
                  max={5000}
                  value={feeBps}
                  onChange={(e) => setFeeBps(Number(e.target.value) || 0)}
                />
              </label>
              <button type="button" className="pl-btn pl-btn--block" onClick={() => void saveFee()}>
                手数料を保存
              </button>
            </div>
            <button
              type="button"
              className="pl-btn pl-btn--ghost pl-btn--block"
              style={{ marginTop: 16 }}
              onClick={() => {
                if (!window.confirm('フォロー／推しのユーザーへ出演通知を送ります。実行しますか？')) return
                void notifyEventAppearances(event.id)
                  .then(() => setMsg('フォロー／推しへ出演通知を送りました'))
                  .catch((e) => setError(e instanceof Error ? e.message : '通知に失敗しました'))
              }}
            >
              出演者のフォロワーへ通知する
            </button>
          </>
        ) : (
          <p className="pl-muted">イベント行がまだありません。Supabase で 20260902_launch_foundation.sql を実行してください。</p>
        )
      ) : null}

      {tab === 'venues' ? (
        <>
          {venues.map((v) => (
            <div key={v.id} className="pl-card">
              <div style={{ fontWeight: 700 }}>{v.name_ja}</div>
              <div className="pl-muted">
                {v.id}
                {v.lat != null && v.lng != null ? ` · ${v.lat}, ${v.lng}` : ''}
              </div>
              <button
                type="button"
                className="pl-btn pl-btn--ghost"
                onClick={() => {
                  if (!window.confirm(`${v.name_ja} を削除します。実行しますか？`)) return
                  void deleteEventVenue(v.id)
                    .then(() => reload())
                    .catch((e) => setError(e instanceof Error ? e.message : '削除失敗'))
                }}
              >
                削除
              </button>
            </div>
          ))}
          <div className="pl-card">
            <p className="pl-muted">会場を追加</p>
            <input className="pl-input" placeholder="ID（例: east-lawn）" value={venueDraft.id} onChange={(e) => setVenueDraft({ ...venueDraft, id: e.target.value })} />
            <input className="pl-input" placeholder="会場名 JA" value={venueDraft.name_ja} onChange={(e) => setVenueDraft({ ...venueDraft, name_ja: e.target.value })} />
            <input className="pl-input" placeholder="会場名 EN" value={venueDraft.name_en} onChange={(e) => setVenueDraft({ ...venueDraft, name_en: e.target.value })} />
            <input className="pl-input" placeholder="説明" value={venueDraft.blurb_ja} onChange={(e) => setVenueDraft({ ...venueDraft, blurb_ja: e.target.value })} />
            <select className="pl-input" value={venueDraft.venue_type} onChange={(e) => setVenueDraft({ ...venueDraft, venue_type: e.target.value as EventVenueRow['venue_type'] })}><option value="stage">ステージ</option><option value="statue">スタチュー</option><option value="roving">回遊</option><option value="food">グルメ / キッチンカー</option><option value="other">その他</option></select>
            <input className="pl-input" placeholder="緯度" value={venueDraft.lat} onChange={(e) => setVenueDraft({ ...venueDraft, lat: e.target.value })} />
            <input className="pl-input" placeholder="経度" value={venueDraft.lng} onChange={(e) => setVenueDraft({ ...venueDraft, lng: e.target.value })} />
            <button type="button" className="pl-btn pl-btn--block" onClick={() => void saveVenue()}>
              会場を保存
            </button>
          </div>
        </>
      ) : null}

      {tab === 'slots' ? (
        <>
          {slots.length === 0 ? (
            <p className="pl-muted">正式な出演時間が決まるまで空のままです。決まったら下のフォームから追加してください。仮の時間は入れないでください。</p>
          ) : null}
          {slots.map((s) => {
            const act = approved.find((p) => p.id === s.performer_id)
            const venue = venues.find((v) => v.id === s.venue_id)
            return (
              <div key={s.id} className="pl-card">
                <div style={{ fontWeight: 700 }}>
                  {s.date} {s.start_time}–{s.end_time}
                </div>
                <div className="pl-muted">
                  {act?.stage_name ?? '未定'} · {venue?.name_ja ?? s.venue_id} · {s.status}
                  {s.is_stream ? ' · 配信枠' : ''}
                </div>
                <button
                  type="button"
                  className="pl-btn pl-btn--ghost"
                  onClick={() => {
                    if (!window.confirm(`${s.date} ${s.start_time} の出演枠を削除します。実行しますか？`)) return
                    void deleteEventSlot(s.id)
                      .then(() => reload())
                      .catch((e) => setError(e instanceof Error ? e.message : '削除失敗'))
                  }}
                >
                  削除
                </button>
              </div>
            )
          })}
          <div className="pl-card">
            <p className="pl-muted">出演枠を追加（承認済みパフォーマーのみ）</p>
            <input className="pl-input" type="date" value={slotDraft.date} onChange={(e) => setSlotDraft({ ...slotDraft, date: e.target.value })} />
            <input className="pl-input" type="time" value={slotDraft.start_time} onChange={(e) => setSlotDraft({ ...slotDraft, start_time: e.target.value })} />
            <input className="pl-input" type="time" value={slotDraft.end_time} onChange={(e) => setSlotDraft({ ...slotDraft, end_time: e.target.value })} />
            <select className="pl-input" value={slotDraft.venue_id} onChange={(e) => setSlotDraft({ ...slotDraft, venue_id: e.target.value })}>
              <option value="">会場</option>
              {venues.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name_ja}
                </option>
              ))}
            </select>
            <select className="pl-input" value={slotDraft.performer_id} onChange={(e) => setSlotDraft({ ...slotDraft, performer_id: e.target.value })}>
              <option value="">パフォーマー</option>
              {approved.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.stage_name}
                </option>
              ))}
            </select>
            <input className="pl-input" placeholder="ステージ名" value={slotDraft.stage_ja} onChange={(e) => setSlotDraft({ ...slotDraft, stage_ja: e.target.value })} />
            <select className="pl-input" value={slotDraft.status} onChange={(e) => setSlotDraft({ ...slotDraft, status: e.target.value })}>
              <option value="scheduled">予定</option>
              <option value="live">LIVE</option>
              <option value="next">NEXT</option>
              <option value="cancelled">中止</option>
            </select>
            <select className="pl-input" value={slotDraft.performance_type} onChange={(e) => setSlotDraft({ ...slotDraft, performance_type: e.target.value as 'regular' | 'special_final', round_no: '', ranking_position: '' })}><option value="regular">通常公演</option><option value="special_final">SPECIAL NIGHT</option></select>
            {slotDraft.performance_type === 'regular' ? <select className="pl-input" value={slotDraft.round_no} onChange={(e) => setSlotDraft({ ...slotDraft, round_no: e.target.value as '' | '1' | '2' | '3' })}><option value="">公演回（任意）</option><option value="1">1回目</option><option value="2">2回目</option><option value="3">3回目</option></select> : <select className="pl-input" value={slotDraft.ranking_position} onChange={(e) => setSlotDraft({ ...slotDraft, ranking_position: e.target.value as '' | '1' | '2' | '3' })}><option value="">順位枠</option><option value="1">1位</option><option value="2">2位</option><option value="3">3位</option></select>}
            <label className="pl-muted" style={{ display: 'flex', gap: 8, alignItems: 'center', margin: '8px 0' }}>
              <input
                type="checkbox"
                checked={slotDraft.is_stream}
                onChange={(e) => setSlotDraft({ ...slotDraft, is_stream: e.target.checked })}
              />
              配信枠（LIVE予定）
            </label>
            <button type="button" className="pl-btn pl-btn--block" onClick={() => void saveSlot()}>
              出演枠を追加
            </button>
          </div>
        </>
      ) : null}

      {tab === 'lineup' ? (
        <>
          {lineup.length === 0 ? (
            <p className="pl-muted">このイベントの公式出演者はまだ未登録です。承認済みパフォーマーから追加できます。</p>
          ) : null}
          {lineup.map((id) => {
            const p = approved.find((x) => x.id === id)
            return (
              <div key={id} className="pl-card pl-row">
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700 }}>{p?.stage_name ?? id}</div>
                  <div className="pl-muted">{p?.genre}</div>
                </div>
                <button
                  type="button"
                  className="pl-btn pl-btn--ghost"
                  onClick={() => {
                    if (!event) return
                    if (!window.confirm(`${p?.stage_name ?? id} をラインナップから外します。実行しますか？`)) return
                    void removeEventLineup(event.id, id)
                      .then(() => reload())
                      .catch((e) => setError(e instanceof Error ? e.message : '削除失敗'))
                  }}
                >
                  外す
                </button>
              </div>
            )
          })}
          <div className="pl-card">
            <select className="pl-input" value={lineupPick} onChange={(e) => setLineupPick(e.target.value)}>
              {approved.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.stage_name}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="pl-btn pl-btn--block"
              onClick={() =>
                event && lineupPick
                  ? void addEventLineup(event.id, lineupPick)
                      .then(() => reload())
                      .catch((e) => setError(e instanceof Error ? e.message : '追加失敗'))
                  : undefined
              }
            >
              出演者を追加
            </button>
          </div>
        </>
      ) : null}

      {tab === 'voting' ? (
        <>
          {!voteRule ? <p className="pl-error">安全な投票migrationが未適用です。適用前は投票を開始できません。</p> : <div className="pl-card"><h2 className="pl-h2">投票受付</h2><label className="pl-muted" style={{ display: 'flex', gap: 8, alignItems: 'center' }}><input type="checkbox" checked={voteRule.voting_open} onChange={(e) => setVoteRule({ ...voteRule, voting_open: e.target.checked })} />投票受付を開始</label><label><span className="pl-label">1日あたりの投票上限</span><input className="pl-input" type="number" min={1} max={10} value={voteRule.votes_per_user_per_day} onChange={(e) => setVoteRule({ ...voteRule, votes_per_user_per_day: Math.max(1, Math.min(10, Number(e.target.value) || 1)) })} /></label><label><span className="pl-label">投票開始日時</span><input className="pl-input" type="datetime-local" value={voteRule.voting_starts_at?.slice(0, 16) ?? ''} onChange={(e) => setVoteRule({ ...voteRule, voting_starts_at: e.target.value ? new Date(e.target.value).toISOString() : null })} /></label><label><span className="pl-label">投票終了日時</span><input className="pl-input" type="datetime-local" value={voteRule.voting_ends_at?.slice(0, 16) ?? ''} onChange={(e) => setVoteRule({ ...voteRule, voting_ends_at: e.target.value ? new Date(e.target.value).toISOString() : null })} /></label><button className="pl-btn pl-btn--block" onClick={() => void saveVoting()}>投票設定を保存</button></div>}
          <div className="pl-card"><h2 className="pl-h2">途中集計（運営のみ）</h2>{voteRanking.length === 0 ? <p className="pl-muted">投票はまだありません。</p> : voteRanking.map((row, index) => <p key={row.performer_id}><strong>{index + 1}位 {approved.find((performer) => performer.id === row.performer_id)?.stage_name ?? row.performer_id}</strong>・{row.votes}票</p>)}<button className="pl-btn pl-btn--ghost pl-btn--block" disabled={voteRanking.length < 3} onClick={() => void assignFinalists()}>上位3組をSPECIAL NIGHTへ設定</button><button className="pl-btn pl-btn--block" onClick={() => void publishResults(!event?.results_published_at)}>{event?.results_published_at ? '結果を非公開に戻す' : '投票を終了して結果を公開'}</button><p className="pl-muted">結果公開までは一般ユーザーに途中順位を表示しません。</p></div>
        </>
      ) : null}

      {tab === 'live' ? (
        <>
          <p className="pl-muted">配信はパフォーマーが開始します。ここはイベントに紐づいたセッションの確認です。</p>
          {lives.length === 0 ? (
            <p className="pl-muted">このイベントの配信記録はまだありません。</p>
          ) : (
            lives.map((s) => {
              const act = approved.find((p) => p.id === s.performer_id)
              const liveNow = !s.ended_at
              return (
                <div key={s.id} className="pl-card">
                  <div style={{ fontWeight: 700 }}>{act?.stage_name ?? s.performer_id}</div>
                  <div className="pl-muted">
                    {liveNow ? '配信中' : '配信終了'} · {s.title || '無題'} · 視聴ピーク {s.viewer_peak} · 投げ銭 {s.tip_count}件
                  </div>
                  <div className="pl-muted">
                    {s.started_at}
                    {s.ended_at ? ` → ${s.ended_at}` : ''}
                    {s.venue_id ? ` · ${s.venue_id}` : ''}
                  </div>
                  {liveNow ? <button type="button" className="pl-btn pl-btn--danger pl-btn--block" onClick={() => void forceEndLive(s)}>LIVEを強制終了</button> : null}
                </div>
              )
            })
          )}
        </>
      ) : null}
    </>
  )
}
