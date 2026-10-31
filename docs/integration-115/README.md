# Issue #115 統合実装・公開判定

2026-11-01 JST。統合基点: main / Production `4403bd7f1274678dc39235e58bb59835f4dd4a6c`。
独立checkout: `/private/tmp/haku-115-unified`、branch: `codex/haku-115-unified-integration`。
Desktopの未コミット作業・元PRブランチは変更しない。

**本番公開判定: NO-GO。コード統合は実施したが、接続済みサービスの全機能受入と実機試験は未完了。**
この文書を個別PR内の過去の停止条件・古いTESTスキーマ記録より優先する。今回の指示は隔離TEST検証を許可しており、TEST変更に一律の再承認を要求するものではない。ただし既存TESTとの差分は検査し、既存データを削除しない。

## 回収範囲と採用

GitHub Issue #115、取得できたPR #38〜114の70件、ローカルmain、関連コミット・migration・既存検証記録を監査。`source-pr-audit.json` に取得時点の根拠を保存。全会話履歴の網羅的読取は未実施であり、GitHubに残っていない10/31の指示を全件回収できたとは主張しない。

| 機能 | main/Productionの状況 | 統合した実装 | 残る分類・公開阻害 |
|---|---|---|---|
| LIVE開始/終了・heartbeat | 旧開始/終了方式 | #100 原子的reserve/activate/finish、session room、SFU観測・CAS・再接続 | 要DB変更、継続watchdog未起動、実SFU・画面ロック・実機待ち |
| 縦横/全画面/音声/小窓 | #110 PCシアター等は本番済み | #99 小窓と同一media保持、設定/診断、#106共有/全画面を手動統合。横画面を映像/コメント別列に統一 | WebKit fixture検証、実音声/別端末待ち |
| いいね/FEVER/THANK YOU/コメント | FEVERとgift等の基礎は既存 | #106 JWT集計・12/秒・batch冪等・Realtime/poll。送信中batchをタブ内sessionStorageへ保存し再読込再送。コメントの応答不明時は同一UUIDで再試行 | 要likes SQL。実JWT/Realtime受入待ち。ブラウザ終了で未送信タップ消失の可能性は残る |
| 匿名応援/Stripe | 既存決済・分配を保持 | #112を採用（#107を含む）。宛先復元・ロック・古い応答の破棄・タップ透過 | TEST既存32ケースは元PR証跡。統合版Sandbox実精算は未検証・権限ある隔離認証待ち。本番tips TRUNCATE是正必要 |
| ホーム・LIVE予約・活動順 | 旧ホーム。予約DBは本番に存在 | #114のみ採用（#105/#113を含む）。本人操作/公開予定由来の順位 | TESTに予約DBなし。実Auth→予約/通知/順位受入待ち |
| MAP・出演予定 | #104/#109/#110/#111/#101/#102はmain統合済み | mainを継承。予定・実LIVE・位置なしを分離、座標を捏造しない | 統合版WebKit回帰。実GPS・地図接続・実機待ち |
| YouTube公開 | URL CHECKの過剰escapeを本番read-onlyで再確認 | #108 本人専用保存・エラー・forward SQL、#100プレーヤー復旧と#110枠を両立 | 本番SQL未適用。実YouTube再生/終了検証待ち。HAKU公開操作はYouTube配信開始ではない |
| 公式ページ | 既存プロフィール | #103 写真20枚/動画/PDF/公開予定/SNS/事務局案件/Storage。HOME_ENABLED既定OFF | 要専用SQL/Storage/Auth/office/retention受入。実ホストでの権限試験待ち |
| QR代理/CROWD | HAKU公開導線には未提供 | #98（#96/#97/#88成果）を同一ブランチに回収、認可/一回grant/交代/停止/HLS署名。実験は本番配信へ接続しない | 未実装: 永続共有の原子状態、一般視聴者認可、公開HTTPS/ICE経路、既存HAKUへのセッション接続。500実端末未測定 |
| 通知/フォロー/音声画質 | 既存通知/当日出演通知/フォローを維持 | #99 opt-in LIVE PushをOFFのまま回収、#114活動順位と予約、#106復帰 | LIVE Push SQL/同意/実通知、実音声・品質計測待ち |

採用元: #100 `26253545`、#99 `1c6ea661`、#106 `6cb894e0`、#112 `b6e96108`、#108 `b272bffc`、#114 `2a3d7d81`、#103 `50476470`、#98 `19ff9977`。
#105/#113、#107、#90〜95を追加で重複mergeしていない。#87はP2P/D1別試作であり#98に依存しない部分を無条件に本番へ混在させない。#71 OAuth/同時配信、#75 TikTokは10/31要求との必須依存を確認できず、自動採用しない。

## 手動で解決した主な競合と追加修正

