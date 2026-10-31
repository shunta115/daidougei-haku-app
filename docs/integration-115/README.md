# Issue #115 統合実装・公開判定

2026-11-01 JST。統合基点: main / Production `4403bd7f1274678dc39235e58bb59835f4dd4a6c`。
独立checkout: `/private/tmp/haku-115-unified`、branch: `codex/haku-115-unified-integration`。
Desktopの未コミット作業・元PRブランチは変更しない。

**本番公開判定: NO-GO。コード統合と実TESTの主要結合試験は実施したが、接続済みサービスの全機能受入と実機試験は未完了。**
この文書を個別PR内の過去の停止条件・古いTESTスキーマ記録より優先する。今回の指示は隔離TEST検証を許可しており、TEST変更に一律の再承認を要求するものではない。ただし既存TESTとの差分は検査し、既存データを削除しない。

## 回収範囲と採用

GitHub Issue #115、取得できたPR #38〜114の70件、ローカルmain、関連コミット・migration・既存検証記録を監査。`source-pr-audit.json` に取得時点の根拠を保存。全会話履歴の網羅的読取は未実施であり、GitHubに残っていない10/31の指示を全件回収できたとは主張しない。

| 機能 | main/Productionの状況 | 統合した実装 | 残る分類・公開阻害 |
|---|---|---|---|
| LIVE開始/終了・heartbeat | 旧開始/終了方式 | #100 原子的reserve/activate/finish、session room、SFU観測・CAS・再接続 | 本番DB変更が必要。TESTの実JWT開始終了は検証済み。継続watchdog未起動、実SFU・画面ロック・実機待ち |
| 縦横/全画面/音声/小窓 | #110 PCシアター等は本番済み | #99 小窓と同一media保持、設定/診断、#106共有/全画面を手動統合。横画面を映像/コメント別列に統一 | WebKit fixture検証、実音声/別端末待ち |
| いいね/FEVER/THANK YOU/コメント | FEVERとgift等の基礎は既存 | #106 JWT集計・12/秒・batch冪等・Realtime/poll。送信中batchをタブ内sessionStorageへ保存し再読込再送。コメントの応答不明時は同一UUIDで再試行 | 本番likes SQLが必要。TESTの実JWT/Realtimeと実画面の配信者受信・FEVERは検証済み。ブラウザ終了で未送信タップ消失の可能性は残る |
| 匿名応援/Stripe | 既存決済・分配を保持 | #112を採用（#107を含む）。宛先復元・ロック・古い応答の破棄・タップ透過 | TEST既存32ケースは元PR証跡。統合版Sandbox実精算は未検証・権限ある隔離認証待ち。本番tips TRUNCATE是正必要 |
| ホーム・LIVE予約・活動順 | 旧ホーム。予約DBは本番に存在 | #114のみ採用（#105/#113を含む）。本人操作/公開予定由来の順位。出演予定→活動順→登録30日以内の新着→全員を見る導線を明示 | TESTに不足schema/権限を追加。実JWT予約/通知・実順位APIは通過。全ホーム導線の実機受入待ち |
| MAP・出演予定 | #104/#109/#110/#111/#101/#102はmain統合済み | mainを継承。予定・実LIVE・位置なしを分離、座標を捏造しない | 統合版WebKit回帰。実GPS・地図接続・実機待ち |
| YouTube公開 | URL CHECKの過剰escapeを本番read-onlyで再確認 | #108 本人専用保存・エラー・forward SQL、#100プレーヤー復旧と#110枠を両立 | 本番SQL未適用。実YouTube再生/終了検証待ち。HAKU公開操作はYouTube配信開始ではない |
| 公式ページ | 既存プロフィール | #103 写真20枚/動画/PDF/公開予定/SNS/事務局案件/Storage。HOME_ENABLED既定OFF | 本番専用SQL/office/retention運用が必要。TEST実Auth/Storage/API/事務局案件は検証済み。物理iPhone待ち |
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

## 監査開始時のDB環境差（read-only確認）

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

#88既存実測はlocalhost・RTMP入力・500疑似HTTP clients・10秒、約597Mbps・p95 332ms。その後、統合コード39480beのCIでも実SRS HLSを1/10/50/100/500疑似HTTPクライアントで各10秒再測定し、全段階の初回受信・エラー0を確認。500段階は594.59Mbps、p95 582ms。新たな500実端末/外部回線の検証とは扱わない。`evidence/srs-500-ci.json`参照。計画値: 500×(800+48)kbps×1.15 = 487.6Mbps、219.42GB/時。既存無料帯域の残量/契約が未確定のため費用0円は保証不能。有料契約・Egress・従量課金の有効化はしない。

## 公開前の個別承認とロールバック

本番DB、main merge、Production deploy、本番設定/環境変数変更、実決済・送金・返金、データ削除、有料契約は未実施。公開の承認要求は接続済みTEST・実機受入を終えた具体的SHA/SQL単位で出す。

