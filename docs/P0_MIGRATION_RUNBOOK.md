# P0 Migration Runbook

Productionでは自動適用せず、最初に`supabase/preflight_20260921_p0.sql`を読み取り実行します。

## 適用順

1. `20260910_product_event_kpis.sql`
2. `20260921_restrict_public_signup_roles.sql`
3. `20260921_event_schedule_types.sql`

各ファイルは個別トランザクションです。lockを5秒以内に取得できない場合、変更せず失敗します。

## 期待するpreflight結果

- `roles`に既存のfan、performer、organizer、admin件数が出る
- `performers.approved`が公開画面の件数と一致する
- `unknown_product_events`が空
- `signup_trigger_function`が`handle_new_user`
- performer公開policyに`is_approved = true`が含まれる

## 影響

- KPI migrationは許可イベント名を拡張するだけで、既存イベント行を更新しない
- signup migrationは今後作成されるユーザーだけに作用し、既存roleを更新しない
- schedule migrationは列・制約・indexを追加し、既存出演枠は`regular`として維持する
- tips、Stripe、merch、follows、votes、LiveKitのテーブルや設定は変更しない

## Rollback

適用中のエラーはトランザクション全体が自動rollbackされます。

適用後にアプリを戻す場合、追加列・拡張済みKPI名は旧コードと互換性があるため、まずコードだけを戻します。
列やindexの削除は既存Productionデータを壊し得るため実施しません。
signup関数だけを戻す必要がある場合は、適用前に保存した`handle_new_user`定義を再適用できますが、
organizer自己登録の問題を再発させるため緊急時以外は行いません。

KPI制約を以前の定義へ戻す場合は、preflightで保存した制約定義を使用します。
新しいイベント名の行が既に記録されている場合は旧制約と両立しないため、データ削除ではなく拡張制約を維持します。

