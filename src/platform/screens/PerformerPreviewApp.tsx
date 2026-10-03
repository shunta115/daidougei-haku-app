import { useState } from 'react'
import { Camera, CalendarDays, Pencil, ShoppingBag, Share2, WalletCards } from 'lucide-react'
import { BottomNav } from '../components/BottomNav'

type Pane = 'home' | 'edit' | 'schedule' | 'live' | 'payout' | 'earnings' | 'merch'

const PANES: Record<Exclude<Pane, 'home'>, { title: string; body: string }> = {
  edit: { title: 'プロフィール編集', body: '芸名・ジャンル・自己紹介・写真を編集する画面です。このプレビューでは保存しません。' },
  schedule: { title: '出演予定', body: '自分の出演枠を確認する画面です。このプレビューでは予定を変更しません。' },
  live: { title: 'LIVE配信', body: 'カメラ準備とLIVE開始／終了の画面です。このプレビューでは配信を開始しません。' },
  payout: { title: 'Stripe受取設定', body: '本人確認と振込口座をStripeで登録する画面です。このプレビューでは接続しません。' },
  earnings: { title: '投げ銭／売上', body: '投げ銭件数と売上・システム利用料を確認する画面です。このプレビューでは決済しません。' },
  merch: { title: 'グッズ登録／管理', body: 'グッズの登録と公開を行う画面です。このプレビューでは商品を保存しません。' },
}

export function PerformerPreviewApp() {
  const [pane, setPane] = useState<Pane>('home')

  return (
    <div className="pl-app">
      <div className="pl-shell">
        {pane === 'home' ? (
          <div className="pl-registration">
            <p className="pl-brand">PREVIEW</p>
            <h1 className="pl-h1">パフォーマーマイページ</h1>
            <p className="pl-muted">承認完了後に本人が見る画面のプレビューです。本番データは変わりません。</p>
            <div className="pl-registration__identity">
              <div><h2 className="pl-h2">承認済みパフォーマー</h2><p className="pl-muted">登録完了・公開中（プレビュー）</p></div>
            </div>
            <section className="pl-registration__section">
              <h2 className="pl-h2">公開・プロフィール</h2>
              <div className="pl-registration__actions">
                <button type="button" className="pl-activity-card" onClick={() => setPane('edit')}><Pencil size={20} /><strong>プロフィール編集</strong><span>芸名や写真を更新</span><em>開く</em></button>
                <button type="button" className="pl-activity-card" onClick={() => setPane('schedule')}><CalendarDays size={20} /><strong>出演予定</strong><span>自分の出演枠</span><em>開く</em></button>
              </div>
            </section>
            <section className="pl-registration__section">
              <h2 className="pl-h2">配信・受取</h2>
              <div className="pl-registration__actions">
                <button type="button" className="pl-activity-card" onClick={() => setPane('live')}><Camera size={20} /><strong>LIVE配信</strong><span>開始と終了</span><em>開く</em></button>
                <button type="button" className="pl-activity-card" onClick={() => setPane('payout')}><Share2 size={20} /><strong>Stripe受取設定</strong><span>口座と本人確認</span><em>開く</em></button>
              </div>
            </section>
            <section className="pl-registration__section">
              <h2 className="pl-h2">売上</h2>
              <div className="pl-registration__actions">
                <button type="button" className="pl-activity-card" onClick={() => setPane('earnings')}><WalletCards size={20} /><strong>投げ銭／売上</strong><span>件数と金額</span><em>開く</em></button>
                <button type="button" className="pl-activity-card" onClick={() => setPane('merch')}><ShoppingBag size={20} /><strong>グッズ管理</strong><span>登録と公開</span><em>開く</em></button>
              </div>
            </section>
            <a className="pl-btn pl-btn--ghost pl-btn--block" href="/">一般ユーザー画面へ戻る</a>
          </div>
        ) : (
          <div className="pl-registration">
            <p className="pl-brand">PREVIEW</p>
            <h1 className="pl-h1">{PANES[pane].title}</h1>
            <p className="pl-muted">{PANES[pane].body}</p>
            <button type="button" className="pl-btn pl-btn--block" onClick={() => setPane('home')}>マイページへ戻る</button>
            <a className="pl-btn pl-btn--ghost pl-btn--block" href="/">一般ユーザー画面へ戻る</a>
          </div>
        )}
        <BottomNav
          role="performer"
          active="profile"
          onNavigate={(key) => {
            if (key === 'fan-home') window.location.assign('/')
            else if (key === 'event-list') window.location.assign('/event')
            else if (key === 'live-list') window.location.assign('/live?live=1')
            else if (key === 'map-schedule') window.location.assign('/event')
            else setPane('home')
          }}
        />
      </div>
    </div>
  )
}
