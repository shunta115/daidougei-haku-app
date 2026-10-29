import { useEffect, useMemo, useState } from 'react'
import { CalendarDays, Save, Send, Trash2, XCircle } from 'lucide-react'
import { useLang } from '../../i18n/LangProvider'
import { useAuth } from '../lib/auth'
import {
  createPerformerAppearance,
  deletePerformerAppearance,
  listPerformerAppearances,
  updatePerformerAppearance,
  type PerformerAppearanceInput,
} from '../lib/api'
import type { PerformerAppearance, PerformerAppearanceStatus } from '../lib/types'

const empty = (): PerformerAppearanceInput => ({
  title: '', performance_date: '', start_time: '', end_time: null,
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Tokyo',
  venue_name: '', venue_address: '', venue_lat: null, venue_lng: null, region: '', country: 'Japan', description: '',
  admission_type: 'free', admission_details: '', image_url: null, ticket_url: null,
  is_live_planned: false, rain_policy: '', organizer_info: '', notes: '', status: 'draft',
})

const copy = {
  ja: { title: '出演予定を管理', lead: '下書きは通知されません。初回公開・重要変更・中止時のみフォロワーへ通知します。', new: '新しい出演予定', event: '公演名・イベント名', date: '開催日', start: '開始時間', end: '終了時間', venue: '会場名', address: '会場住所', coordinates: '会場座標（任意・確認済みの場合のみ）', region: '開催地域', country: '国・地域', timezone: 'タイムゾーン', description: '出演内容・紹介文', admission: '料金区分', admissionDetails: '料金詳細', image: '告知画像URL', ticket: 'チケット・予約URL', live: 'LIVE配信予定', rain: '雨天時の対応', notes: 'その他のお知らせ', draft: '下書き保存', publish: '公開', private: '非公開', cancel: '中止', delete: '削除', edit: '編集', saved: '保存しました', failed: '保存できませんでした。入力内容はこの端末に保持しています。', required: '公演名・開催日・開始時間・会場名を入力してください。', duplicate: '同じ出演予定がすでに登録されています。', empty: '登録した出演予定はありません。', free: '無料', paid: '有料', tip: '投げ銭', confirmCancel: 'この公演を中止にしますか？フォロワーへ中止通知が作成されます。' },
  en: { title: 'Manage appearances', lead: 'Drafts never notify. Followers are notified only on first publish, important changes, and cancellation.', new: 'New appearance', event: 'Performance or event name', date: 'Date', start: 'Start time', end: 'End time', venue: 'Venue', address: 'Venue address', coordinates: 'Venue coordinates (optional, verified only)', region: 'Region', country: 'Country / region', timezone: 'Time zone', description: 'Description', admission: 'Admission', admissionDetails: 'Admission details', image: 'Announcement image URL', ticket: 'Ticket / booking URL', live: 'LIVE stream planned', rain: 'Rain policy', notes: 'Other information', draft: 'Save draft', publish: 'Publish', private: 'Make private', cancel: 'Cancel event', delete: 'Delete', edit: 'Edit', saved: 'Saved.', failed: 'Could not save. Your input remains on this device.', required: 'Enter the event name, date, start time, and venue.', duplicate: 'This appearance is already registered.', empty: 'No appearances registered.', free: 'Free', paid: 'Paid', tip: 'Tips', confirmCancel: 'Cancel this performance? A cancellation alert will be created for followers.' },
  'zh-TW': { title: '管理演出預定', lead: '草稿不會通知。僅在首次公開、重要變更及取消時通知追蹤者。', new: '新增演出預定', event: '演出／活動名稱', date: '日期', start: '開始時間', end: '結束時間', venue: '會場名稱', address: '會場地址', coordinates: '會場座標（選填，僅限已確認）', region: '地區', country: '國家／地區', timezone: '時區', description: '演出介紹', admission: '費用', admissionDetails: '費用詳情', image: '宣傳圖片URL', ticket: '票券／預約URL', live: '預定LIVE直播', rain: '雨天方案', notes: '其他通知', draft: '儲存草稿', publish: '公開', private: '設為非公開', cancel: '取消演出', delete: '刪除', edit: '編輯', saved: '已儲存', failed: '無法儲存。輸入內容已保留在此裝置。', required: '請輸入活動名稱、日期、開始時間及會場。', duplicate: '相同的演出預定已存在。', empty: '尚未登錄演出預定。', free: '免費', paid: '付費', tip: '自由贊助', confirmCancel: '確定取消此演出？將建立取消通知給追蹤者。' },
} as const

