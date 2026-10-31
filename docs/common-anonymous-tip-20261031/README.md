# 全員共通の匿名投げ銭修復 / PR #112

更新: 2026-11-01 JST。**公開不可・Draft継続**。完全なStripe精算E2Eと実機受入は未完了。
PR: https://github.com/shunta115/daidougei-haku-app/pull/112
最新main 4403bd7を統合済み。元Desktopの未コミット変更と他PRは変更していない。

## 完了した修正

- 関連Draft #107（head 2b278c9）はHARIBOW専用ではなく共通画面の修正。監査時点で未マージであり、mainには欠陥が残っていた。
- LIVE縦画面の透明なコメントpanelが右側の応援ボタンを覆う。旧CSSのhit testで遮断、新CSSで到達を確認し、透明paddingのみタップ透過。
- 下部応援ボタンの匿名ログイン強制を撤去し、右側・プロフィールと同じTipScreen経路へ統一。コメント等の既存認証は維持。
- Checkout送信前の同期ロック、送信中の金額変更停止、再試行で同じrequestIdを維持。
- 出演者切替時の古いプロフィール応答を破棄し、表示プロフィールIDと支援先IDの一致を必須にした。
- 実アプリ初回起動でService Worker更新→再読込すると、消費済みwatch/tipToが失われHOMEへ戻る共通欠陥を追加再現。宛先snapshotの保存・復元を追加。登録・イベント・既存グッズ導線の回帰も成功。

特定出演者の名前/IDを実装で判定しない。Checkout API、台帳、手数料、精算、Transfer、返金の実装には差分なし。

## 障害原因の証拠範囲

本番READ ONLYではPAULとHARIBOWが承認済み/active、Connect紐付け/onboarding=trueで、実anon SELECTも成功。現在値であり障害時のStripe capabilitiesは証明しない。
共通UI欠陥は再現済みだが、ポールの当該リクエストと対応するVercelログはHobby保存期間制限で取得不可。個別障害をログで最終断定していない。
当日Supabaseのpath/status/role集計ではtipsの401が1件あったが、当該ファン/出演者との対応はないため原因としない。空roleをanonと断定しない。

## 実環境の分離と決済検証

TEST DB: **aeqskxxykzapgaudbeqa / haku-merch-validation / ACTIVE_HEALTHY**。
TESTのanon/service_role JWTのproject refを検証。Productionキーは取得/複製しない。
Stripe接続ツールはliveアカウントのみだったため、そのツールから決済を実行していない。CLIの専用設定に無料一時Sandboxを作成し、liveキーなし、テストキー形式、実Checkoutのlivemode=falseを確認してからテストカードを使用。
CLIの署名Webhookを127.0.0.1の検証サーバーへ転送。サーバーは本物のtip/webhook/confirm handlerと本物のアプリを使用し、実TEST Auth/DBへ接続。LiveKit等のメディアAPIは503で無効化。TESTの合成出演者はConnect未紐付けで、Transfer/Payout/返金は一切呼ばない。
4出演者は「PR112 QA HARIBOW / PAUL / Other-A / Other-B」というTEST専用の合成ユーザー。実本番出演者のID/口座をTESTへ複製していない。

### 成功した範囲

- **32/32**: 4出演者 × 匿名/ログイン済み × LIVE/プロフィール × iPhone縦/横。実アプリで金額100円選択→実Sandbox Checkout表示、TEST台帳の支援先・payer・金額、Stripe Sessionの支援先・金額・livemode=falseを照合。
- 実APIで10チェック: 同一requestIdは同じCheckout、同じIDで金額/出演者変更は409、不正最小額/小数/未知ID/偽造payerを拒否、台帳とStripe金額一致、偽造Webhook署名を拒否。
- 1件の実テストカード決済成功。真正Stripe署名が検証され、TEST tips.status=succeeded、fan_id=null、正しいHARIBOW合成出演者、100円を確認。
- 既存TEST台帳3件の内容digestは前後 **924761675c17c86d80b482256d6dd28f** で一致。テストデータ削除なし。試験終了後、自分で作成した合成出演者のis_liveだけをfalseに戻した。

### 未完了・公開禁止