- `startLive` の旧performers更新/セッションinsertを復活させず、原子activate成功後にのみ任意Pushをdispatch。
- #100再接続/音声解除と#99同一media小窓を維持し、#106のsession別コメント/反応/古い共有URL保護を統合。
- viewer全画面はvideoだけでなく操作・コメントを含む画面全体。横画面overlay競合は別列へ統一。
- YouTubeはReact管理mountの子iframeだけをSDKが所有。mainのPC表示枠を維持。
- `vercel.json`の重複gitキーを解消し、統合ブランチの自動Previewを抑止。既存cron/rewrites/official home function設定を保持。
- watchdog GETにCRON_SECRET認証を追加。状態確認`mode=status`のみ公開read-only。認証なしで有料SFU照会やDB更新を起動させない。
- 同一コメントの応答消失後再試行は同じUUIDを使用。23505時はRLS下で本人/対象/本文/セッションを照合し、既存内容を上書きしない。
- いいねの未送信batchをタブ内保存。別ユーザー/別セッションへ再送せず、6時間で破棄。永続タップ受付やブラウザ終了後の配達保証はしない。

## DB環境差（今回read-only確認）

Production `pmmtijwswzwhuriqhlep`: live_schedules/live_reservations/product_eventsあり、direct_live_leasesなし。tips RLS有効だがanon TRUNCATE=true。YouTube CHECKに過剰escapeあり。
隔離TEST `aeqskxxykzapgaudbeqa`: direct_live_leasesあり、live_schedules/live_reservations/product_eventsなし。tips RLS有効、anon TRUNCATE=false。過去のTEST migration番号と今回のlifecycle migrationは異なるため、存在だけで適用済みと見なさない。

`db-readonly-evidence.json`はカタログの照会結果のみ。Auth情報・メール・決済明細・キーを保存しない。

## SQL単位・適用順

一括 `db push` 禁止。各ファイルをhash固定し、現行schema/関数/権限/既存open sessionを照合して個別実行する。

1. #100 `20261031010000_direct_live_lifecycle.sql` → `20261031010100_direct_live_expiry_schedule.sql`。全LIVE停止・重複openなし・既存lease差分確認。SQL cronは準備中だけ。配信中終了は継続SFU watchdogが別途必要。
2. #106 `20261031030528_durable_live_likes.sql`。JWT/RLS・session別複数actor試験後にUIと同時公開。
3. #108 `20261031042340_fix_youtube_live_url_constraint.sql`。既存データと本人保存制限を検査。
4. #112 `20261031092522_revoke_public_tip_truncate.sql`。台帳内容・DML/RLS維持の照合。
5. #103 `20261030213928_performer_official_home.sql`。新private schema等の衝突時は停止。Storage/officeの専用準備・retention運用後にHOME_ENABLEDを有効化。
6. 任意LIVE Push `20261030105928_live_start_web_push_queue.sql`。feature flagsはOFFを維持し、実同意/送信/停止検証を別判定。
7. TESTだけに不足する予約/計測基礎schemaは、既存 `20261018092439_live_reservations_and_viewer_analytics.sql` 等の定義を個別照合。本番適用済み相当を再適用しない。

## HARIBOW画質と500人

過去のHARIBOW配信を再現測定していないため原因確定はできない。#99の診断は原カメラ→Canvas送信入力→実エンコード層→表示を分離し、送信bytes差分からbitrate、fps、CPU/bandwidth limitationを表示する。UI blurは除去したが、それだけでエンコードのモザイク修復とは扱わない。

受入: 同じ照明/動き/端末でWi-Fiと携帯回線を比較し、原カメラ・Canvas・送信実解像度/fps/bitrate・受信解像度を同時記録。原映像から悪いなら撮影、Canvasだけなら加工負荷、エンコードで低下しbandwidthなら回線/適応、CPUなら端末、受信だけなら下り/選択層を切り分ける。ビットレート固定増加は低速回線の破綻と費用増になるため未実施。

#88既存実測はlocalhost・RTMP入力・500疑似HTTP clients・10秒、約597Mbps・p95 332ms。今回は新たな500人実測を達成したとは扱わない。計画値: 500×(800+48)kbps×1.15 = 487.6Mbps、219.42GB/時。既存無料帯域の残量/契約が未確定のため費用0円は保証不能。有料契約・Egress・従量課金の有効化はしない。

## 公開前の個別承認とロールバック

本番DB、main merge、Production deploy、本番設定/環境変数変更、実決済・送金・返金、データ削除、有料契約は未実施。公開の承認要求は接続済みTEST・実機受入を終えた具体的SHA/SQL単位で出す。

- アプリ変更だけ先行公開しない。lifecycle未適用時は新開始が安全側に停止する。
- release直前にDBバックアップ/復元確認、open session=0、旧クライアント更新と新旧混在の影響を確認。
- ロールバックはまず新開始/追加featureを停止。配信終了を確認後、承認を得て既知の正常deploymentへ戻す。
- lifecycle guard/通知権限/cronは旧アプリ互換に影響する。`HARIBOW_STAGE2_RELEASE_AND_ROLLBACK.md`の単位で別途承認。表や台帳をDROP/DELETEして戻さない。
- 公式home/LIVE Pushはflags OFF。追加media/問い合わせ/queueは保全。Stripe台帳・AWP・既存performerデータを変更/削除して戻さない。

## 検証結果

最新の件数・SHA・Preview・失敗/未検証は `validation.json` と統合Draft PRに記録する。個別PRの過去の成功を統合版の成功に読み替えない。Previewが静的QAの場合、実Auth/DB/LiveKit/Stripe接続の成功とは扱わない。
