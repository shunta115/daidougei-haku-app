import { useEffect, useMemo, useState } from 'react'
import { Bell, Download, Heart, MapPin, Search } from 'lucide-react'
import { useLang } from '../../i18n/LangProvider'
import { useAuth } from '../lib/auth'
import {
  listAppearanceFavoriteIds,
  listAppearanceReminders,
  listFollowedPerformers,
  listPublicAppearanceCalendar,
  setAppearanceFavorite,
  setAppearanceReminder,
} from '../lib/api'
import { downloadAppearanceIcs } from '../lib/appearanceIcs'
import type { AppearanceCalendarItem, AppearanceReminderOffset } from '../lib/types'
import './appearance-calendar.css'

type Props = { onOpenPerformer: (id: string) => void }
type Period = 'today' | 'week' | 'month' | 'all'

const copy = {
  ja: { title: '出演予定カレンダー', lead: '日付・地域・出演者から公演を探せます。', search: '出演者・公演名・会場', region: '地域', today: '今日', week: '今週', month: '今月', all: 'すべて', following: 'フォロー中', saved: '保存済み', empty: '条件に一致する出演予定はありません。', save: '保存', reminder: '通知', login: '保存とリマインダーにはログインが必要です。', map: 'MAP', profile: '出演者', cancelled: '中止', postponed: '延期', failed: '更新できませんでした。通信を確認してください。' },
  en: { title: 'Appearance calendar', lead: 'Find performances by date, region, or performer.', search: 'Performer, event, or venue', region: 'Region', today: 'Today', week: 'This week', month: 'This month', all: 'All', following: 'Following', saved: 'Saved', empty: 'No appearances match these filters.', save: 'Save', reminder: 'Reminder', login: 'Sign in to save appearances and set reminders.', map: 'Map', profile: 'Performer', cancelled: 'Cancelled', postponed: 'Postponed', failed: 'Could not update. Check your connection.' },
  'zh-TW': { title: '演出行程', lead: '可依日期、地區或表演者搜尋演出。', search: '表演者、活動或會場', region: '地區', today: '今天', week: '本週', month: '本月', all: '全部', following: '追蹤中', saved: '已收藏', empty: '沒有符合條件的演出。', save: '收藏', reminder: '提醒', login: '登入後可收藏演出並設定提醒。', map: '地圖', profile: '表演者', cancelled: '已取消', postponed: '已延期', failed: '無法更新，請確認網路連線。' },
} as const

function day(value: Date) { return value.toLocaleDateString('en-CA') }

