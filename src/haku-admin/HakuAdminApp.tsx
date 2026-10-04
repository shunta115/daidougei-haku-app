import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../platform/lib/auth'
import { AuthScreen } from '../platform/screens/AuthScreen'
import { formatYen } from '../platform/lib/money'
import { MERCH_SYSTEM_FEE_PERCENT, TIP_SYSTEM_FEE_PERCENT } from '../../shared/fees'
import { hakuAdmin } from './api'

type Tab =
  | 'home'
  | 'applications'
  | 'users'
  | 'performers'
  | 'events'
  | 'votes'
  | 'live'
  | 'money'
  | 'reports'
  | 'preview'

function confirmDanger(message: string) {
  return window.confirm(`${message}\n\nこの操作は運営ログに残ります。`)
}

export function HakuAdminApp() {
  const { ready, profile, signOut } = useAuth()
  const [tab, setTab] = useState<Tab>('home')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [dash, setDash] = useState<Record<string, unknown> | null>(null)
  const [users, setUsers] = useState<Array<Record<string, string>>>([])
  const [performers, setPerformers] = useState<Array<Record<string, unknown>>>([])
  const [events, setEvents] = useState<Array<Record<string, unknown>>>([])
  const [eventExtra, setEventExtra] = useState<{
    lineup: Array<{ performer_id: string; is_voting_eligible: boolean; performer?: { stage_name?: string; genre?: string } | null }>
    slots: Array<{ id: string; date: string; performer_id: string | null; performer_name_ja: string | null; performance_type?: string | null; stage_ja?: string | null }>
    venues: unknown[]
    approvedPerformers: Array<{ id: string; stage_name: string; genre?: string }>
    guestAppearances: Array<{ id: string; official_name_ja: string; appearance_type: string; appearance_date: string; linked_performer_id: string | null; sort_order: number }>
  } | null>(null)
  const [votes, setVotes] = useState<Record<string, unknown> | null>(null)
  const [live, setLive] = useState<{ open: Array<Record<string, unknown>>; recent: Array<Record<string, unknown>> } | null>(null)
  const [money, setMoney] = useState<Record<string, unknown> | null>(null)
  const [reports, setReports] = useState<Array<Record<string, unknown>>>([])
  const [eventId, setEventId] = useState('')
  const [serverAllowed, setServerAllowed] = useState<boolean | null>(null)
  const [previewPerformerId, setPreviewPerformerId] = useState('')
  const [visibleEmailId, setVisibleEmailId] = useState<string | null>(null)
  const [lineupSearch, setLineupSearch] = useState('')
  const [lineupSelection, setLineupSelection] = useState<string[]>([])
  const [appearanceLinks, setAppearanceLinks] = useState<Record<string, string>>({})
  const [appearanceQueries, setAppearanceQueries] = useState<Record<string, string>>({})

  const locallyEligible = profile?.role === 'admin' && profile.status === 'active'

  const reload = async (next: Tab = tab) => {
    setBusy(true)
    setError(null)
    try {
      if (next === 'home') setDash(await hakuAdmin('dashboard'))
      if (next === 'users') setUsers(((await hakuAdmin('users')).rows as Array<Record<string, string>>) ?? [])
      if (next === 'performers' || next === 'applications') setPerformers(((await hakuAdmin('performers')).rows as Array<Record<string, unknown>>) ?? [])
      if (next === 'events') {
        const data = await hakuAdmin('events')
        const rows = (data.rows as Array<Record<string, unknown>>) ?? []
        setEvents(rows)
        const first = String(eventId || rows[0]?.id || '')
        setEventId(first)
        if (first) {
          const extra = await hakuAdmin('events', 'lineup', { id: first }) as typeof eventExtra
          setEventExtra(extra)
          setLineupSelection(extra?.lineup.map((row) => row.performer_id) ?? [])
          setAppearanceLinks(Object.fromEntries([
            ...(extra?.slots ?? []).filter((row) => row.performer_name_ja).map((row) => [`slot:${row.performer_name_ja}`, row.performer_id ?? '']),
            ...(extra?.guestAppearances ?? []).map((row) => [`guest:${row.official_name_ja}`, row.linked_performer_id ?? '']),
          ]))
        }
      }
      if (next === 'votes') {
        const data = await hakuAdmin('events')
        const rows = (data.rows as Array<Record<string, unknown>>) ?? []
        const first = String(eventId || rows[0]?.id || '')
        setEvents(rows)
        setEventId(first)
        if (first) setVotes(await hakuAdmin('votes', 'list', { eventId: first }))
      }
      if (next === 'live') setLive(await hakuAdmin('live') as typeof live)
      if (next === 'money') setMoney(await hakuAdmin('money'))
      if (next === 'reports') setReports(((await hakuAdmin('reports')).rows as Array<Record<string, unknown>>) ?? [])
      if (next === 'preview') setPerformers(((await hakuAdmin('performers')).rows as Array<Record<string, unknown>>) ?? [])
    } catch (e) {
      setError(e instanceof Error ? e.message : '読み込みに失敗しました')
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    if (!locallyEligible) { setServerAllowed(false); return }
    void hakuAdmin('me').then(() => {
      setServerAllowed(true)
      void reload('home')
    }).catch(() => setServerAllowed(false))
  }, [locallyEligible])

  const moneyBlock = (dash?.money ?? money) as Record<string, unknown> | undefined
  const recorded = moneyBlock && moneyBlock.kind === 'recorded' ? moneyBlock : null

  const loadEvent = async (id: string) => {
    setEventId(id)
    setBusy(true)
    setError(null)
    try {
      const extra = await hakuAdmin('events', 'lineup', { id }) as typeof eventExtra
      setEventExtra(extra)
      setLineupSelection(extra?.lineup.map((row) => row.performer_id) ?? [])
      setAppearanceLinks(Object.fromEntries([
        ...(extra?.slots ?? []).filter((row) => row.performer_name_ja).map((row) => [`slot:${row.performer_name_ja}`, row.performer_id ?? '']),
        ...(extra?.guestAppearances ?? []).map((row) => [`guest:${row.official_name_ja}`, row.linked_performer_id ?? '']),
      ]))
      setAppearanceQueries({})
      setLineupSearch('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'イベント出演者を読み込めませんでした')
    } finally {
      setBusy(false)
    }
  }

  const changeVotingEligibility = async (row: { performer_id: string; is_voting_eligible: boolean; performer?: { stage_name?: string } | null }) => {
    const next = !row.is_voting_eligible
    if (!confirmDanger(`${row.performer?.stage_name || 'この出演者'}を${next ? '投票対象にします' : '投票対象から外します'}。`)) return
    try {
      await hakuAdmin('events', 'voting-eligibility', { id: eventId, performerId: row.performer_id, eligible: next })
      await loadEvent(eventId)
    } catch (e) {
      setError(e instanceof Error ? e.message : '投票資格を更新できませんでした')
    }
  }

  const saveLineup = async () => {
    if (!eventId || !eventExtra) return
    const current = eventExtra.lineup.map((row) => row.performer_id)
    const removed = current.filter((id) => !lineupSelection.includes(id))
    const added = lineupSelection.filter((id) => !current.includes(id))
    if (!added.length && !removed.length) return
    if (!confirmDanger(`出演者を保存します。追加 ${added.length}人・解除 ${removed.length}人。パフォーマーの承認状態やプロフィールは変更しません。`)) return
    setBusy(true)
    setError(null)
    try {
      await hakuAdmin('events', 'lineup-set', { id: eventId, performerIds: lineupSelection })
      await loadEvent(eventId)
    } catch (e) {
      setError(e instanceof Error ? e.message : '出演者を保存できませんでした')
    } finally {
      setBusy(false)
    }
  }

  const saveAppearanceLink = async (source: 'slot' | 'guest', officialName: string) => {
    if (!eventId) return
    const key = `${source}:${officialName}`
    setBusy(true)
    setError(null)
    try {
      await hakuAdmin('events', source === 'slot' ? 'slot-performer-link' : 'guest-appearance-link', {
        id: eventId,
        officialName,
        performerId: appearanceLinks[key] || null,
      })
      await loadEvent(eventId)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'プロフィールの紐付けを保存できませんでした')
    } finally {
      setBusy(false)
    }
  }

  const renderProfileLinks = (source: 'slot' | 'guest', rows: Array<{ officialName: string; linkedPerformerId: string | null; dates: string; category: string }>) => rows.map((appearance) => {
    const key = `${source}:${appearance.officialName}`
    const query = appearanceQueries[key] ?? ''
    const selectedId = appearanceLinks[key] ?? ''
    const candidates = (eventExtra?.approvedPerformers ?? []).filter((performer) => !query.trim() || `${performer.stage_name} ${performer.genre || ''}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))
    const selected = (eventExtra?.approvedPerformers ?? []).find((performer) => performer.id === selectedId)
    const options = selected && !candidates.some((performer) => performer.id === selected.id) ? [selected, ...candidates] : candidates
    return (
      <section key={key} className="ha-appearance-links__item">
        <div><small>イベント表示名</small><strong>{appearance.officialName}</strong><span>{appearance.dates} · {appearance.category}</span></div>
        <label>
          <span className="pl-label">HAKUパフォーマーを検索</span>
          <input className="pl-input" type="search" value={query} onChange={(e) => setAppearanceQueries((current) => ({ ...current, [key]: e.target.value }))} placeholder="登録名・ジャンルを部分一致検索" />
        </label>
        <label>
          <span className="pl-label">紐付けるHAKUパフォーマー</span>
          <select className="pl-input" value={selectedId} onChange={(e) => setAppearanceLinks((current) => ({ ...current, [key]: e.target.value }))}>
            <option value="">未紐付け</option>
            {options.map((performer) => <option key={performer.id} value={performer.id}>{performer.stage_name}{performer.genre ? ` — ${performer.genre}` : ''}</option>)}
          </select>
        </label>
        <button type="button" className="pl-btn pl-btn--block" disabled={busy || selectedId === (appearance.linkedPerformerId ?? '')} onClick={() => void saveAppearanceLink(source, appearance.officialName)}>この紐付けを保存</button>
      </section>
    )
  })

  const tabs: Array<{ id: Tab; label: string }> = useMemo(() => [
    { id: 'home', label: '状況' },
    { id: 'applications', label: '申請' },
    { id: 'users', label: '利用者' },
    { id: 'performers', label: '出演者' },
    { id: 'events', label: 'イベント' },
    { id: 'votes', label: '投票' },
    { id: 'live', label: 'LIVE' },
    { id: 'money', label: '売上' },
    { id: 'reports', label: '通報' },
    { id: 'preview', label: '表示確認' },
  ], [])

  if (!ready) return <main className="ha-app"><p>確認しています…</p></main>
  if (!profile) return <div className="ha-app ha-app--auth"><AuthScreen onDone={() => undefined} /></div>
  if (locallyEligible && serverAllowed === null) return <main className="ha-app"><p>運営権限をサーバーで確認しています…</p></main>
  if (!locallyEligible || serverAllowed !== true) {
    return (
      <main className="ha-app">
        <h1>HAKU ADMIN</h1>
        <p>このアカウントには運営権限がありません。</p>
        <button type="button" className="pl-btn" onClick={() => void signOut()}>ログアウト</button>
      </main>
    )
  }

  return (
    <div className="ha-app">
      <header className="ha-top">
        <div>
          <p className="ha-kicker">HAKU ADMIN</p>
          <h1>運営コックピット</h1>
        </div>
        <button type="button" className="pl-btn pl-btn--ghost" onClick={() => void signOut()}>ログアウト</button>
      </header>
      <nav className="ha-tabs" aria-label="運営メニュー">
        {tabs.map((item) => (
          <button key={item.id} type="button" data-active={tab === item.id} onClick={() => { setTab(item.id); void reload(item.id) }}>{item.label}</button>
        ))}
      </nav>
      {error ? <p className="pl-error">{error}</p> : null}
      {busy ? <p role="status">更新しています…</p> : null}

      {tab === 'home' && dash ? (
        <section className="ha-grid">
          <article><em>利用者</em><strong>{String(dash.users ?? '—')}</strong></article>
          <article><em>ファン</em><strong>{String(dash.fans ?? '—')}</strong></article>
          <article><em>公開中出演者</em><strong>{String(dash.approved ?? '—')}</strong></article>
          <article><em>承認待ち</em><strong>{String(dash.pendingApproval ?? '—')}</strong></article>
          <article><em>LIVE中</em><strong>{String(dash.liveNow ?? '—')}</strong></article>
          <article data-alert={Number(dash.staleLives) > 0}><em>LIVE異常候補</em><strong>{String(dash.staleLives ?? '—')}</strong></article>
          <article><em>未対応通報</em><strong>{String(dash.openReports ?? '—')}</strong></article>
          <article data-alert={Number(dash.stripeNotReady) > 0}><em>Stripe未完了</em><strong>{String(dash.stripeNotReady ?? '—')}</strong></article>
          <article data-alert={Number(dash.profileIncomplete) > 0}><em>プロフィール不備</em><strong>{String(dash.profileIncomplete ?? '—')}</strong></article>
          <article data-alert={Number(dash.eventSlots1010to1012) === 0}><em>10/10〜12 出演枠</em><strong>{String(dash.eventSlots1010to1012 ?? '—')}</strong></article>
          {recorded ? (
            <>
              <article><em>総流通額（DB実績）</em><strong>{formatYen(Number(recorded.gmv_yen) || 0)}</strong></article>
              <article><em>HAKUシステム利用料（DB実績）</em><strong>{formatYen(Number(recorded.haku_system_fee_yen) || 0)}</strong></article>
            </>
          ) : null}
          <p className="ha-note">投げ銭のシステム利用料は{TIP_SYSTEM_FEE_PERCENT}%、グッズは{MERCH_SYSTEM_FEE_PERCENT}%。旧決済で精算値が保存されていない行は「未算定」と表示し、0円とは扱いません。</p>
        </section>
      ) : null}

      {tab === 'users' ? (
        <section>
          {users.map((user) => (
            <article key={user.id} className="ha-card">
              <h2>{user.display_name}</h2>
              <p>{user.role === 'fan' ? 'お客様' : user.role === 'performer' ? 'パフォーマー' : user.role === 'admin' ? '運営' : user.role} · {user.status === 'active' ? '有効' : user.status === 'suspended' ? '停止中' : user.status === 'deleted' ? '削除済み' : user.status}</p>
              {visibleEmailId === user.id ? <p>メール: {user.email}</p> : null}
              <div className="ha-actions">
                <button type="button" className="pl-btn pl-btn--ghost" onClick={() => setVisibleEmailId((value) => value === user.id ? null : user.id)}>{visibleEmailId === user.id ? 'メールを隠す' : 'メールを確認'}</button>
                <button type="button" className="pl-btn pl-btn--ghost" onClick={() => {
                  if (!confirmDanger(`${user.display_name} を停止します。セッションも無効化します。`)) return
                  void hakuAdmin('users', 'suspend', { id: user.id }).then(() => reload('users')).catch((e) => setError(e instanceof Error ? e.message : '失敗'))
                }}>停止</button>
                <button type="button" className="pl-btn pl-btn--danger" onClick={() => {
                  if (!confirmDanger(`${user.display_name} を削除（論理削除）します。`)) return
                  void hakuAdmin('users', 'soft-delete', { id: user.id }).then(() => reload('users')).catch((e) => setError(e instanceof Error ? e.message : '失敗'))
                }}>削除</button>
              </div>
            </article>
          ))}
        </section>
      ) : null}

      {tab === 'applications' ? (
        <section>
          <h2>パフォーマー申請</h2>
          {performers.filter((row) => row.review_status === 'pending' || (!row.review_status && !row.is_approved)).length === 0 ? <p>承認待ちの申請はありません。</p> : null}
          {performers.filter((row) => row.review_status === 'pending' || (!row.review_status && !row.is_approved)).map((row) => (
            <article key={String(row.id)} className="ha-card">
              <h2>{String(row.stage_name || row.display_name || '名称未入力')}</h2>
              <p>{String(row.email || '')}</p>
              <p>{String(row.genre || 'ジャンル未入力')} · {String(row.city || '地域未入力')}</p>
              <p>{String(row.bio || '自己紹介未入力')}</p>
              <p>申請日時: {row.created_at ? new Date(String(row.created_at)).toLocaleString('ja-JP') : '—'} · 受取設定: {row.stripe_onboarding_complete ? '完了' : '未完了'}</p>
              <div className="ha-actions">
                <button type="button" className="pl-btn" onClick={() => {
                  if (!confirmDanger(`${String(row.stage_name)} を承認します。`)) return
                  void hakuAdmin('performers', 'approve', { id: row.id }).then(() => reload('applications')).catch((e) => setError(e instanceof Error ? e.message : '失敗'))
                }}>承認</button>
                <button type="button" className="pl-btn pl-btn--danger" onClick={() => {
                  const reason = window.prompt('却下理由を入力してください。パフォーマーへの連絡に使える具体的な理由にしてください。')?.trim()
                  if (!reason || !confirmDanger(`${String(row.stage_name)} の申請を却下します。`)) return
                  void hakuAdmin('performers', 'reject', { id: row.id, reason }).then(() => reload('applications')).catch((e) => setError(e instanceof Error ? e.message : '失敗'))
                }}>却下</button>
              </div>
            </article>
          ))}
        </section>
      ) : null}

      {tab === 'performers' ? (
        <section>
          {performers.map((row) => (
            <article key={String(row.id)} className="ha-card">
              <h2>{String(row.stage_name)}</h2>
              <p>プロフィール: {row.stage_name && row.bio && row.photo_url ? '概ね完了' : '要確認'} · ジャンル: {String(row.genre || '未入力')} · 地域: {String(row.city || '未入力')}</p>
              <p>審査: {row.review_status === 'approved' || row.is_approved ? '承認済み' : row.review_status === 'rejected' ? '却下' : '申請中'} · 公開: {row.is_approved ? '公開中' : '未公開'} · Stripe: {row.stripe_registration_state === 'ready' ? '受取可能' : row.stripe_registration_state === 'in_progress' ? '登録途中・要対応' : '未登録・受取不可'} · アカウント: {row.account_status === 'active' ? '有効' : String(row.account_status)} · LIVE: {row.is_approved && row.account_status === 'active' ? '利用可能' : '利用不可'}</p>
              <p className="ha-note">Stripe口座IDはADMIN APIの内部処理のみで、この画面には出しません。</p>
              <div className="ha-actions">
                {!row.is_approved ? (
                  <button type="button" className="pl-btn" disabled={!row.stripe_onboarding_complete} onClick={() => {
                    if (!confirmDanger(`${String(row.stage_name)} を承認して公開します。`)) return
                    void hakuAdmin('performers', 'approve', { id: row.id }).then(() => reload('performers')).catch((e) => setError(e instanceof Error ? e.message : '失敗'))
                  }}>承認して公開</button>
                ) : (
                  <button type="button" className="pl-btn pl-btn--ghost" onClick={() => {
                    if (!confirmDanger(`${String(row.stage_name)} の公開を停止します。`)) return
                    void hakuAdmin('performers', 'unpublish', { id: row.id }).then(() => reload('performers')).catch((e) => setError(e instanceof Error ? e.message : '失敗'))
                  }}>公開停止</button>
                )}
              </div>
            </article>
          ))}
        </section>
      ) : null}

      {tab === 'events' ? (
        <section>
          <article className="ha-card">
            <label>
              <span className="pl-label">管理するイベント</span>
              <select className="pl-input" value={eventId} onChange={(e) => void loadEvent(e.target.value)}>
                {events.map((event) => <option key={String(event.id)} value={String(event.id)}>{String(event.name_ja)}（{String(event.status)}）</option>)}
              </select>
            </label>
          </article>
          {events.map((event) => (
            <article key={String(event.id)} className="ha-card">
              <h2>{String(event.name_ja)}</h2>
              <p>{String(event.slug)} · {String(event.status)} · {String(event.date_label || '')}</p>
              <p><strong>{(event.vote_rule as { voting_enabled?: boolean } | null)?.voting_enabled ? '🟢 投票機能 ON' : '⚪️ 投票機能 OFF'}</strong></p>
              <div className="ha-actions">
                <button type="button" className={(event.vote_rule as { voting_enabled?: boolean } | null)?.voting_enabled ? 'pl-btn pl-btn--ghost' : 'pl-btn'} onClick={() => {
                  const enabled = !Boolean((event.vote_rule as { voting_enabled?: boolean } | null)?.voting_enabled)
                  if (!confirmDanger(`${String(event.name_ja)}の投票機能を${enabled ? 'ON' : 'OFF'}にします。受付は自動的に停止状態になります。`)) return
                  void hakuAdmin('events', 'voting-feature', { id: event.id, enabled }).then(() => reload('events')).catch((e) => setError(e instanceof Error ? e.message : '失敗'))
                }}>{(event.vote_rule as { voting_enabled?: boolean } | null)?.voting_enabled ? '投票機能をOFF' : '投票機能をON'}</button>
                {(['draft', 'published', 'archived'] as const).map((status) => (
                  <button key={status} type="button" className="pl-btn pl-btn--ghost" onClick={() => {
                    if (!confirmDanger(`${String(event.name_ja)} を ${status} にします。`)) return
                    void hakuAdmin('events', 'patch', { id: event.id, patch: { status } }).then(() => reload('events')).catch((e) => setError(e instanceof Error ? e.message : '失敗'))
                  }}>{status}</button>
                ))}
              </div>
            </article>
          ))}
          {eventExtra ? (
            <>
              <p className="ha-note">出演 {eventExtra.lineup.length} · 投票対象 {eventExtra.lineup.filter((row) => row.is_voting_eligible).length} · 投票対象外 {eventExtra.lineup.filter((row) => !row.is_voting_eligible).length} · 枠 {eventExtra.slots.length} · 会場 {eventExtra.venues.length}</p>
              <article className="ha-card ha-lineup-manager">
                <h2>出演パフォーマー管理</h2>
                <p className="ha-note">承認済みパフォーマーから、このイベントの出演者だけを選択します。チェックを外してもHAKU登録・承認・プロフィールは維持されます。</p>
                <label>
                  <span className="pl-label">パフォーマーを検索</span>
                  <input className="pl-input" type="search" value={lineupSearch} onChange={(e) => setLineupSearch(e.target.value)} placeholder="名前・ジャンルで検索" />
                </label>
                <div className="ha-lineup-manager__list">
                  {(eventExtra.approvedPerformers ?? []).filter((performer) => `${performer.stage_name} ${performer.genre || ''}`.toLocaleLowerCase().includes(lineupSearch.trim().toLocaleLowerCase())).map((performer) => (
                    <label key={performer.id} className="ha-lineup-manager__item">
                      <input type="checkbox" checked={lineupSelection.includes(performer.id)} onChange={(e) => setLineupSelection((current) => e.target.checked ? [...current, performer.id] : current.filter((id) => id !== performer.id))} />
                      <span><strong>{performer.stage_name}</strong><small>{performer.genre || 'ジャンル未入力'}</small></span>
                    </label>
                  ))}
                </div>
                <p className="ha-note">選択中 {lineupSelection.length}人</p>
                <button type="button" className="pl-btn pl-btn--block" disabled={busy} onClick={() => void saveLineup()}>出演者を保存</button>
              </article>
              {eventExtra.slots.some((row) => row.performer_name_ja) || eventExtra.guestAppearances?.length ? (
                <article className="ha-card ha-appearance-links">
                  <h2>出演名とHAKUプロフィールの紐付け</h2>
                  <p className="ha-note">イベントの正式な出演名は変更せず、写真・プロフィール・SNS・応援・LIVE・動画・グッズ・フォローの参照先だけを選択します。完全一致しない名前は自動確定しません。</p>
                  <h3>定点パフォーマー</h3>
                  {renderProfileLinks('slot', [...new Set(eventExtra.slots.map((row) => row.performer_name_ja).filter((name): name is string => Boolean(name)))].map((officialName) => {
                    const matching = eventExtra.slots.filter((row) => row.performer_name_ja === officialName)
                    return {
                      officialName,
                      linkedPerformerId: matching.find((row) => row.performer_id)?.performer_id ?? null,
                      dates: [...new Set(matching.map((row) => row.date.slice(5).replace('-', '/')))].join('・'),
                      category: [...new Set(matching.map((row) => row.stage_ja || '定点'))].join('・'),
                    }
                  }))}
                  <h3>スタチュー・回遊</h3>
                  {renderProfileLinks('guest', [...new Set(eventExtra.guestAppearances.map((row) => row.official_name_ja))].map((officialName) => {
                    const matching = eventExtra.guestAppearances.filter((row) => row.official_name_ja === officialName)
                    return {
                      officialName,
                      linkedPerformerId: matching.find((row) => row.linked_performer_id)?.linked_performer_id ?? null,
                      dates: [...new Set(matching.map((row) => row.appearance_date.slice(5).replace('-', '/')))].join('・'),
                      category: [...new Set(matching.map((row) => row.appearance_type))].join('・'),
                    }
                  }))}
                </article>
              ) : null}
              <article className="ha-card">
                <h2>出演者と投票資格</h2>
                <p>出演と投票対象はイベントごとの別設定です。</p>
                <button type="button" className="pl-btn pl-btn--ghost pl-btn--block" disabled={eventExtra.lineup.length === 0} onClick={() => {
                  if (!confirmDanger('このイベントの出演者を全員「投票対象外」にします。既存票は削除されません。')) return
                  void hakuAdmin('events', 'voting-eligibility-all-off', { id: eventId }).then(() => loadEvent(eventId)).catch((e) => setError(e instanceof Error ? e.message : '一括更新できませんでした'))
                }}>全員を投票対象外にする</button>
              </article>
              {eventExtra.lineup.map((row) => (
                <article key={row.performer_id} className="ha-card">
                  <h2>{row.performer?.stage_name || '名称未登録'}</h2>
                  <p>{row.performer?.genre || ''}</p>
                  <p><strong>🟢 出演中</strong><br /><strong>{row.is_voting_eligible ? '🟢 投票対象' : '⚪️ 投票対象外'}</strong></p>
                  <button type="button" className={row.is_voting_eligible ? 'pl-btn pl-btn--ghost pl-btn--block' : 'pl-btn pl-btn--block'} onClick={() => void changeVotingEligibility(row)}>{row.is_voting_eligible ? '投票対象から外す' : '投票対象にする'}</button>
                </article>
              ))}
            </>
          ) : null}
        </section>
      ) : null}

      {tab === 'votes' ? (
        <section className="ha-card">
          <h2>投票デスク</h2>
          <p>投票機能: {String((votes?.desk as { voting_enabled?: boolean } | undefined)?.voting_enabled ? 'ON' : 'OFF')} · 受付: {String((votes?.desk as { voting_open?: boolean } | undefined)?.voting_open ? 'OPEN' : 'STOP')}</p>
          <p>正式票 {String((votes?.desk as { total_votes?: number } | undefined)?.total_votes ?? '—')} · 投票端末 {String((votes?.desk as { unique_voters?: number } | undefined)?.unique_voters ?? '—')} · 1端末最大 {String((votes?.desk as { votes_per_device?: number } | undefined)?.votes_per_device ?? 3)}票</p>
          {Number((votes?.desk as { legacy_test_votes?: number } | undefined)?.legacy_test_votes) > 0 ? <p className="ha-note">旧方式の開催前テスト票 {(votes?.desk as { legacy_test_votes?: number }).legacy_test_votes}件は正式ランキングから除外して保持しています。</p> : null}
          <div className="ha-actions">
            <button type="button" className="pl-btn" onClick={() => {
              if (!eventId || !confirmDanger('投票をOPENします。')) return
              void hakuAdmin('votes', 'open', { eventId }).then(() => reload('votes')).catch((e) => setError(e instanceof Error ? e.message : '失敗'))
            }}>投票を開く</button>
            <button type="button" className="pl-btn pl-btn--ghost" onClick={() => {
              if (!eventId || !confirmDanger('投票をSTOPします。')) return
              void hakuAdmin('votes', 'close', { eventId }).then(() => reload('votes')).catch((e) => setError(e instanceof Error ? e.message : '失敗'))
            }}>投票を止める</button>
          </div>
          <h3>投票対象ランキング</h3>
          <ol>
            {(((votes?.desk as { ranking?: Array<{ performer_id: string; stage_name?: string; votes: number }> } | undefined)?.ranking) ?? []).map((row, index) => (
              <li key={row.performer_id}>{index + 1}位　{row.stage_name || '名称未登録'}　{row.votes}票</li>
            ))}
          </ol>
        </section>
      ) : null}

      {tab === 'live' ? (
        <section>
          <h2>配信中</h2>
          {(live?.open ?? []).length === 0 ? <p>現在LIVE中の配信はありません。</p> : live?.open.map((row) => (
            <article key={String(row.id)} className="ha-card">
              <p>{String((row.performers as { stage_name?: string } | null)?.stage_name || '名称未登録')} · {String(row.title || 'LIVE')} · 視聴ピーク {String(row.viewer_peak ?? 0)} · 最終確認 {row.heartbeat_at ? new Date(String(row.heartbeat_at)).toLocaleTimeString('ja-JP') : 'なし'}</p>
              <button type="button" className="pl-btn pl-btn--danger" onClick={() => {
                if (!confirmDanger('このLIVEを強制終了します。')) return
                void import('../platform/lib/supabase').then(async ({ supabaseAuthHeaders }) => {
                  const response = await fetch('/api/livekit/presence', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', ...(await supabaseAuthHeaders()) },
                    body: JSON.stringify({ action: 'force-end', sessionId: row.id }),
                  })
                  if (!response.ok) throw new Error('force end failed')
                  await reload('live')
                }).catch((e) => setError(e instanceof Error ? e.message : '失敗'))
              }}>強制終了</button>
            </article>
          ))}
        </section>
      ) : null}

      {tab === 'money' && money ? (
        <section>
          <p className="ha-note">Stripe実手数料控除後に、投げ銭15%・グッズ8%を計算した確定台帳です。</p>
          <p>投げ銭 {((money.tips as unknown[]) ?? []).length}件 · グッズ {((money.orders as unknown[]) ?? []).length}件</p>
          {((money.tips as Array<Record<string, unknown>>) ?? []).slice(0, 20).map((row) => (
            <article key={String(row.id)} className="ha-card">
              <p>投げ銭 総額 {formatYen(Number(row.gross_amount_yen ?? row.amount_cents) || 0)} · {row.settlement_status ? <>Stripe {formatYen(Number(row.stripe_fee_yen) || 0)} · HAKU {formatYen(Number(row.haku_fee_yen) || 0)} · 受取 {formatYen(Number(row.performer_share_yen) || 0)} · 精算 {String(row.settlement_status)}</> : <>Stripe／HAKU／受取 未算定（旧データ）</>} · 決済 {String(row.status)}</p>
            </article>
          ))}
          {((money.orders as Array<Record<string, unknown>>) ?? []).slice(0, 20).map((row) => (
            <article key={String(row.id)} className="ha-card">
              <p>グッズ {String(row.product_name || '')} 総額 {formatYen(Number(row.gross_amount_yen ?? row.amount_yen) || 0)} · {row.settlement_status ? <>Stripe {formatYen(Number(row.stripe_fee_yen) || 0)} · HAKU {formatYen(Number(row.haku_fee_yen) || 0)} · 受取 {formatYen(Number(row.performer_share_yen) || 0)} · 精算 {String(row.settlement_status)}</> : <>Stripe／HAKU／受取 未算定（旧データ）</>} · 決済 {String(row.status)}</p>
            </article>
          ))}
          <h2>出金</h2>
          {((money.payouts as Array<Record<string, unknown>>) ?? []).length === 0 ? <p>出金記録はありません。</p> : null}
          {((money.payouts as Array<Record<string, unknown>>) ?? []).map((row) => <article key={String(row.id)} className="ha-card"><p>{formatYen(Number(row.amount_yen) || 0)} · {String(row.status)} · {String(row.performer_id).slice(0, 8)}…</p></article>)}
        </section>
      ) : null}

      {tab === 'reports' ? (
        <section>
          {reports.length === 0 ? <p>通報はありません。</p> : reports.map((row) => (
            <article key={String(row.id)} className="ha-card">
              <p>対象: {String(row.target_type)} {String(row.target_id || '')} · 内容: {String(row.reason)} · 日時: {row.created_at ? new Date(String(row.created_at)).toLocaleString('ja-JP') : '—'} · 状態: {row.status === 'open' ? '未対応' : row.status === 'in_progress' ? '対応中' : row.status === 'resolved' ? '解決済み' : String(row.status)}</p>
              <div className="ha-actions">{([['open', '未対応'], ['in_progress', '対応中'], ['resolved', '解決済み']] as const).map(([status, label]) => <button key={status} type="button" className="pl-btn pl-btn--ghost" onClick={() => { if (!confirmDanger(`通報を「${label}」に変更します。`)) return; void hakuAdmin('reports', 'patch', { id: row.id, status }).then(() => reload('reports')).catch((e) => setError(e instanceof Error ? e.message : '失敗')) }}>{label}</button>)}</div>
            </article>
          ))}
        </section>
      ) : null}

      {tab === 'preview' ? (
        <section className="ha-card">
          <h2>読み取り専用プレビュー</h2>
          <p>ADMINのログインはそのままです。プレビュー内の操作要素は無効化され、DBを書き換えません。</p>
          <label>対象パフォーマー
            <select value={previewPerformerId} onChange={(event) => setPreviewPerformerId(event.target.value)}>
              <option value="">選択してください</option>
              {performers.map((row) => <option key={String(row.id)} value={String(row.id)}>{String(row.stage_name || row.display_name || row.id)}</option>)}
            </select>
          </label>
          <div className="ha-actions">
            <a className="pl-btn" href={`/?hakuPreview=fan`}>お客様として見る</a>
            <a className="pl-btn pl-btn--ghost" aria-disabled={!previewPerformerId} href={previewPerformerId ? `/?hakuPreview=performer&performerId=${encodeURIComponent(previewPerformerId)}` : undefined}>選択したパフォーマーとして見る</a>
            <a className="pl-btn pl-btn--ghost" aria-disabled={!previewPerformerId} href={previewPerformerId ? `/?hakuPreview=fan&watch=${encodeURIComponent(previewPerformerId)}` : undefined}>選択したLIVEを運営だけで視聴</a>
            <a className="pl-btn pl-btn--ghost" aria-disabled={!previewPerformerId} href={previewPerformerId ? `/event?hakuPreview=fan&testPerformer=${encodeURIComponent(previewPerformerId)}` : undefined}>選択したLIVE位置を運営MAPで確認</a>
          </div>
        </section>
      ) : null}
    </div>
  )
}
