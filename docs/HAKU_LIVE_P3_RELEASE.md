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

## 障害時

アプリ公開後・DB適用前に問題があれば、直前の正常なVercel deploymentへ戻す。DB適用後は旧クライアントへの単独ロールバックを行わない。旧クライアントはセッションIDを送らないため、コメント投稿がRLSで拒否される。

DB適用後にコメント投稿だけが停止した場合は、まずP3アプリがProductionへ割り当てられているか確認する。緊急に旧クライアントとの互換性を戻す必要がある場合のみ、承認を得て`live_comments_insert`を以前の`auth.uid() = user_id`へ戻す。この緩和中はミュート強制が無効になるため、恒久対応にしない。新規テーブルや既存コメントを削除してロールバックしない。

## 現在の環境状態

この文書作成時点の作業環境にはSupabase project linkと`SUPABASE_ACCESS_TOKEN`がなく、本番マイグレーションは未実行である。本番適用済みとは報告しない。
