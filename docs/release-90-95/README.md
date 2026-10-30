# PR #90–#95 統合・公開判定

対象: shunta115/daidougei-haku-app。基点 main `398d05b9c51ed84ed0b1a3bb1c7beae62a52f616`。
統合ブランチ: `codex/release-integration-90-95`。本番DB変更・mainマージ・本番デプロイは未実施。

## 依存監査

| PR | head SHA | 依存 |
|---|---|---|
| #90 MAP予定連動 | d0df471ef6c9a733fc3a27030e29c5c1fc79843a | 共通schedule-refresh。main #89との差分として適用 |
| #91 当日通知 | 01d3559407e3f0f7b2fd990fa347911ff1be66dc | 既存出演予定・通知migration |
| #92 近隣検索 | ec69c78143f66924652c325488edb4254a641484 | #90 |
| #93 QR印刷 | 8fd4794bf9bdff850625fef435a633dca23d37a9 | 共通schedule-refresh |
| #94 登録・複製・複数日 | f57685707c3261d64bf7e6467f746378ecfc405d | #90 |
| #95 SNS共有 | 96ede88807872692b02c39041e1ed5895002fd48 | #92（#90を含む） |

各PRのbase-relative patchを依存順に適用。mainとの差分・共通祖先を照合し、共通改修の重複取り込みを回避。6本のpatchに適用競合なし。PR自体のmergeは行っていない。#96–#100のコード・migrationは取り込んでいない。TESTには別作業で既にDIRECT LIVE関連migrationが存在していたため、既存関数・データを保全対象とした。

## 統合時の修正

- MAP・予定一覧・公開プロフィールを20秒ごと、およびfocus/online/visibility復帰時に再取得。MAPの時刻表示も更新。
- 中止・延期は公開済みの場合だけ予定一覧にラベル付きで残し、MAPから除外。非公開は双方から除外。共有先プロフィールも最新状態を再取得。
- 開始を含み終了を含まない時刻判定。無効な日時・座標をMAPから除外。終了未登録を実演中と断定しない。
- DB座標CHECKの片側NULL抜けを修正。#90 migrationをトランザクション化。
- 当日通知RPCが未適用・失敗しても既存通知を読めるよう分離。
- ブラウザによる通知INSERTを拒否。システムのSECURITY DEFINER経路とservice_role INSERTを維持。
- 通知配信失敗で、既に保存済みの予定を「保存失敗」と扱って再登録させない。
- 複数日入力の不正日付を黙って無視せず、送信前に拒否。Safari clipboard拒否時のコピーfallback、印刷画像load待ちを修正。

## TEST DB

対象は **aeqskxxykzapgaudbeqa** のみ。初期状態では出演予定・通知設定・通知イベントの3テーブルがなく、対応履歴もなかった。

適用順・SHA256は `manifest.json` と `migrations.sha256` に固定。

1. `20261014065602_performer_appearances_and_notifications_20261014.sql`（不足前提）
2. `20261029085105_add_appearance_map_coordinates.sql`（修正版 #90）
3. `20261029090008_add_day_of_appearance_reminders.sql`（#91）
4. `20261030182434_harden_notification_client_inserts.sql`（通知偽造対策）

接続ツールの確認期限切れにより、公式CLI `supabase db query --linked --project-ref aeqskxxykzapgaudbeqa --file ...` を使用。`test-apply.sql` は単一トランザクション内でSQLとmigration履歴を記録し、既存プロフィール・出演者・LIVEセッション・auth.users・適用前から存在するLIVE関数の保全を検査。最初の保全チェックは新設deliveries関数までLIVEとして比較してロールバックしたため、比較対象を既存関数OIDに固定し再適用。成功後に履歴も再読込して照合済み。

`test-verify.sql` は実DBのauthenticated/anonロールを使い、他人宛て・本人宛て通知INSERT拒否、当日通知の本人限定・重複防止、非公開RLS、JST時刻、片側座標拒否、時間変更・延期・中止の通知、既存内部LIVE通知のINSERT経路を検証。全fixtureをROLLBACK。内部LIVE通知関数はこのTESTでは元からauthenticatedにEXECUTEがないため、権限を変更せず既存owner実行経路を検証した。

