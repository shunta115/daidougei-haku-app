# Stripe Connect ステージング実操作チェックリスト

実施前に、画面やログへ秘密値を表示せず次を確認する。

- [ ] Vercel環境が Preview である
- [ ] Previewの `/api/stripe/connect?probe=preview-readiness` が `stripeMode: "test"` と `safeForStripeOnboardingTest: true` を返す（秘密値は表示しない）
- [ ] Stripe Webhook secretもテスト用エンドポイントのものである
- [ ] Supabase project refが本番と異なり、`haku-merch-validation` と一致する
- [ ] テスト用メールアドレス・テスト用パフォーマーだけを使う

## iPhone Safari想定

- [ ] 芸名・メール・パスワードだけでHAKU登録する
- [ ] メール確認後に同じアカウントへ復帰する
- [ ] 「受取口座を設定する」1タップでStripeへ移動する
- [ ] 本人確認前にタブを閉じ、HAKUから同じStripeアカウントを再開する
- [ ] 使用済みAccount Linkを再訪し、新しいリンクで自動再開する
- [ ] メール認証・2段階認証後にHAKUへ戻る
- [ ] Safariのストレージ制限時にも登録状況画面が壊れない

## Android Chrome想定

- [ ] 上記と同じ一連の操作を行う
- [ ] 戻る操作、タブ復帰、画面回転後にも二重アカウントが作られない
- [ ] オフライン後の再試行で日本語の次操作が表示される

## 状態・Webhook

- [ ] 未提出件数、期限超過、審査中、利用制限を別表示する
- [ ] `account.updated` 後に `stripe_onboarding_complete` が実状態と一致する
- [ ] 受取設定完了と銀行入金完了を混同しない
- [ ] Webhook再送が冪等である
- [ ] 既存の投げ銭・グッズ・送金台帳に更新がない

実操作できなかった項目はチェックせず、未検証としてリリース判定に残す。
