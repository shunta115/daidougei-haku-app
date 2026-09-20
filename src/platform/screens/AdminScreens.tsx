import { useEffect, useState } from 'react'
import {
  approvePerformer,
  fetchAdminMetrics,
  listPerformerRegistrations,
  type PerformerRegistration,
  listUsers,
  softDeleteUser,
  suspendUser,
} from '../lib/api'
import { useAuth } from '../lib/auth'
import { formatYen } from '../lib/money'
import type { AdminMetrics } from '../lib/types'
import { Avatar } from '../components/Avatar'
import { performerRegistrationStatus, registrationError, PERFORMER_REGISTER_PATH } from '../lib/onboarding'

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="pl-card" style={{ margin: 0 }}>
      <div className="pl-muted" style={{ fontSize: 12 }}>
        {label}
      </div>
      <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em' }}>{value}</div>
    </div>
  )
}

export function AdminDashboardScreen() {
  const { signOut } = useAuth()
  const [m, setM] = useState<AdminMetrics | null>(null)
  const [registrations, setRegistrations] = useState<PerformerRegistration[]>([])
  const [filter, setFilter] = useState('pending')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [approving, setApproving] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const reload = async () => {
    setLoading(true)
    try {
      const [metrics, list] = await Promise.all([fetchAdminMetrics().catch(() => null), listPerformerRegistrations()])
      setM(metrics)
      setRegistrations(list)
      setError(null)
    } catch (e) { setError(registrationError(e, '登録者を取得できませんでした。再読み込みしてください。')) }
    finally { setLoading(false) }
  }

  useEffect(() => {
    void reload()
  }, [])

  const filtered = registrations.filter((p) => {
    const ready = performerRegistrationStatus(p)
    return p.stage_name.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()) && (
      filter === 'all' || (filter === 'pending' && !p.is_approved) ||
      (filter === 'ready' && ready.next === 'approval' && ['pending', 'active'].includes(p.account_status)) ||
      (filter === 'approved' && p.is_approved)
    )
  })

  return (
    <div className="pl-registration">
      <div className="pl-top">
        <div>
          <p className="pl-brand">運営</p>
          <h1 className="pl-h1" style={{ margin: 0 }}>
            パフォーマー登録状況
          </h1>
        </div>
        <button type="button" className="pl-btn pl-btn--ghost" disabled={loading} onClick={() => void reload()}>
          更新
        </button>
      </div>

      {error ? <p className="pl-error">{error}</p> : null}

      <p className="pl-muted">登録済み {registrations.length}人・公開中 {registrations.filter((p) => p.is_approved).length}人</p>
      <a className="pl-registration__link" href={PERFORMER_REGISTER_PATH}>出演者に案内する登録ページ</a>
      <label><span className="pl-label">芸名で検索</span><input className="pl-input" type="search" value={search} onChange={(e) => setSearch(e.target.value)} /></label>
      <label><span className="pl-label">表示する登録者</span><select className="pl-select" value={filter} onChange={(e) => setFilter(e.target.value)}>
        <option value="pending">未承認</option><option value="ready">登録完了・運営確認待ち</option><option value="approved">公開中</option><option value="all">すべて</option>
      </select></label>
      {loading ? <p role="status">登録状況を確認しています…</p> : filtered.length === 0 ? <p className="pl-muted">該当する登録者はいません。</p> : null}
      {filtered.map((p) => {
        const state = performerRegistrationStatus(p)
        const eligible = state.profileComplete && state.payoutsComplete && ['pending', 'active'].includes(p.account_status)
        return <article key={p.id} className="pl-card pl-registration__review">
          <div className="pl-row"><Avatar url={p.photo_url} name={p.stage_name} /><div><h2 className="pl-h2">{p.stage_name}</h2><p className="pl-muted">{p.genre || 'ジャンル未入力'}・{p.city || '活動地域未入力'}</p></div></div>
          <ul className="pl-registration__checks">
            <li>プロフィール：{state.profileComplete ? '完了' : `未入力（${state.missing.join('・')}）`}</li>
            <li>Stripe受取設定：{state.payoutsComplete ? '完了' : p.stripe_account_id ? '登録・確認中' : '未登録'}</li>
            <li>運営承認：{p.is_approved ? '承認済み・公開中' : '未承認'}</li>
            {!['active', 'pending'].includes(p.account_status) ? <li>アカウント：利用停止中または確認が必要</li> : null}
          </ul>
          <details className="pl-registration__details"><summary>プロフィールを確認</summary><p>{p.bio || '自己紹介は未入力です。'}</p><p className="pl-muted">登録日：{new Date(p.created_at).toLocaleDateString('ja-JP')}</p></details>
          {!p.is_approved ? <button className="pl-btn pl-btn--block" disabled={!eligible || approving !== null} onClick={() => {
            setApproving(p.id)
            void approvePerformer(p.id).then(reload).catch((e) => setError(registrationError(e, '承認できませんでした。登録状況を更新して再確認してください。'))).finally(() => setApproving(null))
          }}>{approving === p.id ? '承認中…' : eligible ? '承認して公開' : 'プロフィール・受取設定の完了待ち'}</button> : null}
        </article>
      })}

      <details className="pl-registration__details"><summary>利用・売上の集計</summary>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <Metric label="今日の登録" value={m?.signups_today ?? '—'} />
        <Metric label="パフォーマー" value={m?.performers_total ?? '—'} />
        <Metric label="ファン" value={m?.fans_total ?? '—'} />
        <Metric label="ライブ数" value={m?.lives_total ?? '—'} />
        <Metric label="ライブ中" value={m?.live_now ?? '—'} />
        <Metric label="投げ銭件数" value={m?.tips_today_count ?? '—'} />
        <Metric label="投げ銭総額" value={m ? formatYen(m.tips_today_amount) : '—'} />
        <Metric label="運営手数料" value={m ? formatYen(m.fees_today) : '—'} />
        <Metric label="DAU" value={m?.dau_proxy ?? '—'} />
        <Metric label="MAU" value={m?.mau_proxy ?? '—'} />
      </div>
      </details>

      <button type="button" className="pl-btn pl-btn--block pl-btn--ghost" onClick={() => void signOut()}>
        ログアウト
      </button>
    </div>
  )
}

