# ホーム活動優先ランキング（Draft・未公開）

基点: main `4403bd7f1274678dc39235e58bb59835f4dd4a6c`。既存Desktopの未コミット変更を編集せず、独立worktree/ブランチ `codex/home-activity-ranking` で実装。

## 監査と判定できる範囲

2026-10-31、本番DBは読み取りのみ。auth.users 69件（最終サインインあり69）、現存auth.sessions 122件/61ユーザー。セッション生成が最終サインインより1分以上新しいケース0。セッション更新はトークン更新を含むためログイン回数に数えない。失効済みセッションもあるので現存セッション数は累計ログイン数ではない。

product_eventsには home_view 4144件（本人IDあり2363）、performer_view 2069件（本人IDあり937）等。出演者本人に紐づく操作は1925件。user_idが操作した本人、performer_idは閲覧・応援の対象であり、対象IDをその人の活動に使うと誤順位になる。既存のINSERT RLSはuser_id=NULLまたはauth.uid()一致。操作イベントはクライアント計測なので欠測・再送・操作時刻の偽装可能性があり、完全な監査ログではない。回数・金額・人気はランキングに使わない。

公開承認済み/is_private_test=false/プロフィールactiveの候補は23人。performersのprofilesへのFKが2本あるため、本人FK `performers_id_fkey` を明示。非公開は既存スキーマのis_private_testで表現され、追加の公開フラグは存在しない。匿名/所有者/adminでも同じ公開候補だけを出す。旧DBのTest Performer名称も防御的に除外。

公開出演は performer_appearances(status=published, cancelled_at=NULL)と、公開eventsに所属するevent_slots(status=scheduled/live)。個人出演11件、イベント枠84件。キャンセル/延期/下書き/非公開/非公開イベントは集計対象外。LIVE配信予約(live_schedules)は舞台への出演と混同せず、今回の出演枠に混在させない。

## 実装

- 注目: max(最終サインイン, 本人user_idの最終操作時刻) DESC → Stripe onboarding完了 → プロフィールの非空7項目数 → ID。未来/不正日時は活動に使わない。一般updated_atは管理更新を含むので不使用。
- 出演: 進行中の公開予定 → 開始日時昇順 → 上記活動順。開始が同じ場合も決定的。現在時刻と終了時刻が確認できる予定だけを「出演中」とする。終了不明で過去開始の予定は除外。出演予定時間と実LIVE配信状態は別。
- JST「出演中/本日/明日/今週/月日 時刻」。今週は月曜開始。実時刻だけを表示。event_slotsは既存国内イベントのJSTを明示し、Safariの曖昧な日時解析を避ける。個人出演はDB正規化済みstarts_at/ends_atを使用。
- 予定のない人は活動順のDISCOVER「パフォーマーを探す」。ログイン日時が不明でも活動中とは断定しない。注目とDISCOVERの重複を除外、各枠は一人一枚。公開予定枠/フォロー/ヒーローとの重複は別の用途として許容し、重要な予定を注目枠の存在で隠さない。
- イベントlineupによるホーム候補の絞り込みを解除し、HAKU全体の公開出演者を対象にする。
- 60秒ごとの可視時更新、復帰/onlineで再取得。重複load防止、アンマウント/ユーザー切替後の古い応答を破棄。失敗時は表示をクリアし再試行できる。サーバーは60秒のメモリキャッシュ＋同時要求の集約。DBを変更するcronやpresence reconciliationは新規追加しない。
- `/api/home-ranking`は既存ops FunctionにGET専用ルートとして追加。既存サーバー用Supabase資格情報を使用し、Stripe呼出なし。DB変更・新規インデックス・新規サービス・契約なし。
- APIの出力は公開候補ID/順序と公開出演予定のみ。最終ログイン日時、操作ログ、セッション、メール、回数、プロフィール点数を返さない。レスポンス/エラーはno-store。ログにも記録しない。
- DB読取は全候補/全公開予定を500件ずつページング。最新操作は本人ごと1件、Authは4人単位の同時取得。クライアントは候補IDを100件ずつ公開RLSで再取得。旧searchの100件上限による事前切捨てを避ける。候補増大時は事前承認のうえDB側集約を検討。

## 不足計測の設計（未適用）

既存ログだけで「サインイン・画面閲覧等の操作」の新しさは判定可能。ただし全プロフィール編集、出演予定編集、配信管理画面の操作は網羅していない。追加案は本人JWTを検証する既存APIで、成功したprofile_save/appearance_publish/live_startに対しサーバー時刻で最終活動を更新する方式。JWT refresh、画面再描画はログインとして計測しない。履歴を公開せず集約時刻は非公開で保持する。クライアントprovided created_atを信頼しない。専用集約テーブル/制約/索引/書込処理が必要な場合はSQL・保存期間・RLS・負荷を別途提示し個別承認後にのみ適用する。今回は追加計測もDB変更も行わない。

## 既存PRとの競合

- #105: FanHomeScreen.tsx・discovery-loading.test.tsx・vercel.jsonが重なる。#105は公開活動/日替わりローテーション主体であり、本要件のログイン・本人操作順と異なる。未取り込み。自動マージせず、採用する画面構成を決めて順位データ層を統合し再検証。
- #106/#112/#103/#100/#87/#71: vercel.jsonのみ共通。個々のPRのルート・ブランチ設定を精査して共存させる。LIVE/投げ銭画面・APIには変更なし。
- #108: ファイル重複なし。YouTube設定・SQLには変更なし。
- open PR全36件の変更ファイルを比較し、上記以外の今回ファイルとの重複はなし（意味的競合やマージ成功を保証するものではない）。
- 他PRの変更、mainマージ、本番公開は禁止のまま。

## Previewと検証境界

Previewは実ホームコンポーネント＋実順位関数＋実クライアント取得処理を使った静的QA。架空の出演者と公開予定、本人状態、Supabase読取をfixtureで代替し、画面にサンプルと表示。API/cron/資格情報/実Supabaseクライアントを配備しない。CSPでconnect/media/frame/formを遮断。フォロー・応援は既存本体コードを変更しないが、実決済/実フォロー操作の結合確認には隔離TEST環境が必要。

通常Git Previewは当ブランチだけ停止。既存Preview環境が本番系サービス資格情報を共有する既存監査結果を踏まえ、共有環境変数/保護設定を変更せず静的成果物だけを直接Previewへ配置。

実機iPhone Safariと、接続済み隔離TESTでのAuth→操作イベント→API順位更新→表示までの受入は未実施。単体/fixture/WebKitの成功をこれらの成功と同一視しない。DB変更・mainマージ・本番デプロイはそれぞれ事前報告と個別承認が必要。

Preview（READY / target=null / Vercel認証保護あり）:
https://daidougei-haku-9q65xqj17-daidougei-s-projects.vercel.app/

配置先HTML/CSS/JSはHTTP 200。CSS/JSの本文をローカル成果物と完全一致確認、CSPも確認。静的7ファイルだけで、API/Functions/cron/envは含まない。

再現:
```sh
npm run typecheck
npm run build
npx vitest run
npx vite build --config tests/home-ranking-preview/vite.config.ts
node scripts/prepare-home-ranking-preview.mjs
npx vite --config tests/home-ranking-preview/vite.config.ts
# 別ターミナル。必要に応じてHAKU_WEBKIT_EXECUTABLEでOS対応WebKitを指定
node tests/home-ranking-preview/run.mjs
```
