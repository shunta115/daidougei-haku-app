import { useEffect, useState } from 'react'
import {
  addEventLineup,
  deleteEventSlot,
  deleteEventVenue,
  getFeaturedEvent,
  getTipFeeBps,
  listApprovedPerformers,
  listEventLineup,
  listEventLiveSessions,
  listEventSlots,
  listEventVenues,
  notifyEventAppearances,
  removeEventLineup,
  saveFeaturedEventPatch,
  setTipFeeBps,
  upsertEventSlot,
  upsertEventVenue,
  type EventSlotRow,
  type EventVenueRow,
} from '../lib/api'
import type { LiveSession, Performer } from '../lib/types'
import { refreshLiveCatalog } from '../../catalog/liveCatalog'

type Tab = 'meta' | 'venues' | 'slots' | 'lineup' | 'live'

export function AdminEventScreen() {
  const [tab, setTab] = useState<Tab>('meta')
  const [event, setEvent] = useState<Awaited<ReturnType<typeof getFeaturedEvent>>>(null)
  const [feeBps, setFeeBps] = useState(1000)
  const [venues, setVenues] = useState<EventVenueRow[]>([])
  const [slots, setSlots] = useState<EventSlotRow[]>([])
  const [lineup, setLineup] = useState<string[]>([])
  const [lives, setLives] = useState<LiveSession[]>([])
  const [approved, setApproved] = useState<Performer[]>([])
  const [error, setError] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)

  const [venueDraft, setVenueDraft] = useState({ id: '', name_ja: '', name_en: '', blurb_ja: '', lat: '', lng: '' })
  const [slotDraft, setSlotDraft] = useState({
    date: '2026-10-10',
    start_time: '12:00',
    end_time: '12:30',
    venue_id: '',
    performer_id: '',
    stage_ja: '',
    status: 'scheduled',
    is_stream: false,
  })
  const [lineupPick, setLineupPick] = useState('')

  const reload = async () => {
    try {
      const [ev, bps] = await Promise.all([getFeaturedEvent(), getTipFeeBps()])
      setEvent(ev)
      setFeeBps(bps)
      if (ev) {
        const [v, s, l, p, sessions] = await Promise.all([
          listEventVenues(ev.id),
          listEventSlots(ev.id),
          listEventLineup(ev.id),
          listApprovedPerformers(),
          listEventLiveSessions(ev.id),
        ])
        setVenues(v)
        setSlots(s)
        setLineup(l)
        setApproved(p)
        setLives(sessions)
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
      })
      setMsg('イベントを保存しました')
      await refreshLiveCatalog()
    } catch (e) {
      setError(e instanceof Error ? e.message : '保存に失敗しました')
    }
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
      })
      setVenueDraft({ id: '', name_ja: '', name_en: '', blurb_ja: '', lat: '', lng: '' })
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

      <div className="pl-live-tabs">
        {(['meta', 'venues', 'slots', 'lineup', 'live'] as const).map((key) => (
          <button key={key} type="button" className="pl-live-tabs__btn" data-active={tab === key} onClick={() => setTab(key)}>
            {key === 'meta' ? '開催情報' : key === 'venues' ? '会場' : key === 'slots' ? '時間割' : key === 'lineup' ? '出演者' : 'LIVE'}
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
                    .then(reload)
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
                      .then(reload)
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
                      .then(reload)
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
                      .then(reload)
                      .catch((e) => setError(e instanceof Error ? e.message : '追加失敗'))
                  : undefined
              }
            >
              出演者を追加
            </button>
          </div>
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
                </div>
              )
            })
          )}
        </>
      ) : null}
    </>
  )
}