- アプリ変更だけ先行公開しない。lifecycle未適用時は新開始が安全側に停止する。
- release直前にDBバックアップ/復元確認、open session=0、旧クライアント更新と新旧混在の影響を確認。
- ロールバックはまず新開始/追加featureを停止。配信終了を確認後、承認を得て既知の正常deploymentへ戻す。
- lifecycle guard/通知権限/cronは旧アプリ互換に影響する。`HARIBOW_STAGE2_RELEASE_AND_ROLLBACK.md`の単位で別途承認。表や台帳をDROP/DELETEして戻さない。
- 公式home/LIVE Pushはflags OFF。追加media/問い合わせ/queueは保全。Stripe台帳・AWP・既存performerデータを変更/削除して戻さない。

## 検証結果

最新の件数・SHA・Preview・失敗/未検証は `validation.json` と統合Draft PRに記録する。個別PRの過去の成功を統合版の成功に読み替えない。Previewが静的QAの場合、実Auth/DB/LiveKit/Stripe接続の成功とは扱わない。


## 今回の接続済みTEST整備・結合結果

本番ではなく `aeqskxxykzapgaudbeqa` だけに、durable likes、official home、予約前提navigator判定、既存予約migration、product_events、不足するサーバー専用公開予定読取grantを適用。SQLは本体migrationと`supabase/test/`に保存。既存プロフィール/台帳や他人への一般ユーザー編集権限は広げていない。

- 実TEST PostgreSQLのSQL role/claims試験14項目通過。全fixtureはROLLBACK。
- 新規TESTユーザー3人で実Auth JWT/PostgREST/Realtime14項目通過。配信者本人が2視聴者の合計8いいねとコメント1件を実Realtime受信。重複UUID、他人の終了拒否、予約分離、2人への通知、終了後のいいね拒否を確認。
- 実際のReact配信者/視聴者画面3つを実Auth/DB/Realtimeに接続したWebKit試験5項目通過。2人からの合計4いいね→配信者の累計/FEVER、コメント→配信者と他視聴者、runtime error 0。LiveKit statusだけは明示的に未構成とし、実映像/音声成功とは扱わない。
- ローカルの実公式API→実TEST Auth/DB/Storageで10項目通過。本人保存、他人編集拒否、匿名upload拒否、写真/thumbnail/PDF保存、非公開PDF拒否、公開・実バイト一致を確認。
- 事務局API/ホーム順位API6項目通過。匿名依頼→新規TEST事務局の案件受取→確認中へ変更、ファン/出演者の案件参照拒否、通常管理者の消去拒否、Auth履歴を漏らさない実順位API。
- 一時TEST事務局は既存管理者とは別に新規作成し、終了後にmemberをdisabled、profileをfan/suspendedへ戻した。管理権限は残さない。Authユーザー/試験用問い合わせ/Storageファイル/履歴は削除せず保全。
- 既存14 profiles/9 performers/41 tips/6 live_sessionsの件数・全行hashは試験前と一致（新規fixtureを除外）。試験LIVEのis_live/open session/open leaseは0を確認。最終証跡参照。

実API試験で、Auth履歴取得の一件失敗がホーム全体を503にする問題を追加修正。取得不能なログイン履歴は使わず、確認済み操作履歴・公開予定・プロフィール情報を維持する。架空の活動日時を生成しない。DB/公開候補取得の障害は引き続き503で隠さない。

optional Push SQLをlifecycle後に適用すると、通知helperのauthenticated EXECUTEが再び開く競合も修正。原子的lifecycleが存在する場合はブラウザ/直接service-role実行を閉じ、activateからの内部呼出を維持。順序の回帰テストを追加。TEST/本番のPush有効化・送信はしていない。

## 検証境界と未完了（公開NO-GO）

1. 実LiveKitの端末間映像/音声、Safariの画面ロック・バックグラウンド・復帰・長時間、実カメラ品質/音質は未検証。HARIBOWモザイクの根本原因は未確定。watchdogはスクリプトのみで運用未起動。
2. 現Stripe接続で列挙されたアカウントはlivemode=trueだけ。実決済操作なし。統合版のclaim済みSandbox Checkout→真正Webhook→実手数料→台帳/分配の完走は未検証。#112の過去32ケースは参考証跡で、統合版の成功には数えない。必要なTEST接続を用意し、以前の一時キー露出・未claim手数料403も解消してから再検証する。
3. CROWDの共有永続認可/セッション原子管理、一般視聴者認可、公開HTTPS/ICE/メディア経路、既存HAKUの公開LIVE一覧への安全な接続は未完成。実験を有効化して完成扱いにしない。
4. 物理iPhone/LINE実受渡し、実YouTube視聴と終了検知、500実端末/外部回線/長時間の受入は未検証。公式ページの実機受入・本番office/retention運用も必要。
5. 本番migration・main merge・Production deployは個別承認前で未実施。これらの承認だけで上の未完成・未検証を免除しない。

Preview: https://daidougei-haku-314h4sxoa-daidougei-s-projects.vercel.app/ （READY / target=null / Vercel認証あり）
UI source: 39480be。架空データ・模擬通信の静的QAだけを配置。実TESTの認証・Storage・Realtimeの試験はlocalhostで別途実施し、この公開Previewとは分離。API/Functions/cron/環境ファイル/秘密キーなし、CSPで外部接続・media・frame・formを拒否。
