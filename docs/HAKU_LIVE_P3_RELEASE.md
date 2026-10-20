# HAKU LIVE P3 コメント管理リリース手順

更新日: 2026-10-16

## 変更境界

P3はLIVEコメントをセッション単位に分離し、配信者・登録モデレーターによる削除と、そのLIVE限定ミュートを追加する。Stripe、Connect、投げ銭確定、LiveKit映像・音声トラック、本番の既存コメント行は変更しない。

## 重要な適用順序

旧クライアントはコメント投稿時に`live_session_id`を送らない。新しいRLSは、アクティブなLIVEセッションIDが一致する投稿だけを許可する。このため、**DBマイグレーションをアプリより先に適用してはならない**。

1. PR #57のGitHub ActionsとVercel Previewが、対象commitで成功していることを確認する。
2. `npm run test:live`、`npm run test:registration`、`npm run build`を実行する。
3. PR #57をmainへ統合し、Vercel Productionが同じcommitでREADYになるまで待つ。
4. 本番で新規LIVEを開始し、配信者・視聴者の双方からコメントを1件ずつ投稿する。`live_comments.live_session_id`が現在のセッションIDで保存されることを読み取り確認する。
5. Supabase CLIを正しい本番project refへリンクし、`supabase migration list --linked`で履歴を確認する。project refと環境名を別の確認者と照合する。
6. `supabase db push --linked --dry-run`で`20261016142951_live_comment_moderation.sql`だけが対象であることを確認する。
7. 明示承認後に`supabase db push --linked`を実行する。
8. [読み取り専用検証SQL](../supabase/verify_live_comment_moderation_readonly.sql)をSQL Editorで実行し、期待値と一致することを確認する。
9. 二端末で投稿、自動スクロール、削除同期、ミュート、別LIVEでの投稿可否を確認する。

## 適用後の期待値

- `live_comment_moderators`と`live_comment_mutes`が存在し、RLSとFORCE RLSが有効。
- `live_comments_insert`は本人、アクティブセッション、performer一致、非ミュートを要求。
- `live_comments_moderator_delete`は配信者、登録モデレーター、管理者だけを許可。
- `live_comments`のreplica identityはFULL。
- 既存コメント件数と本文はマイグレーション前後で変化しない。

## 本番DB承認対象

承認対象は`supabase/migrations/20261016142951_live_comment_moderation.sql`の1ファイルだけとする。SHA-256は`075502b0adde57e2eb40a91a40a4fd3b3274d1bf8048ed59938206c5ffd741c1`。承認時はファイル・PR・`supabase db push --dry-run`で照合する。

SQLの影響は次に限定される。

- `live_comment_moderators`と`live_comment_mutes`を新規作成する。
- 両テーブルでRLSとFORCE RLSを有効化し、`anon`の権限を明示的に0にする。
- 配信者・登録モデレーター・管理者だけに、担当LIVE内の必要最小限の操作を許可する。
- `live_comments_insert`を、本人・配信中・セッション/出演者一致・非ミュートの条件へ置換する。
- `live_comments_moderator_delete`を追加し、配信者・登録モデレーター・管理者だけに削除を許可する。
- 本番に残っている`live_comments_delete_own`を削除し、一般視聴者による自己コメント削除もモデレーション経由に統一する。
- `live_comments`のブラウザロール権限を再定義し、RLSが保護しない`TRUNCATE`と不要な`UPDATE`等を`anon`/`authenticated`から除去する。
- RealtimeのDELETE同期用に`live_comments`を`REPLICA IDENTITY FULL`へ変更する。

既存行を変更または削除する`UPDATE`、`DELETE`、`TRUNCATE`は実行しない。投票、投げ銭、Stripe、Connect、出演者テーブルの定義・ポリシー・データは変更しない。

## バックアップと事前検証

完全バックアップ、整合性検証、隔離復元、migration履歴不整合の扱いは
[`HAKU_P3_PRODUCTION_DB_APPROVAL.md`](./HAKU_P3_PRODUCTION_DB_APPROVAL.md)を正本とする。
以下のpublic schema dumpは内容確認用の補助バックアップであり、完全バックアップの代替にはしない。

本番project refを二者で照合してから、アクセス制限された一時ディレクトリへschemaとdataを取得する。バックアップ先はリポジトリへ追加しない。

```sh
backup_dir="$(mktemp -d)"
chmod 700 "$backup_dir"
supabase db dump --linked --schema public --file "$backup_dir/public-schema-before-p3.sql"
supabase db dump --linked --data-only --schema public --file "$backup_dir/public-data-before-p3.sql"
supabase migration list --linked
supabase db push --linked --dry-run
supabase db advisors --linked --type security --level warn
supabase db advisors --linked --type performance --level warn
```

バックアップファイルのサイズが0でないことを確認し、暗号化された承認済み保管先へ移す。チャット、PR、GitへDB資格情報やデータを貼らない。

## 障害時

アプリ公開後・DB適用前に問題があれば、直前の正常なVercel deploymentへ戻す。DB適用後は旧クライアントへの単独ロールバックを行わない。旧クライアントはセッションIDを送らないため、コメント投稿がRLSで拒否される。

DB適用後にコメント投稿だけが停止した場合は、まずP3アプリがProductionへ割り当てられているか確認する。緊急に旧クライアントとの互換性を戻す必要がある場合のみ、承認を得て`live_comments_insert`を以前の`auth.uid() = user_id`へ戻す。この緩和中はミュート強制が無効になるため、恒久対応にしない。新規テーブルや既存コメントを削除してロールバックしない。

互換性ポリシーへ戻す場合も本番DB変更として再承認し、次だけをトランザクション内で実行する。

```sql
begin;
drop policy if exists live_comments_insert on public.live_comments;
create policy live_comments_insert on public.live_comments
  for insert to authenticated
  with check ((select auth.uid()) = user_id);
commit;
```

P3モデレーション全体を無効化する場合は、上記の投稿互換性復旧に加え、承認を得て次を実行する。既存コメントと新規テーブルは削除しない。

```sql
begin;
drop policy if exists live_comments_moderator_delete on public.live_comments;
drop policy if exists live_comments_delete_own on public.live_comments;
create policy live_comments_delete_own on public.live_comments
  for delete to authenticated
  using ((select auth.uid()) = user_id);

revoke all on public.live_comment_moderators from anon, authenticated;
revoke all on public.live_comment_mutes from anon, authenticated;
revoke all on public.live_comments from anon, authenticated;
grant select on public.live_comments to anon;
grant select, insert, delete on public.live_comments to authenticated;
alter table public.live_comments replica identity default;
commit;
```

この復旧はコメント行や新規テーブルを削除しない。完全なDB復元は最終手段とし、Supabaseの承認済み復旧手順と事前バックアップを使ってDB管理者が実施する。`supabase db reset --linked`は本番で絶対に使用しない。

## 現在の環境状態

この文書作成時点の作業環境にはSupabase project linkと`SUPABASE_ACCESS_TOKEN`がなく、本番マイグレーションは未実行である。本番適用済みとは報告しない。
