# HAKU LIVE 修復候補 — 未完成・本番反映禁止

2026-10-31 JST。対象 `shunta115/daidougei-haku-app`。基点main `850424a5e3efdb17d7a9506a840288d4aeeb9955`。独立ブランチ `codex/live-repair-20261031`、作業先 `/private/tmp/haku-live-repair-20261031`。

## 安全性

- 最初にREAD ONLY監査を実施。元のDesktop作業ツリーには117件の変更があり、その内容を取り込まず、上書きせず、別worktreeを作成した。
- 稼働中HARIBOWのセッションに接続・操作していない。本番DB、LiveKit設定、配信開始/終了API、Stripe決済/送金/返金処理は変更していない。
- mainマージ・本番デプロイは実施しない。Vercel設定の差分は、この修復ブランチだけのGit自動デプロイ抑止。既存cron/rewritesを保持。
- 新規SQLは未適用。既存TESTへの適用もしていない。PGliteと独立したローカルPostgreSQL17のみに適用した。
- Previewは静的な隔離QA用。API/Functions/cronを含めず、本番環境変数を組み込まない。CSPも外部接続を拒否する。実Supabase/LiveKit/StripeのE2E成功を意味しない。

## 機能別監査

「実装済み」はコードが存在する意味で、実機合格を意味しない。監査対象は上記mainのコードであり、現在の本番配信を操作した結果ではない。

| 機能 | 監査時の分類・問題 | 修復候補と残る確認 |
|---|---|---|
| いいねタップ | 実装済み・故障あり。縦画面でコメント領域が共有などのサイド操作を遮る | 44px以上・touch-action:manipulation、重なり順/背景のpointer-events修復。iPhone実機連打は未実施 |
| 配信者へハート | Broadcastの実装あり。送信結果未確認、切断時に消失 | DB保存済み累計の差分から配信者/視聴者のハートとFEVERを発火。Realtime欠落時は2秒pollで補完 |
| 複数視聴者の累計 | 未実装。従来はブラウザ内加算だけ | セッション別のサーバー累計。JWT本人認証、batch UUIDの重複排除、原子的加算、本人ごと12/秒。匿名投稿は拒否しログインを案内 |
| 切断・再接続 | 故障。未送信バッチ消失、途中参加で累計復元不能 | 同一batch IDを最大8秒間隔で再送。再購読/online/focus/表示復帰/pollで再取得。バッファ上限120件、ページを閉じると未送信分は失われる。永続outboxは未実装 |
| HAKU FEVER | 実装済み・累計が端末ごとに異なる | サーバー確認済み差分で統一。既存の検証済みギフト→FEVER経路を保持 |
| 共有 | 実装済み・故障。失敗を握りつぶし、コピー結果なし。縦画面タップ遮断 | タップ内でWeb Shareを呼出し、未対応/拒否時はコピー、コピー不可なら選択可能URL。キャンセルは失敗扱いしない。LINE実受渡し未検証 |
| 直接URL・終了後 | performer URLは実装済み、次回LIVEへ紛れ込む可能性 | `watch`と`liveStartedAt`を含むURL。古いセッションは次回へ接続せず終了表示・プロフィール/一覧導線。旧URL（時刻なし）は従来どおり現LIVEを表示 |
| コメント投稿・同期 | 実装済み・故障。初期取得と新着競合、切断中の取りこぼし、連打/IME | 初期snapshot競合保護、セッション切替で旧応答破棄、再購読/online/可視時poll、送信中ガード、200字、IME変換中Enterを除外。応答消失後の手動再投稿のサーバー冪等化は未実装 |
| コメント自動スクロール | 実装済み・故障。80件上限で件数が変わらず停止 | 最新コメントIDでも追従。上へ読んでいる間は強制移動せず「最新コメント」を表示 |
| フォロー | 実装済み、電話UIで操作が隠れる | creator欄へ常時操作、二重操作防止。実DBへのフォロー書込みは未検証 |
| 視聴人数 | LiveKit参加者数の実装済み | 元の集計を保持。実SFU人数・再接続時表示は未検証 |
| 縦横切替 | 端末回転対応は実装済み。横画面コメント重なり | 視聴側横画面を映像/コメントの2列へ。配信者カメラの方向処理は変更しない |
| 全画面 | 実装済み・iOS video-only分岐で操作が隠れる/状態追従不良 | 視聴画面全体を対象。非対応時CSS全画面、操作を残す。iPhone実機未検証 |
| コメント表示/非表示 | 未実装 | 設定内に追加。受信同期は維持 |
| 設定 | アイコンは実装済みだが実際はcontain/cover切替だけ | 設定パネルに表示方式・コメント・音声ミュート/再生を配置 |
| 音質・音量 | 送信側AGC/echoCancellation/noiseSuppressionあり。視聴側は専用audio要素、autoplay失敗は握りつぶし | エンコーダ/マイク設定は変更しない。ミュート/音声再生導線を追加。iPhone音量は本体ボタン。音割れ/途切れ/遅延/Bluetooth/AirPlayは実測未実施 |
| 黒余白/切抜き | containは存在、縦画面stageが100svh固定 | 映像比率に応じた高さ、contain既定、coverは明示的な選択。レターボックスを完全に無くすことは保証しない |
| 応援・投げ銭 | ユーザー確認済みの既存機能 | 決済/送金/返金コードとTipGiftOverlayは変更なし。実決済テストは行わない |

