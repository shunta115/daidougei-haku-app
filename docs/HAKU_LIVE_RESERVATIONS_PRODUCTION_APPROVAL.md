# HAKU LIVE予約・開始通知 本番DB承認資料

更新日: 2026-10-18

## 承認対象

- Supabase project ref: `pmmtijwswzwhuriqhlep`
- migration: `supabase/migrations/20261018092439_live_reservations_and_viewer_analytics.sql`
- SHA-256: `2e1e4dad9d3b22cae48030fb8fcd6ba1028a9350952a5756790da8cbb5281b93`
- PR: #66

本承認にStripe、Connect、投げ銭、投票、既存出演者データの更新は含めない。

## 本番READ ONLY照合結果

- PostgreSQL 17、project statusは`ACTIVE_HEALTHY`。
- `performers.is_private_test`が存在し、Test Performerは`true`で運用されている。
- `live_sessions`の既存SELECT RLSも、一般公開を`is_approved=true and is_private_test=false`に限定している。
- `live_schedules`、`live_reservations`、`live_viewer_samples`、`notify_live_reservations_started`は未作成。
- PR #66の予定SELECTと予約INSERTは、既存LIVEと同じ公開条件に修正済み。非公開テスト予定は本人、管理者、`live_navigator_assignments`でAuth UUIDを明示割当された有効な担当者以外へ返さず、一般ユーザーは直接UUIDを指定しても予約できない。
- 開始通知は、対象予定を所有する配信者が有効な自分のLIVE sessionを指定した場合だけ実行でき、通知先はその予定を予約したユーザーだけである。

## SQL差分

追加のみ:

1. `public.live_schedules`
2. `public.live_reservations`
3. `public.live_viewer_samples`
4. 上記のindex、RLS、policy、GRANT/REVOKE
5. `public.notify_live_reservations_started(uuid, uuid)`

既存行への`UPDATE`、`DELETE`、`TRUNCATE`はない。既存テーブルへの列追加もない。

## バックアップと復旧

- 2026-10-17 17:25:01 UTC取得の物理バックアップが`COMPLETED`。WAL-G有効、PITRは無効。
- 適用前に最新バックアップが`COMPLETED`であることを再確認する。
- 第一の復旧はVercelの`VITE_ENABLE_LIVE_RESERVATIONS`をOFFにして再デプロイする。新テーブルと予約データは保持する。
- DB側ロールバックが必要でも、まず3テーブルを論理exportする。データ保持が必要なため自動DROPは行わない。
- 物理restoreはproject全体を巻き戻す最終手段であり、Supabase Dashboardから影響時刻を確認して明示承認後に行う。

## migration履歴

- 本番履歴の`20261014065602_performer_appearances_and_notifications_20261014`をREAD ONLYで取得した。
- リポジトリ側ファイルを同じversion・内容・SHA-256 `089a4dca85ecc7e83c701875ca53d7c652360199c8f326564b67cf175ca951ba`へ一致させた。本番履歴は変更していない。
- それ以前の8桁ローカルmigrationは本番履歴に存在しないため、`supabase db push --include-all`は使用禁止。
- 承認後は本migrationだけを`apply_migration`で適用し、新しい履歴を正規に1件記録する。過去履歴へのrepair/INSERT/UPDATE/DELETEは行わない。

## 適用後検証

1. `supabase/verify_live_reservations_analytics_readonly.sql`を実行する。
2. 3テーブルでRLSとFORCE RLSが有効であることを確認する。
3. private-test guardが2件とも`true`であることを確認する。
4. `anon`/`authenticated`にviewer sample書込権限がないことを確認する。
5. SECURITY DEFINER関数がanon実行不可、authenticatedのみ実行可であることを確認する。
6. Security Advisorを再実行し、新規WARNがないことを確認する。
7. Test Performer本人、一般視聴者、管理者の各権限を検証する。

## 公開順序

1. 本SQLへの個別承認
2. migration 1件を適用
3. READ ONLY検証とSecurity Advisor
4. PR #66をmainへmerge
5. Vercel productionへ`VITE_ENABLE_LIVE_RESERVATIONS=true`を設定して再デプロイ
6. `ENABLE_LIVE_VIEWER_SAMPLES`は今回OFFのまま維持
7. 予約登録 → LIVE開始 → アプリ内通知 → LIVE画面遷移を検証

## 明示承認文

`PR #66の2e1e4dad... migration 1件を本番project pmmtijwswzwhuriqhlepへ適用し、検証成功後にPRをmergeしてVITE_ENABLE_LIVE_RESERVATIONSをONにすることを承認します。過去migration repairとENABLE_LIVE_VIEWER_SAMPLES有効化は承認対象外です。`