検証後: 出演予定0・通知イベント0・通知0。既存8認証ユーザー、8プロフィール、5出演者、6LIVEセッションは保持。

| 保全対象 | 適用前後で一致したMD5（行集合、内容は非公開） |
|---|---|
| profiles | cf24c17cd494827641e85af740057a98 |
| performers | 511543b9c7cd37f1ac03def33db3502d |
| live_sessions | 5c797129dabac4c0fadcc2d82513ccd1 |
| auth.users | 5ad47791367400d480d6d5ff177a12d9 |

通知INSERT: authenticated=false、service_role=true。当日RPC: anon=false、authenticated=true。

PreviewはREADY。iPhone相当WebKitで匿名の`/event`・`/map`のHTML/アセット200と画面描画、TEST RESTへのGETを確認。Google Maps APIキーは既存Production専用でPreviewにないため、実地図は未設定表示。課金を避けてキーの複製・新規作成は行っていない。ログインしたTESTアカウントで登録からMAPまでの実接続確認は未完了。

TEST advisorには既存のsearch_path・公開SECURITY DEFINER等の指摘あり。今回対象外の認証・LIVE・管理関数を一括変更していない。

## 検証と限界

検証結果の最終値は `validation.json`、機能別判定は `feature-status.md` を参照。TypeScript・Production build通過、全81ファイル465テスト通過、WebKitの22項目通過。

- TypeScriptとProduction buildを実施。buildには既存の大きなchunk警告あり。
- 全Vitestを実施。初回はブラウザ準備・他の検証との競合でPGlite起動がタイムアウトしたため、負荷を取り除いて全体再実行。
- `npm run test:safari` はiPhone 13相当のWebKitで実React画面を操作する再実行用E2E。APIとGoogle Mapsはoffline adapterであり、TEST接続の一気通貫試験や物理iPhone試験とは区別する。Google Mapsへの有料リクエスト、決済、LIVE配信は行わない。
- QR印刷のOS印刷画面、iPhoneの保存先・LINE/Xアプリ・共有シートの実OS動作は実機確認が必要。
- #91は通知画面を開いた際のHAKU内当日通知。未起動端末への定時PushやLINE通知は提供しない。

## 最短の安全な公開順

1. 統合PRのPreviewでTESTアカウントを使い、「登録→一覧→MAP→共有先」の実接続確認。物理iPhone SafariでQR保存・印刷・共有を確認。
2. 急ぐ場合はDB変更不要のQR・共有導線を独立した小さなリリース候補に分離。統合ブランチ全体をDB未適用の本番に出さない。
3. 本番DBのバックアップ取得時刻・保管先・復元手順を確認し、TEST等への復元実証を記録。**本番バックアップ一覧を読み取り、COMPLETEDの物理バックアップ8件、最新2026-10-31 02:27 JSTを確認。PITRは無効。復元操作・復元実証は未実施。**
4. 本番DB個別承認後、既存スキーマを再照合して#90・#91・通知権限修正だけを適用。`production-proposed.sql` は未実行の審査資料。TEST用の前提migrationを本番へ再適用しない。
5. mainマージの個別承認を受けて、レビュー済み統合PRだけをmerge。mainへのpushは自動本番公開につながるため、本番デプロイ承認も取得し、Git連携の公開動作を確認してから実行。
6. 本番デプロイの個別承認後に公開。未ログインの一覧・MAP・共有リンクを確認し、実決済をせず既存LIVE・投げ銭画面の回帰確認。

ロールバックはアプリを直前の承認済み版へ戻す方式を優先。座標列・予定・通知・day_ofイベントは削除しない。通知INSERT対策は維持。day_ofを含むデータがある状態で旧CHECK制約へ戻さない。必要時は当日RPCの呼出権限停止を別承認で行い、バックアップ復元は最終手段とする。
