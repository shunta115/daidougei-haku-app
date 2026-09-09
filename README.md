# 大道芸博 — Platform β

ストリートパフォーマーとファンをつなぎ、ライブ配信と投げ銭で収益化するプラットフォーム（β）。

旧フェスティバル来場者アプリは `src/festival/` に残しています。エントリは `src/platform/` です。

## 必須セットアップ

1. **Supabase** プロジェクトを作成
2. SQL Editor で次を実行
   - `supabase/migrations/20260726_platform_beta.sql`
   - `supabase/migrations/20260728_fix_performer_public_read.sql`
   - `supabase/migrations/20260729_native_livekit.sql`
   - `supabase/migrations/20260730_live_tip_events.sql`
   - `supabase/migrations/20260816_secure_tips_and_notifications.sql`
   - `supabase/migrations/20260902_launch_foundation.sql`
   - `supabase/migrations/20260903_organizer_and_appearance_notify.sql`
   - `supabase/migrations/20260904_live_event_bind.sql`
   - `supabase/migrations/20260905_ops_foundation.sql`
   - `supabase/migrations/20260909_safe_runtime_grants.sql`
   - `supabase/migrations/20260909_avatar_storage_hardening.sql`
   - `supabase/migrations/20260909_merch_foundation.sql`

   `supabase/migrations/20260728_fix_performer_grants_and_approve.sql` は既存performerを強制承認するため、人間レビューなしで本番適用しない。
3. Authentication → Providers → Email を有効化（βは Confirm email をオフ推奨）
4. Storage バケット `avatars` は migration で作成済み
5. 最初の管理者: 通常登録後、SQL で昇格

```sql
update public.profiles
set role = 'admin', status = 'active'
where email = 'you@example.com';
```

6. **LiveKit Cloud**（ネイティブ配信）を作成し、API Key / Secret / WebSocket URL を取得  
7. **Stripe** Connect を有効化し、Webhook を `https://YOUR_DOMAIN/api/stripe/webhook` に設定  
   Events: `checkout.session.completed`, `checkout.session.expired`, `account.updated`

## 配信基盤: LiveKit を選定

| 候補 | 遅延 | βコスト | 判定 |
|------|------|---------|------|
| **LiveKit** | WebRTCで1秒前後 | 小さい枠から可 | **採用** |
| Agora | 優秀 | 高め・契約重め | 将来スケール候補 |
| Amazon IVS | LLでも数秒寄り | AWS運用コスト | 大規模向け |
| Cloudflare Stream | HLS寄りで遅めやすい | 中 | VOD向き |

Instagram Live級の「今すぐ配信/視聴」には WebRTC の LiveKit が最適です。

## 環境変数

`.env.example` を参照。

| 変数 | 用途 |
|------|------|
| `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` | フロント |
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` | `/api`（サーバーのみ） |
| `VITE_LIVEKIT_URL` / `LIVEKIT_URL` | LiveKit WebSocket URL |
| `LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET` | トークン発行（サーバーのみ） |
| `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` | 投げ銭・Connect |
| `APP_URL` | 本番オリジン（Checkout / Connect 戻り先） |

## 開発

```bash
npm install
npm run dev
npm run typecheck
npm run build
```

## βに含まれる機能

- Auth（ファン / パフォーマー / 主催者 / 管理）
- プロフィール・画像・ライブ開始終了・現在地共有・履歴
- 検索・フォロー・コメント・投げ銭（Stripe Connect）・通知
- イベント情報・出演者・タイムテーブル・会場MAP・人気投票
- グッズ登録・一覧・詳細・Stripe決済・注文履歴・販売者注文確認
- 管理ダッシュボード（登録・ライブ・投げ銭・手数料・DAU/MAU）・承認・停止・削除・イベント運営
- PWA

## βで作らないもの

世界MAP / ランキング / ファンレベル / 企業案件 / AI / チケット

## Vercel

Framework: Vite · Build: `npm run build` · Output: `dist` · Node 20+

上記の環境変数を Vercel Project Settings に設定してから本番デプロイしてください。
