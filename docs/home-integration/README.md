# #105 + #113 ホーム統合（Draft）

対象ブランチ: `codex/home-105-113-integration`。main基点 `4403bd7f1274678dc39235e58bb59835f4dd4a6c`。

採用元は #105 `b63b0b268e2d845de1fba5ccddca1ecf55d7cc2c` と #113 `9904f758b9742afdbc3435c44e1a42723faad491`。#113から独立worktreeを作成し、#105のmainとの差分をthree-way適用して統合した。浅い履歴のため通常mergeでは共通祖先を取得できず、無関係な履歴の強制mergeはしていない。元のPRブランチはpush・rebase・force-pushしていない。

## 採用内容と競合解消

| 対象 | 統合後 |
| --- | --- |
| LIVE配信 | #105 HomeStage。公開・承認済み・active候補に限定し、is_liveと未終了セッション、120秒以内のheartbeat（未記録時は開始時刻）を照合。設定済みYouTube URLや予定時刻だけではLIVE表示しない |
| LIVE予約 | #105のクイック予約・予定一覧・予約管理・解除確認・二重送信防止・古い読取保護・アカウント切替保護を維持。既存APIと機能フラグを使用 |
| 注目 | #113のサーバー順位。max(最終サインイン, 操作した本人user_idの最終イベント) → Stripe登録完了 → プロフィール完成度。ログイン回数／閲覧回数を混同しない |
| まもなく出演 | #113の公開個人出演と公開イベント枠。進行中→開始時刻順。中止／延期／非公開／終了を除外。LIVE予約と別枠 |
| 出演予定なし | 新しい互換フィールドunscheduledに全候補を活動→Stripe→完成度順で格納し、専用DISCOVER枠へ。「公開出演予定なし」と表示し日時を生成しない。旧recentフィールドも互換のため保持 |
| LIVEバッジ | 注目・公開出演・フォロー・ナビゲーターにも#105の確認済みLIVEだけを反映。古いis_liveフラグを復活させない |
| 自動更新 | #105の表示中30秒＋復帰／online更新、同時load抑止を採用。#113のサーバー順位キャッシュは60秒。最長でこのキャッシュとクライアント更新分の遅延がある |

実際に競合した3ファイルはFanHomeScreen.tsx、discovery-loading.test.tsx、vercel.json。画面はHomeStageのLIVE／予約を上段に残し、その後に#113の注目・公開出演・予定なし枠を配置。#105の活動ローテーション枠は採用指示に合わせて優先表示に使用せず、検索・全出演者への導線は残した。HomeStage単体の既存表示はshowDiscoveryの既定値で互換維持。重複は各枠内で抑止し、LIVE・注目・出演予定・フォロー間は異なる用途として許容する。

テストは#113の新取得API・LangProviderを維持して、#105のセッション証拠を追加。vercel.jsonは両元ブランチの停止設定と統合ブランチの停止設定を保持し、#113の順位API rewriteを維持。既存cron／他ルートは変更しない。

セッション取得は#105の読み取り専用設計を維持し、履歴500件によって現在LIVEが隠れないよう全ページ取得へ変更。presence reconciliation／配信開始終了は呼び出さない。LIVE予約一覧は既存APIの30件上限を維持するため、大量予約時の取得範囲は残存制約。

## 隔離TESTで実施した範囲

既存TESTは `aeqskxxykzapgaudbeqa`。本番DBは操作していない。TESTのlive_schedules・live_reservations・product_eventsが不足していることを確認したが、永続DDL、機能フラグ、認証、環境変数、資格情報は変更していない。

test-db-rollback.sqlをこのTESTだけに実行し、匿名の公開表示、非公開除外、auth履歴読取拒否、他人の編集拒否、本人の時刻変更、JST正規化、中止の順位除外、公開中止案内維持の8項目を検証。fixtureはすべてROLLBACK。Auth・sessions・profiles・performers・LIVE・follows・出演・通知・通知イベント・push queueの10テーブルは実行前後の全行ハッシュと件数が一致（test-db-result.json）。外部配信・push配信・決済は行わない。

さらにローカルPGliteで既存のLIVE予約migrationそのものを適用し、RLS・重複予約・他人の予約読取／解除拒否・private予約拒否・本人解除・開始通知の冪等性・LIVE証拠との整合を試験する。これは最小依存スキーマでのSQL試験であり、接続済みTESTのAuth/JWT試験ではない。

接続済みTESTの通常ログイン→本人操作→順位API→予約／視聴の一気通貫は、必要テーブル不足と安全なログイン済み接続の未確認により未実施。既存ユーザーのパスワード変更、refresh token抽出、管理者成り代わりで代用していない。実施する場合は、必要なテーブル／RLS／フラグ／接続先の差分を個別承認してから準備する。

## Previewと受入境界

統合用Previewは実際のFanHomeScreen・HomeStage・順位関数・クライアント取得処理を使用する静的QA。架空データ、予約のメモリ内操作、callback確認であることを画面に明示。Supabase資格情報・API Function・cronは含めず、CSPで外部接続／media／frame／formを遮断。既存プロジェクトのPreviewだけを使い、Production公開／共有環境設定変更はしない。

WebKit iPhone 13相当でLIVEあり／なし、実出演あり／なし、匿名、予約と解除確認、活動順、30秒更新、応援／フォロー／MAP、横画面／320pxを試験。物理iPhone Safari、Safariのバックグラウンド復帰と画面ロック、別端末LIVE映像／音声、実予約通知、実フォロー／決済は未確認。コールバックやfixtureの成功をこれらの完了とは扱わない。

本番DB変更、mainマージ、Productionデプロイは禁止のまま。元PRと既存Desktop作業は保護する。過去のdocs/HOME_ACTIVITY_REFRESH.md、docs/home-activity-ranking/は元PR時点の証跡であり、統合の最新状態は本ディレクトリを参照する。

## 再現

```sh
npm run typecheck
npm run build
npx vitest run
npx vite build --config tests/home-integration-preview/vite.config.ts
node scripts/prepare-home-integration-preview.mjs
npx vite --config tests/home-integration-preview/vite.config.ts
# 別ターミナル。OS対応WebKitはHAKU_WEBKIT_EXECUTABLEで指定可能
node tests/home-integration-preview/run.mjs
```

Preview（READY / target=null / Vercel認証保護あり）:
https://daidougei-haku-3bco5un22-daidougei-s-projects.vercel.app/

ローカル全体実行は93ファイル522テスト成功。後追加のローカル予約DB試験1件も成功。最終全件はDraft PRのGitHub CIで再確認する。新DB試験はPGlite初期化が負荷下で10秒／30秒を超えたため、当該fixtureの初期化だけ60秒に設定（検証本体のassertionや既存テストのtimeoutは変更なし）。UI試験の並行実行時timeoutも記録し、最終CIで判断する。
