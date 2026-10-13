# 出演予定・フォロワー通知 本番公開手順書

対象: PR #37 / `20261013_performer_appearances_and_notifications.sql`

この手順書は、出演予定管理と通知基盤を段階的に公開するためのものです。実ユーザーへの Web Push 配信は、アプリ公開とは別の承認段階とします。

## 0. 公開前の停止条件

次のいずれかに該当する場合は作業を中止します。

- GitHub `main` と Vercel Production の commit が一致しない
- Supabase の復元可能なバックアップを確認できない
- migration の dry-run または隔離DB検証が失敗する
- migration 適用前後の既存データ件数に説明できない差がある
- RLS、Trigger、Function の検証が失敗する
- GitHub Actions または Vercel Preview が失敗する
- Web Push の本番フラグが意図せず有効になっている

## 1. バックアップ確認

1. Supabase Dashboard で対象本番プロジェクトを開く。
2. `Database` → `Backups` で、利用可能なバックアップ方式、直近成功時刻、復元操作の有無を確認する。
3. 自動バックアップを利用できない場合は、Supabase CLI と本番DBの正規接続情報をローカルだけで使用し、roles、schema、data の論理バックアップを取得する。
4. バックアップは暗号化して本番プロジェクト外へ保管し、隔離プロジェクトへの復元テストを完了する。
5. Storage オブジェクトはDBバックアップとは別管理であるため、完全復旧が必要な場合は別途保全状況を確認する。

秘密鍵、DBパスワード、アクセストークンをチャット、Issue、PR、CIログへ貼り付けないでください。

## 2. migration 適用前の READ ONLY 記録

以下を保存します。

- `supabase_migrations.schema_migrations` の最新状態
- `auth.users`、フォロー関係、既存通知、Push購読の件数
- 既存のテーブル、Policy、Trigger、Function 一覧
- AWP投票、ランキング、決済、残高に関係する主要テーブルの件数と更新時刻

PR #37 の migration は追加型であり、既存テーブルの削除、既存行の更新、決済・投票・残高への書き込みを含まないことを再確認します。

## 3. migration の適用

1. 本番と同じ拡張・RLS構成の隔離DBで migration を2回実行し、再実行可能性を確認する。
2. 適用対象が `20261013_performer_appearances_and_notifications.sql` のみであることを確認する。
3. 本番の変更承認を取得する。
4. 承認された Supabase CLI または Dashboard SQL Editor で migration を適用する。
5. 適用中はPRのmergeとProductionデプロイを行わない。

## 4. migration 適用後の READ ONLY 検証

次を確認します。

- 新規テーブル、enum、index、Function、Trigger が存在する
- RLS が全対象テーブルで有効である
- 下書き・非公開予定は所有者と運営者以外に見えない
- 公開済み、または公開後に中止された予定のみ公開読み取り可能である
- 通知受信者は現在のフォロー関係と通知設定を満たす
- Push claim は無効購読、フォロー解除、通知OFFを除外する
- 通知イベントと配信対象の一意制約が有効である
- 既存データ件数が適用前記録と一致する
- 決済、出金、投票、ランキングに変更がない

検証に失敗した場合はアプリを公開せず、migrationを残したまま原因調査します。安易にDROPや本番復元を行いません。

## 5. Vercel環境変数

初回公開時は Web Push を無効のままにします。

- `ENABLE_APPEARANCE_WEB_PUSH`: 未設定または `false`
- `VITE_WEB_PUSH_PUBLIC_KEY`: クライアント公開用VAPID公開鍵
- `WEB_PUSH_VAPID_PUBLIC_KEY`: サーバー用VAPID公開鍵（上記と同一）
- `WEB_PUSH_VAPID_PRIVATE_KEY`: サーバー専用の秘密鍵
- `WEB_PUSH_SUBJECT`: 運営連絡先の `mailto:` または正規URL

秘密鍵を `VITE_` で始まる変数へ設定しません。Preview と Production のスコープを分け、値そのものはログや報告へ出しません。

## 6. PR #37 の統合とデプロイ

1. PR差分、必須チェック、mergeability、Vercel Previewを再確認する。
2. migration適用後のREAD ONLY検証が成功していることを確認する。
3. PR #37 のmerge承認を取得する。
4. 保護されたPR経由でmergeする。force pushは使用しない。
5. Vercel Productionがmerge commitから正常に構築されたことを確認する。
6. `/`、`/official`、`/haku-admin` のHTTP応答と既存ナビゲーションを確認する。

旧コードは追加されたDB構造を使用しないため、migration先行でも動作します。新コードをDBより先に公開すると新規テーブル参照が失敗するため禁止します。

## 7. 管理されたテストアカウントでの検証

実ユーザーを使用せず、運営管理のパフォーマーとフォロワーで確認します。

1. 下書き作成: 公開画面・通知に出ない
2. 初回公開: アプリ内通知が1件だけ作成される
3. 同一内容保存: 重複通知されない
4. 重要変更: 新しいイベントとして1件通知される
5. 非公開化と再公開: 初回公開通知が重複しない
6. 中止: 公開済み予定だけが通知対象になる
7. フォロー解除・通知OFF: 以後の通知対象にならない
8. 通知タップ: アプリ内の許可された予定画面だけへ遷移する
9. LIVE、投票、ランキング、Stripe、グッズ、コックピット、下部ナビ、多言語を回帰確認する

この段階では `ENABLE_APPEARANCE_WEB_PUSH=false` を維持します。

## 8. Web Push の段階的有効化

Web Push は別途承認後にのみ有効化します。

1. VAPID設定とiPhoneホーム画面追加を確認する。
2. 運営管理端末だけを購読させる。
3. `ENABLE_APPEARANCE_WEB_PUSH=true` にする個別承認を取得する。
4. 管理された1フォロワーで初回公開、重要変更、中止、解除後停止を確認する。
5. 配信ログ、失敗理由、無効購読停止、重複有無を確認する。
6. 問題がなければ対象を段階的に広げる。

自動再試行ジョブは本番で有効化しません。必要時は同一イベントに対して認証済み配信処理を再実行します。一意制約、状態、`next_attempt_at`、最大試行回数によって対象を限定します。

## 9. 障害時の停止・復旧

1. Push障害: `ENABLE_APPEARANCE_WEB_PUSH=false` に戻し、新規Push配信を停止する。
2. アプリ障害: Vercelで直前の正常なProduction deploymentへrollbackする。
3. DB構造: 追加型migrationは残し、旧コードから未使用の状態にする。即時DROPしない。
4. 配信状態不明: 同じイベントを無条件に再送せず、delivery状態と外部応答を照合する。
5. DB復元: 復元以降の正常な書き込みを失うため、最終手段とし、影響範囲を確認して個別承認を得る。

Web Push成功後かつDB応答保存前に通信断となった場合、外部配信は at-least-once となり、まれに再表示される可能性があります。通知の安定した `tag` による端末側置換と、DB側の一意制約で影響を抑制します。
