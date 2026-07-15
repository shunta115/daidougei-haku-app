import { AdminRegistrationsList } from './admin/AdminRegistrationsList'

type AdminRegistrationsScreenProps = {
  onExit: () => void
}

/** @deprecated 単体画面 — AdminDashboardScreen に統合済み */
export function AdminRegistrationsScreen({ onExit }: AdminRegistrationsScreenProps) {
  return (
    <main className="fe-main fe-main--admin">
      <header className="fe-page-head">
        <button type="button" className="fe-page-head__back" onClick={onExit}>
          ← 来場者モードへ
        </button>
        <p className="fe-page-head__eyebrow">Staff</p>
        <h1 className="fe-page-head__title">運営管理 · 登録者一覧</h1>
        <p className="fe-page-head__lead">
          出演者登録の内容を確認します。ステータス変更・編集・削除はこの端末の localStorage に保存されます。
        </p>
      </header>
      <AdminRegistrationsList />
    </main>
  )
}