export function AppearanceCalendar({ onOpenPerformer }: Props) {
  const { user } = useAuth()
  const { lang } = useLang()
  const text = copy[lang]
  const [rows, setRows] = useState<AppearanceCalendarItem[]>([])
  const [favorites, setFavorites] = useState<Set<string>>(new Set())
  const [reminders, setReminders] = useState<Map<string, Set<number>>>(new Map())
  const [following, setFollowing] = useState<Set<string>>(new Set())
  const [period, setPeriod] = useState<Period>('month')
  const [query, setQuery] = useState('')
  const [region, setRegion] = useState('')
  const [month, setMonth] = useState(day(new Date()).slice(0, 7))
  const [followingOnly, setFollowingOnly] = useState(false)
  const [savedOnly, setSavedOnly] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    setLoading(true)
    Promise.all([
      listPublicAppearanceCalendar(),
      user ? listAppearanceFavoriteIds(user.id).catch(() => []) : Promise.resolve([]),
      user ? listAppearanceReminders(user.id).catch(() => []) : Promise.resolve([]),
      user ? listFollowedPerformers(user.id).catch(() => []) : Promise.resolve([]),
    ]).then(([appearances, favoriteIds, reminderRows, followed]) => {
      if (!active) return
      setRows(appearances)
      setFavorites(new Set(favoriteIds))
      const next = new Map<string, Set<number>>()
      for (const reminder of reminderRows) {
        if (!reminder.enabled || reminder.status === 'cancelled') continue
        const offsets = next.get(reminder.appearance_id) ?? new Set<number>()
        offsets.add(reminder.offset_minutes)
        next.set(reminder.appearance_id, offsets)
      }
      setReminders(next)
      setFollowing(new Set(followed.map((performer) => performer.id)))
      setError(null)
    }).catch(() => active && setError(text.failed)).finally(() => active && setLoading(false))
    return () => { active = false }
  }, [user?.id, text.failed])

  const visible = useMemo(() => {
    const now = new Date()
    const today = day(now)
    const weekEnd = new Date(now); weekEnd.setDate(weekEnd.getDate() + 7)
    const needle = query.trim().toLocaleLowerCase()
    const regionNeedle = region.trim().toLocaleLowerCase()
    return rows.filter((row) => {
      const rowDay = row.performance_date
      if (period === 'today' && rowDay !== today) return false
      if (period === 'week' && (rowDay < today || rowDay > day(weekEnd))) return false
      if (period === 'month' && !rowDay.startsWith(month)) return false
      if (followingOnly && !following.has(row.performer_id)) return false
      if (savedOnly && !favorites.has(row.id)) return false
      if (regionNeedle && !`${row.region} ${row.country} ${row.venue_address}`.toLocaleLowerCase().includes(regionNeedle)) return false
      if (needle && !`${row.title} ${row.venue_name} ${row.performer?.stage_name ?? ''} ${row.participants.map((performer) => performer.stage_name).join(' ')}`.toLocaleLowerCase().includes(needle)) return false
      return true
    })
  }, [favorites, following, followingOnly, month, period, query, region, rows, savedOnly])

  const toggleFavorite = async (row: AppearanceCalendarItem) => {
    if (!user) { setError(text.login); return }
    const enabled = !favorites.has(row.id)
    try {
      await setAppearanceFavorite(user.id, row.id, enabled)
      setFavorites((current) => { const next = new Set(current); enabled ? next.add(row.id) : next.delete(row.id); return next })
    } catch { setError(text.failed) }
  }

  const toggleReminder = async (row: AppearanceCalendarItem, offset: AppearanceReminderOffset) => {
    if (!user) { setError(text.login); return }
    const enabled = !(reminders.get(row.id)?.has(offset) ?? false)
    try {
      await setAppearanceReminder(user.id, row.id, offset, enabled)
      setReminders((current) => {
        const next = new Map(current); const offsets = new Set(next.get(row.id) ?? [])
        enabled ? offsets.add(offset) : offsets.delete(offset)
        offsets.size ? next.set(row.id, offsets) : next.delete(row.id)
        return next
      })
    } catch { setError(text.failed) }
  }

  return <section className="pl-appearance-calendar" aria-label={text.title}>
    <header><p className="pl-brand">SCHEDULE</p><h2 className="pl-h1">{text.title}</h2><p className="pl-muted">{text.lead}</p></header>
    <div className="pl-calendar-search"><Search size={18} /><input aria-label={text.search} placeholder={text.search} value={query} onChange={(event) => setQuery(event.target.value)} /></div>
    <div className="pl-calendar-filters"><input aria-label={text.region} placeholder={text.region} value={region} onChange={(event) => setRegion(event.target.value)} /><input aria-label={text.month} type="month" value={month} onChange={(event) => { setMonth(event.target.value); setPeriod('month') }} /></div>
    <div className="pl-calendar-tabs">{(['today', 'week', 'month', 'all'] as Period[]).map((value) => <button type="button" key={value} data-active={period === value} onClick={() => setPeriod(value)}>{text[value]}</button>)}</div>
    <div className="pl-calendar-tabs"><button type="button" data-active={followingOnly} onClick={() => setFollowingOnly((value) => !value)}>{text.following}</button><button type="button" data-active={savedOnly} onClick={() => setSavedOnly((value) => !value)}>{text.saved}</button></div>
    {error ? <p className="pl-error" role="alert">{error}</p> : null}
    {loading ? <p className="pl-inline-loading" role="status">Loading…</p> : null}
    {!loading && visible.length === 0 ? <p className="pl-inline-empty">{text.empty}</p> : null}
    <div className="pl-calendar-days">{visible.map((row) => {
      const activeReminders = reminders.get(row.id) ?? new Set<number>()
      return <article className="pl-card pl-calendar-card" key={row.id} data-status={row.status}>
        <time dateTime={row.starts_at}><strong>{row.performance_date}</strong><span>{row.start_time.slice(0, 5)}</span></time>
        <div><h3>{row.title}</h3><button type="button" className="pl-calendar-performer" onClick={() => row.performer && onOpenPerformer(row.performer.id)}>{row.performer?.stage_name}</button>{row.participants.map((performer) => <button type="button" className="pl-calendar-performer" key={performer.id} onClick={() => onOpenPerformer(performer.id)}>＋ {performer.stage_name}</button>)}<p><MapPin size={14} />{row.venue_name}{row.region ? ` · ${row.region}` : ''}</p>{row.status === 'cancelled' ? <em>{text.cancelled}</em> : row.status === 'postponed' ? <em>{text.postponed}</em> : null}</div>
        <div className="pl-calendar-actions"><button type="button" aria-pressed={favorites.has(row.id)} onClick={() => void toggleFavorite(row)}><Heart size={16} fill={favorites.has(row.id) ? 'currentColor' : 'none'} />{text.save}</button><button type="button" onClick={() => downloadAppearanceIcs(row, row.performer?.stage_name)}><Download size={16} />ICS</button>{row.venue_address ? <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(row.venue_address)}`} target="_blank" rel="noopener noreferrer"><MapPin size={16} />{text.map}</a> : null}</div>
        {row.status === 'published' ? <details className="pl-calendar-reminders"><summary><Bell size={15} />{text.reminder}</summary><div>{([1440, 60, 30, 0] as AppearanceReminderOffset[]).map((offset) => <button type="button" key={offset} aria-pressed={activeReminders.has(offset)} data-active={activeReminders.has(offset)} onClick={() => void toggleReminder(row, offset)}>{offset === 1440 ? '1d' : offset === 0 ? '0m' : `${offset}m`}</button>)}</div></details> : null}
      </article>
    })}</div>
  </section>
}