export { AdminEventScreen } from './AdminEventOps'

export function AdminUsersScreen() {
  const [rows, setRows] = useState<
    Array<{ id: string; display_name: string; role: string; status: string; email: string | null }>
  >([])
  const [error, setError] = useState<string | null>(null)

  const reload = async () => {
    try {
      setRows(await listUsers())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed')
    }
  }

  useEffect(() => {
    void reload()
  }, [])

  return (
    <>
      <h1 className="pl-h1">Users</h1>
      {error ? <p className="pl-error">{error}</p> : null}
      {rows.map((u) => (
        <div key={u.id} className="pl-card">
          <div style={{ fontWeight: 700 }}>{u.display_name}</div>
          <div className="pl-muted">
            {u.role} · {u.status} · {u.email}
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
            <button
              type="button"
              className="pl-btn pl-btn--ghost"
              onClick={() => {
                if (!window.confirm('Suspend this account?')) return
                void suspendUser(u.id)
                  .then(reload)
                  .catch((e) => setError(e instanceof Error ? e.message : 'Suspend failed'))
              }}
            >
              Suspend
            </button>
            <button
              type="button"
              className="pl-btn pl-btn--danger"
              onClick={() => {
                if (!window.confirm('Soft-delete this account?')) return
                void softDeleteUser(u.id)
                  .then(reload)
                  .catch((e) => setError(e instanceof Error ? e.message : 'Delete failed'))
              }}
            >
              Delete
            </button>
          </div>
        </div>
      ))}
    </>
  )
}