未claimのSandboxキー(rkcs_test形式)では、精算に必要なStripe実手数料の読取が403。署名Webhookは台帳を成功にした後、既存精算処理で失敗し、対象3イベントはfailed。settlement_statusは未確定、送金債務は0件。
**Webhook全体のprocessed・実手数料/分配確定を成功扱いにしない。** 32ケースのうちカード提出まで進めたのは上記1件のみ。完全な32ケースの支払/精算E2Eは未完了。
所有者がSandboxをclaimし、必要な読取権限を持つTESTキーでログインするか、既存TEST認証の保管先指定が必要。精算を省略したり推定値で埋める修正は行っていない。
物理iPhone Safari、実LIVE映像/音声は未実施。WebKitのiPhoneエミュレーションと区別。

### 一時キーの取扱い

初回Sandbox作成CLI出力のマスキングが新形式rkcs_testキーを取りこぼした。秘密値はソース/PR/静的Previewに保存していない。専用ローカルファイルはmode 600。本番キーではないが、Sandbox claim時にこの一時キーを無効化/ローテートし、完全E2Eは新しいTEST認証で行う。claim URLやキーをこの文書に記載しない。

## tips TRUNCATE権限是正

対象migration: supabase/migrations/20261031092522_revoke_public_tip_truncate.sql。
PUBLIC/anon/authenticatedから**public.tipsのTRUNCATEだけ**をREVOKEし、継承権限が残れば例外で停止。service_roleのSELECT/INSERT/UPDATEを各々検査。RLS/policy/trigger/RPC/既存DML権限/台帳行は変更しない。default privilegesや他テーブルへ変更を広げない。
TESTでrollback試験後に適用、最終版を再適用して冪等性も確認。anon/authenticatedのTRUNCATE=false、service_role DMLは全てtrue。既存3件の内容hashとpolicy hash(b2d6028be91f4c859e777cdaa56b94db)一致。TRUNCATE自体は実行していない。
TESTの適用は直接SQLで行い、migration履歴のrepair/backfillはしていない。

本番用の正確な実行単位はproduction-proposed.sql（BEGIN/COMMITを含む）。**本番未適用。** SHA256はvalidation.json参照。対象本番refはpmmtijwswzwhuriqhlepで、実行前に対象・SHA・台帳digest・権限を再確認。5秒lock/30秒statement timeout。異常時はトランザクションを中止し、行の削除/修正やTRUNCATE再付与で復旧しない。既存アプリへ戻してもこの安全な権限除去は保持する。

## 自動検証とPreview

- TypeScript、本番相当build成功。既存chunkサイズ警告。
- 全体: 91ファイル516件成功。最終権限ガードの独立テストは4件（全体実行後に1ケース追加）。最終CIの結果はPRのcheckを参照。
- 旧fixture WebKit40チェック成功に加え、上記の本物のTEST DB/Sandbox接続32ケースを成功。
- 静的QA Preview: https://daidougei-haku-94jzg3rp8-daidougei-s-projects.vercel.app
  Vercel READY / target=null。配置先HTML HTTP200、CSPでconnect-src/frame-src/media-srcを拒否。API/Functions/cron/環境ファイル/秘密キーを含まない、合成データと模擬Checkoutのみ。実決済E2EのPreviewとは扱わない。
- branch専用の自動デプロイ抑止は維持。TEST service-role/Stripe秘密キーのVercel Preview保存は自動承認レビューに拒否され、明示承認待ち。別経路で迂回していない。Production設定/保護設定の変更なし。

## 再開・本番公開の承認単位

まずSandbox claim後の必要な権限を持つTEST認証を用意し、今回出力に含まれた一時キーをローテートする。接続先とlivemode=falseを再確認して、32ケース全ての支払→署名Webhook processed→実手数料/分配/出演者帰属と再送冪等性を完了する。TESTの既存3台帳に変更がないことも再確認。
機密キーを使うPreviewを作る場合は、**このPRブランチのPreviewだけ**へTEST Supabase service_roleと専用Stripe TESTキーをサーバー専用Secretとして保存する明示承認が必要（質問提示済み）。本番へ設定をコピーしない。

全ゲート通過後にのみ、次をそれぞれ個別承認として提示:
1. 正確なproduction-proposed.sqlの本番適用。
2. PR #112の最新SHA・CI・競合を再確認してmainマージ。
3. Vercel Productionデプロイ。Git連携でマージが自動公開を起こす場合は、マージ前に2と3の承認を揃える。

公開後の受入は匿名のLIVE/プロフィール→金額画面と既存処理の読み取り確認。実本番決済・送金・返金は行わない。現時点で本番公開候補と称さない。