const extendedCopy = {
  ja: { organizer: '主催者情報', postpone: '延期', archive: 'アーカイブ', upcoming: '今後の出演予定', history: '過去・アーカイブ', confirmPostpone: 'この公演を延期にしますか？フォロワーへ延期通知が作成されます。', confirmArchive: 'この予定をアーカイブしますか？公開表示と通知の対象外になります。' },
  en: { organizer: 'Organizer information', postpone: 'Postpone', archive: 'Archive', upcoming: 'Upcoming appearances', history: 'Past and archived', confirmPostpone: 'Postpone this performance? A postponement alert will be created for followers.', confirmArchive: 'Archive this appearance? It will be hidden from public listings and notifications.' },
  'zh-TW': { organizer: '主辦單位資訊', postpone: '延期', archive: '封存', upcoming: '即將舉行', history: '過去與封存', confirmPostpone: '確定延期此演出？將建立延期通知給追蹤者。', confirmArchive: '確定封存此預定？公開頁面與通知將不再顯示。' },
} as const

function cleanUrl(value: string | null) {
  const next = value?.trim() || ''
  if (!next) return null
  const parsed = new URL(next)
  if (parsed.protocol !== 'https:') throw new Error('invalid_url')
  return parsed.href
}

export function PerformerAppearanceManager() {
  const { performer } = useAuth()
  const { lang } = useLang()
  const text = { ...copy[lang], ...extendedCopy[lang] }
  const storageKey = performer ? `haku:appearance-draft:${performer.id}` : ''
  const [rows, setRows] = useState<PerformerAppearance[]>([])
  const [form, setForm] = useState<PerformerAppearanceInput>(empty)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const reload = async () => {
    if (!performer) return
    setRows(await listPerformerAppearances(performer.id, true))
  }
  useEffect(() => { void reload().catch(() => setError(text.failed)) }, [performer?.id])
  useEffect(() => {
    if (!storageKey || !window.localStorage) return
    try {
      const stored = window.localStorage.getItem(storageKey)
      if (stored) setForm({ ...empty(), ...JSON.parse(stored) as PerformerAppearanceInput, status: 'draft' })
    } catch { /* ignore corrupt local draft */ }
  }, [storageKey])
  useEffect(() => {
    if (!storageKey || editingId || !window.localStorage) return
    window.localStorage.setItem(storageKey, JSON.stringify(form))
  }, [editingId, form, storageKey])

  const sorted = useMemo(() => [...rows].sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at)), [rows])
  const upcoming = sorted.filter((row) => row.status !== 'archived' && Date.parse(row.ends_at ?? row.starts_at) >= Date.now())
  const history = sorted.filter((row) => row.status === 'archived' || Date.parse(row.ends_at ?? row.starts_at) < Date.now()).reverse()
  const change = <K extends keyof PerformerAppearanceInput>(key: K, value: PerformerAppearanceInput[K]) => setForm((current) => ({ ...current, [key]: value }))
  const reset = () => { setEditingId(null); setForm(empty()); setError(null); if (storageKey && window.localStorage) window.localStorage.removeItem(storageKey) }
  const edit = (row: PerformerAppearance) => {
    setEditingId(row.id)
    setForm({
      title: row.title, performance_date: row.performance_date, start_time: row.start_time.slice(0, 5), end_time: row.end_time?.slice(0, 5) ?? null,
      timezone: row.timezone, venue_name: row.venue_name, venue_address: row.venue_address, venue_lat: row.venue_lat, venue_lng: row.venue_lng, region: row.region, country: row.country,
      description: row.description, admission_type: row.admission_type, admission_details: row.admission_details,
      image_url: row.image_url, ticket_url: row.ticket_url, is_live_planned: row.is_live_planned, rain_policy: row.rain_policy, organizer_info: row.organizer_info, notes: row.notes, status: row.status,
    })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }
  const save = async (status: PerformerAppearanceStatus) => {
    if (!performer || busy) return
    if (!form.title.trim() || !form.performance_date || !form.start_time || !form.venue_name.trim()) { setError(text.required); return }
    if (status === 'cancelled' && !window.confirm(text.confirmCancel)) return
    if (status === 'postponed' && !window.confirm(text.confirmPostpone)) return
    if (status === 'archived' && !window.confirm(text.confirmArchive)) return
    setBusy(true); setError(null); setMessage(null)
    try {
      const input = { ...form, title: form.title.trim(), venue_name: form.venue_name.trim(), image_url: cleanUrl(form.image_url), ticket_url: cleanUrl(form.ticket_url), end_time: form.end_time || null, status }
      if (editingId) await updatePerformerAppearance(editingId, input)
      else await createPerformerAppearance(performer.id, input)
      await reload(); reset(); setMessage(text.saved)
    } catch (cause) {
      const duplicate = typeof cause === 'object' && cause && 'code' in cause && cause.code === '23505'
      setError(duplicate ? text.duplicate : text.failed)
    } finally { setBusy(false) }
  }
  const remove = async (row: PerformerAppearance) => {
    if (busy || !window.confirm(text.delete)) return
    setBusy(true)
    try { await deletePerformerAppearance(row.id); await reload(); if (editingId === row.id) reset() }
    catch { setError(text.failed) }
    finally { setBusy(false) }
  }

  return <div className="pl-appearance-manager">
    <header><p className="pl-brand">APPEARANCES</p><h1 className="pl-h1">{text.title}</h1><p className="pl-muted">{text.lead}</p></header>
    <section className="pl-registration__section pl-appearance-form">
      <h2 className="pl-h2">{editingId ? text.edit : text.new}</h2>
      <label>{text.event}<input className="pl-input" maxLength={120} required value={form.title} onChange={(e) => change('title', e.target.value)} /></label>
      <div className="pl-appearance-form__grid"><label>{text.date}<input className="pl-input" type="date" required value={form.performance_date} onChange={(e) => change('performance_date', e.target.value)} /></label><label>{text.start}<input className="pl-input" type="time" required value={form.start_time} onChange={(e) => change('start_time', e.target.value)} /></label><label>{text.end}<input className="pl-input" type="time" value={form.end_time ?? ''} onChange={(e) => change('end_time', e.target.value || null)} /></label></div>
      <label>{text.timezone}<input className="pl-input" required value={form.timezone} onChange={(e) => change('timezone', e.target.value)} /></label>
      <label>{text.venue}<input className="pl-input" maxLength={160} required value={form.venue_name} onChange={(e) => change('venue_name', e.target.value)} /></label>
      <label>{text.address}<input className="pl-input" value={form.venue_address} onChange={(e) => change('venue_address', e.target.value)} /></label>
      <fieldset><legend>{text.coordinates}</legend><div className="pl-appearance-form__grid"><label>Latitude<input className="pl-input" type="number" min="-90" max="90" step="any" value={form.venue_lat ?? ''} onChange={(e) => change('venue_lat', e.target.value === '' ? null : Number(e.target.value))} /></label><label>Longitude<input className="pl-input" type="number" min="-180" max="180" step="any" value={form.venue_lng ?? ''} onChange={(e) => change('venue_lng', e.target.value === '' ? null : Number(e.target.value))} /></label></div></fieldset>
      <div className="pl-appearance-form__grid"><label>{text.region}<input className="pl-input" value={form.region} onChange={(e) => change('region', e.target.value)} /></label><label>{text.country}<input className="pl-input" value={form.country} onChange={(e) => change('country', e.target.value)} /></label></div>
      <label>{text.description}<textarea className="pl-input" rows={4} value={form.description} onChange={(e) => change('description', e.target.value)} /></label>
      <label>{text.admission}<select className="pl-input" value={form.admission_type} onChange={(e) => change('admission_type', e.target.value as PerformerAppearanceInput['admission_type'])}><option value="free">{text.free}</option><option value="paid">{text.paid}</option><option value="tip">{text.tip}</option></select></label>
      <label>{text.admissionDetails}<input className="pl-input" value={form.admission_details} onChange={(e) => change('admission_details', e.target.value)} /></label>
      <label>{text.image}<input className="pl-input" type="url" inputMode="url" value={form.image_url ?? ''} onChange={(e) => change('image_url', e.target.value || null)} /></label>
      <label>{text.ticket}<input className="pl-input" type="url" inputMode="url" value={form.ticket_url ?? ''} onChange={(e) => change('ticket_url', e.target.value || null)} /></label>
      <label className="pl-registration__toggle"><input type="checkbox" checked={form.is_live_planned} onChange={(e) => change('is_live_planned', e.target.checked)} />{text.live}</label>
      <label>{text.rain}<input className="pl-input" value={form.rain_policy} onChange={(e) => change('rain_policy', e.target.value)} /></label>
      <label>{text.organizer}<textarea className="pl-input" rows={2} value={form.organizer_info} onChange={(e) => change('organizer_info', e.target.value)} /></label>
      <label>{text.notes}<textarea className="pl-input" rows={3} value={form.notes} onChange={(e) => change('notes', e.target.value)} /></label>
      {error ? <p className="pl-error" role="alert">{error}</p> : null}{message ? <p className="pl-registration__notice" role="status">{message}</p> : null}
      <div className="pl-appearance-actions"><button className="pl-btn pl-btn--ghost" disabled={busy} onClick={() => void save('draft')}><Save size={17} />{text.draft}</button><button className="pl-btn" disabled={busy} onClick={() => void save('published')}><Send size={17} />{text.publish}</button>{editingId ? <button className="pl-btn pl-btn--ghost" disabled={busy} onClick={() => void save('private')}>{text.private}</button> : null}{editingId ? <button className="pl-btn pl-btn--ghost" disabled={busy} onClick={() => void save('postponed')}>{text.postpone}</button> : null}{editingId ? <button className="pl-btn pl-btn--danger" disabled={busy} onClick={() => void save('cancelled')}><XCircle size={17} />{text.cancel}</button> : null}{editingId ? <button className="pl-btn pl-btn--ghost" disabled={busy} onClick={() => void save('archived')}>{text.archive}</button> : null}</div>
    </section>
    <section className="pl-appearance-list">{sorted.length === 0 ? <p className="pl-muted">{text.empty}</p> : null}{upcoming.length ? <><h2 className="pl-h2">{text.upcoming}</h2>{upcoming.map((row) => <AppearanceRow key={row.id} row={row} busy={busy} text={text} edit={edit} remove={remove} />)}</> : null}{history.length ? <><h2 className="pl-h2">{text.history}</h2>{history.map((row) => <AppearanceRow key={row.id} row={row} busy={busy} text={text} edit={edit} remove={remove} />)}</> : null}</section>
  </div>
}

function AppearanceRow({ row, busy, text, edit, remove }: { row: PerformerAppearance; busy: boolean; text: typeof copy[keyof typeof copy] & typeof extendedCopy[keyof typeof extendedCopy]; edit: (row: PerformerAppearance) => void; remove: (row: PerformerAppearance) => Promise<void> }) {
  return <article className="pl-card"><span className="pl-registration__status">{row.status}</span><h2 className="pl-h2">{row.title}</h2><p><CalendarDays size={16} /> {row.performance_date} {row.start_time.slice(0, 5)}・{row.venue_name}</p><div className="pl-appearance-actions"><button className="pl-btn pl-btn--ghost" disabled={busy} onClick={() => edit(row)}>{text.edit}</button>{['draft', 'private', 'archived'].includes(row.status) ? <button className="pl-btn pl-btn--danger" disabled={busy} onClick={() => void remove(row)}><Trash2 size={16} />{text.delete}</button> : null}</div></article>
}
