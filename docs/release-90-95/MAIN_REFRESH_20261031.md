# PR #101: main e2a7078 取り込み後の公開準備

2026-10-31。前回HEAD `6c5eadd` に最新main `e2a7078365000ddc6132d44c3982343647a214bf` をmerge。mainへのmergeではない。履歴を改変せずPR #101側にmainを取り込む。

## 完了した残作業

- PR #102の共通QR処理・共有helper・共有コンポーネントをそのまま採用。予定一覧の古いinline共有処理・不要CSSを除去。プロフィールはmainのQR/共有処理を保ち、予定の定期/復帰更新だけを追加。
- MAPの既存LIVE取得にも共通の可視時20秒poll・focus/online/visibility復帰更新を適用。出演予定の同等更新・中止/延期除外は保全。
- 統合E2EでQRカードが閉じるボタンを覆う問題を発見し、モーダル内上部余白とヘッダー重なり順だけを修正。閉じる操作もタップ相当E2Eへ追加。
- TypeScript、全83ファイル476テスト、Production build、WebKit/iPhone13相当E2Eの統合28項目＋QR共有18項目が通過。buildの既存chunkサイズ警告は残る。
- api/、server/、shared/、決済・送金・LIVE開始終了処理にmainとの差分なし。フロントのDBアクセス変更は出演予定の取得条件/座標/複数日保存/通知失敗分離のみ。

## 本番DBとTEST DB: READ ONLY再監査

| 対象 | 本番 pmmtijwswzwhuriqhlep | TEST aeqskxxykzapgaudbeqa |
| --- | --- | --- |
| 前提の出演予定・通知テーブル | あり | あり |
| venue_lat / venue_lng | なし | あり、座標CHECKあり |
| day_of制約 / 本人限定RPC | なし | あり、anon実行拒否 |
| notifications直接INSERT | anon/authenticatedにテーブル権限あり。INSERTポリシーはログイン済み全員を許可し得る | anon/authenticated拒否、service_role維持 |
| 既存件数 auth / profiles / performers / LIVE / 予定 | 67 / 67 / 24 / 78 / 8 | 8 / 8 / 5 / 6 / 1 |

本番の通知INSERTポリシーは他人宛て偽造を許し得るため、権限修正は省略しない。本番で偽造INSERTは実行していない。既存LIVE RPCはSECURITY DEFINERかつauth.uidとperformer IDの一致を検査しており、その関数・実行権限は変更しない。Stripeの通知は既存serverのservice_role経路を保つ。

TESTの3 migration履歴はSQL本文MD5がローカルファイルと一致。既存前提migrationの本番履歴とrepoとの差は末尾の余分なセミコロンのみで機能差なし。前提migrationを本番へ再適用しない。

TEST実DBで `test-verify.sql` を再実行し、直接通知INSERT拒否、本人限定/冪等の当日通知、非公開RLS、JST、時間変更・延期・中止、既存内部LIVE通知を確認。fixtureは全てROLLBACK。前後でauth/profiles/performers/LIVE/予定/通知の行集合ハッシュが一致。既存の予定1件も保持。新規migrationの適用は不要だった。

## 本番へ必要なSQL（未適用、個別承認待ち）

対象は **pmmtijwswzwhuriqhlep**。次の順で3件だけ。`production-proposed.sql` はこの3件の単一トランザクション審査資料。TEST専用のtest-apply.sqlは本番で実行しない。適用時は対象DB・既存schema・バックアップを直前再確認し、migration履歴も記録する。

| 順 | ファイル | SHA256 |
| --- | --- | --- |
| 1 | 20261029085105_add_appearance_map_coordinates.sql | 24600389e6590c1747681620e6dbd31f409a4419899ba771300de1285cab145a |
| 2 | 20261029090008_add_day_of_appearance_reminders.sql | 2bd095ebea7a3ddf4d88d25971a823cddcd6ea8ad78e6d88baeabedd66f21509 |
| 3 | 20261030182434_harden_notification_client_inserts.sql | d5fe94aa90514bab119bb116a0b03036caaffe95440a16a20234cd74de6e99fb |

審査用bundle SHA256: `2e12bea6214f444f10bc74d868a538f646ffe9a794a8a5e00ab37f9f7ce27745`。
変更対象: optional座標2列・座標CHECK/公開MAP index、day_ofイベント制約・本人限定RPC、通知INSERT policy削除とanon/authenticatedのINSERT剥奪（service_role維持）。既存行のUPDATE/DELETEなし。DDL lockは最大5秒待機、SQLは60秒制限。権限変更が既存writerに影響しないことをTESTとソースで確認済みだが、本番負荷下のlock待ちは残存リスク。

ロールバック: transaction失敗は全体rollback。公開後はまずアプリを現main版へ戻す。既存行・座標列・通知イベントは削除しない。偽造対策は維持し、day_ofデータがある状態で古いCHECKへ戻さない。RPC停止が必要なら別承認で実行権限だけを停止する。

## 残る受入と公開判断

- 通常TESTログイン→登録→一覧→MAP→共有先のブラウザ実接続E2Eは未完了。既存TESTにはパスワード設定済み5ユーザー・確認済みメール7ユーザー・既存15セッションがあるが、秘密やrefresh tokenを抽出して代用しない。認証緩和、既存パスワード変更、管理者の成り代わり、新規アカウント発行を行っていない。既存の安全な保管場所/ログイン済み画面の提供待ち。実DBロール試験とoffline UI E2Eはこの正常ログイン試験の代わりにはならない。
- Previewの既存branch設定はTEST URL、server権限はpublic anon相当、Stripe/LiveKit/送金無効を維持。設定の書き換えなし。Google Mapsキーがないため、実SDKの地図表示・位置精度・復帰時描画は未確認。Production用キーの複製や新たな有料API呼出しは行わない。
- 物理iPhoneのGPS許可/拒否、バックグラウンド復帰、QR保存/印刷/SNSアプリ受渡しは未確認。WebKitのAPI/地図/OS処理はadapterであり、実機合格とは扱わない。
- 当日通知は「通知画面を開く/表示中pollで生成するHAKU内通知」。未起動端末への定刻Push・LINE通知は今回の範囲外。
- バックアップの隔離物理復元は今回も未実施。以前のバックアップ一覧確認やローカル論理dump案を復元成功と扱わない。追加有料サービスは契約しない。
- advisorの既存指摘は一括変更しない。当日RPCのauthenticated SECURITY DEFINER警告については、本人IDをauth.uidから決定、anon/PUBLIC実行不可、固定search_path、実DB拒否試験で検証。既存の他SECURITY DEFINERや認証設定の警告は別途監査対象。

登録改善・一覧反映・MAP/近隣・当日アプリ内通知は自動/実DBロール検証済みの公開候補だが、実接続受入と本番DB承認までは公開保留。公開済みQR/共有を再リリースする必要はない。

最短手順: TESTの通常ログイン・実地図・実機の受入 → 本番SQL3件の個別承認/適用/検証 → mainマージと本番デプロイの個別承認（自動公開連携を考慮して両方を先に確定）→ #101だけ公開 → 匿名の予定/MAP/共有先・既存LIVE画面を再確認。実決済はしない。

本番DB変更・mainマージ・本番デプロイ・既存データ削除・実決済・送金・返金・LiveKit Egress・新規有料契約は未実施。