## SQLの設計と適用ゲート

`20261031030528_durable_live_likes.sql` は新しい累計テーブルと非公開の重複排除/レート窓、`record_live_likes`だけを追加する。既存performers/live_sessionsへの書込み、終了trigger、cron追加、既存RPCの上書きはない。

書込みはverified JWTのauth.uidのみを使用し、任意actorIdを受け取らない。activeプロフィールを持つ認証済み非anonymousユーザーのみ。公開/承認済み/配信中とセッション開始時刻をDBで照合。非公開テストLIVEへの新規書込みは安全側で拒否する。既存private権限を拡張しない。複数アカウントを使う組織的濫用の完全防止は保証しない。

SECURITY DEFINERは最小の書込みRPCだけ。固定空search_path、PUBLIC/anonのEXECUTE拒否、内部schema/tableはanon/authenticatedから不可、累計の直接書込み不可、公開累計SELECTはperformerの公開条件/RLSで制限する。

適用前にTESTで実SupabaseのJWT/RLS/Realtime publicationと既存schemaを確認する。未適用環境では累計取得/保存にエラーが出るため、UIだけを先行公開しない。本番適用は配信終了後に別承認を取得する。DDLのlock_timeoutは3秒。配信者行のFOR SHAREは短い集計トランザクション内だけだが、実負荷下での遅延は未計測。

ロールバックはまずアプリを既存版へ戻す。新規累計/履歴は削除しない。必要なら別承認で新RPCのEXECUTEを停止。既存の配信セッション/決済には触れない。重複排除履歴の保持/保守方針は運用開始前の残課題。

## 検証境界

- ローカルPostgreSQL17の独立接続: 同時重複1回加算、異なる視聴者の同時加算、終了が先の遅延送信拒否を確認。結果は `native-db-result.json`。
- PGliteでSQL実行: 複数本人ID、payload改変、レート上限、直接書込み/内部読取拒否、匿名/停止/非公開/旧セッション/終了後の拒否を確認。
- React hook試験は模擬transport。ブラウザQAもAPI/LiveKitをadapterに置換し、いいねはWeb Locks + localStorage + BroadcastChannelを使う。実SupabaseのJWTとWAL配信は通していない。
- 物理iPhone Safari、LINEなどの実アプリ、実LiveKit映像/音声の端末間E2Eは未実施。これらが通るまで「完成」としない。
- 全体回帰は通常実行で既存投票/MAPテストの5秒timeout、低並列でも既存WASM DB初期化が長時間停止した。全件合格とは報告しない。対象検証とビルドの最終結果は別添。

## 参照した一次資料

- [Supabase Postgres Changes](https://supabase.com/docs/guides/realtime/postgres-changes): RLS、publication、購読の確認。
- [Supabase subscribe](https://supabase.com/docs/reference/javascript/subscribe): SUBSCRIBED時の再取得。
- [Web Share](https://developer.mozilla.org/en-US/docs/Web/API/Navigator/share): ユーザー操作内の呼出し、AbortError、環境差。
- Changelogを確認し、[TLS変更予定](https://supabase.com/changelog/cbc-tls-ciphers-deprecated)は今回のローカル修復のAPI変更ではないと確認。古いOSは別途実機受入が必要。

## 最終の対象検証・競合

- 対象Vitest: **9ファイル50件成功**（いいねhook、共有、コメント復帰/80件、ギフト→FEVER、決済保護、tip承認/確認）。別途PGliteのSQLテスト3件も成功。
- ローカルPostgreSQL17の実接続競合: **3ケース成功**。
- WebKit（iPhone13相当・物理実機ではない）: **13項目成功**。実際のLiveWatchScreen/PerformerLiveScreenを使い、視聴者2人と配信者でハート/累計/コメントを確認。結果は `webkit-result.json`。背景映像/音声は模擬、実Supabase通信ではない。
- TypeScriptとアプリのproduction相当build成功。bundleサイズの既存警告あり。QA専用buildも成功。
- 視覚確認でフォローの折返しとFEVER/入力欄の重なりも修正。最終の画面再確認結果はPRに記録する。
- `git merge-tree` のREAD ONLY相当検査（worktreeへmergeせず）で、#99は `useLiveCommentScroll.ts`、`LiveWatchScreen.tsx`、`PerformerLiveScreen.tsx`、`live.css` に競合。shallow履歴のためGitHubが示すbase `398d05b9` を明示した。#100は `package.json`（main側変更と#100側の競合。本修復では未変更）、両LIVE画面、`live.css` に競合。詳細は `pr99-merge-check.txt` / `pr100-merge-check.txt`。
- #99のmini-playerを採用する統合では、接続を保持する上位providerへ今回の累計購読を移し、同じクライアントで重複購読を作らないこと。コメントscrollの機能が重複するため一方だけ採用する。
- #100の配信予約/公開/終了RPCとwatchdogを、このPRの都合で上書きしない。セッション開始時刻とactive状態が確定してから購読/送信する。migrationは別機能だが、TESTで統合した権限/ロック順を再検証する。
- 両PRとも変更・mergeしていない。この修復PRを先に単独採用するか、統合用ブランチで競合解消とE2Eを行う必要がある。
