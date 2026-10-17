# 投げ銭出金管理 本番適用手順

この手順は承認後にのみ実行する。本番決済、Transfer、Payout、返金は実行しない。

## 0. 監査認証

- 本番アプリのruntime Secretは変更・取得・ログ出力しない。
- DB金額の確認だけなら、Supabase DashboardのSQL Editorで `supabase/verify_payout_release_readonly.sql` を実行する。SQLは `begin transaction read only` で開始する。
- CLIでバックアップ・migration履歴を確認する場合は、対象プロジェクトだけに届くSupabase scoped personal access tokenとDBパスワードを運営端末へ設定する。アプリのservice keyでManagement APIを代用しない。
- Stripe照合はPaymentIntents、Charges、Balance Transactions、Transfers、Accounts、Balanceのread権限だけを持つrestricted keyを `STRIPE_AUDIT_KEY` として一時設定する。
- `scripts/audit-awp-payout-readonly.mjs` は `SUPABASE_AUDIT_KEY` と `STRIPE_AUDIT_KEY` を優先する。Secret値はコマンド引数、画面、ログ、報告へ貼り付けない。

## 1. リリース固定とバックアップ

1. 対象commit、Vercel project ID、Supabase projectを記録する。
2. `ENABLE_LIVE_PERFORMER_TRANSFERS` が未設定または `false` であることを確認する。
3. Supabase DashboardのPITR/日次バックアップ状態を確認し、直前の復元点を記録する。
4. `performers`、`tips`、`merch_orders`、`performer_payouts` をスキーマ付きで暗号化バックアップする。秘密鍵や銀行情報をログへ出さない。
5. `supabase/verify_payout_release_readonly.sql` を実行し、AWP基準が `11 / 13100 / 521 / 1886 / 10693`、重複・不正出金行が0件であることを保存する。

差異が1円・1件でもあれば停止し、migrationやデプロイを実行しない。

## 2. migration

本番の `supabase_migrations.schema_migrations` とローカル履歴には既知の差異があるため、`supabase db push` は使用しない。過去migrationの再適用を招くためである。バックアップと管理者承認後、次の2ファイルだけをSQL Editorまたは対象projectを明示した `supabase db query --file` で記載順に個別適用する。

`supabase/migrations/20261016100000_payout_reservation_and_audit.sql`

`supabase/migrations/20261016101802_connect_bank_payout_ledger.sql`

1本目は列、制約、監査テーブル、トリガー、service-role限定RPCを追加する。2本目はConnect Transferとは独立した銀行Payout観測台帳を追加する。どちらも既存売上・残高のUPDATE/DELETE/TRUNCATEは行わない。

適用前に各ファイルを `begin transaction read only` では実行できないため、検証用DBで適用済みであることを再確認する。本番適用時は `ON_ERROR_STOP` 相当を有効にし、1ファイルずつ完了を確認する。migration履歴の修復は別作業とし、この公開作業と同時に実行しない。

適用後は同じ読み取り専用検証SQLを再実行する。AWP基準値が不変で、`reserve_performer_payout` の実行権限が `service_role` のみにあること、`payout_audit_events` のRLSが有効であることを確認する。

## 3. 段階的公開

1. production環境でビルドするがドメインを割り当てない staged production deploymentを作る。
2. `/`、`/haku-admin`、投票、LIVE、グッズ、イベント、ランキング、ナビゲーションをスモークテストする。
3. 管理者でコックピットを開き、出演者ID別の本番売上・手数料・未送金残高が表示されることを確認する。
4. 出演者本人でマイページを開き、他人の残高が見えないこと、テスト決済が出金対象外であることを確認する。
5. Transferフラグを有効にせず、出金申請ボタンから実送金テストを行わない。
6. 合格した同一deploymentをproductionへpromoteする。preview buildの再ビルドをproductionへ流用しない。

## 4. 公開後確認

- Vercel deploymentがREADYで正しいcommitか。
- 5xx、Stripe webhook失敗、Supabase権限エラーが増えていないか。
- AWP読み取り専用照合が不変か。
- Connect未登録者にも内部未送金残高が保持されているか。
- 予約済み残高が再申請可能額から除外されるか。
- Transferと銀行Payoutが別状態として表示されるか。

## 5. 障害時

1. `ENABLE_LIVE_PERFORMER_TRANSFERS=false` を維持し、資金移動を止める。
2. 直前のVercel production deploymentへrollbackする。
3. migrationは加算型のため、緊急時にテーブルや列をDROPしない。旧コードは追加列・追加テーブルを無視できる。アプリだけを直前deploymentへ戻す。
4. スキーマ自体を戻す必要がある例外時は、先にStripe webhookを停止せずアプリを旧版へ戻し、`connected_account_payouts`を暗号化バックアップする。参照がないことを確認し、別途承認された保守時間内に2本目の追加テーブルだけを削除する。1本目の列・監査ログ・予約RPCは資金照合証跡なので削除しない。
5. 状態不明のTransferは予約を解除しない。StripeのTransfer IDと冪等キーを照合してから復旧する。
6. AWP基準との差異があればDBを自動修正せず、バックアップ・Stripeオブジェクト・監査ログを照合する。

## 6. needs_reconciliation の復旧

1. 新しい出金申請を作成せず、既存の予約行を保持する。
2. `stripe_transfer_id` が保存済みなら、同じTransferをStripeから取得し、金額・送金先Connect ID・`metadata.payout_row`が予約行と完全一致する場合だけ状態を確定する。
3. Transfer IDがない通信タイムアウトでは、既存予約の同じidempotency keyを使う。新しいキーや新しい予約行を作らない。
4. 金額・送金先・metadataのいずれかが一致しなければ自動復旧せず、予約を`needs_reconciliation`のまま保持する。
5. `transfer.reversed`はTransfer取消として記録する。銀行Payoutの失敗・取消と混同しない。
6. 復旧前後にStripe DashboardのTransfer、内部予約行、`payout_audit_events`を照合する。

本番Transfer機能が無効な間は状態再確認も403で停止する。機能フラグを監査目的だけで有効化しない。
