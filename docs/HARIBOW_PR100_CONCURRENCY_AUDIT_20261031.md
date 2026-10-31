# PR #100 追加監査：競合・誤終了・関数権限・migration

基点d0a8b3b。同じcodex/haribow-live-stage2-20261031ブランチ内の修正。TEST/本番へのmigration適用、mainマージ、本番デプロイ、実決済は未実行。

## 発見と修正

1. heartbeatはleaseとlive_sessionsへの別々のUPDATEで、後半失敗を無視していた。renew_direct_live_leaseにまとめ、performer→leaseの順にロックする。DB時計から単調増加の同じ時刻を両行へ保存。後半失敗なら前半もrollbackする。終了済み/別操作ならfalse、APIは409。is_liveやended_atを復活させる更新はない。
2. 90秒のブラウザheartbeat停止だけでLIVEを終了していた。正常SFU接続や再接続を誤終了し得るため撤廃。SQLのexpire_direct_live_leasesは未公開preparingだけを対象にする。
3. 配信中LIVEの終了はpresence.tsのSFU確認に限定。最初の不在確認から120秒以上、45秒以内の間隔で不在を確認し続けたときだけ終了する。接続確認はheartbeatを回復、不明/観測間隔の空白は不在猶予をリセットする。SFU障害を不在と扱わない。
4. SFU確認中に新しいheartbeatや終了が入った場合、取得した元のheartbeat（マイクロ秒精度）とDB値を比較して古い観測を破棄する。同じperformerロックの下で検証・更新するため、終了が先なら遅いrenewはfalseとなる。renewが先なら古い失効候補は無効。終了がrenewのコミット後に起きることまで防ぐ、という意味ではない。
5. reserve/activate/tokenもLIVEの古いheartbeatだけでは失効扱いにしない。preparingの期限は90秒のまま。異なる操作による配信中LIVEの横取りは拒否する。
6. TESTをSELECTで監査し、既存notify_followers_live_startがSECURITY DEFINER・PUBLIC経由でanon/authenticatedにEXECUTE可能だったことを確認。本人チェックは存在したが、今回のmigrationで通知関数を内部専用にし、search_pathも空に固定する。activation内からの呼び出しは維持。

## 権限

| 関数 | authenticated | anon/PUBLIC | service_role |
|---|---|---|---|
| reserve/activate/finish | 本人・承認等の関数内確認あり | 拒否 | 一般呼び出しを意図しない |
| close_direct_live_session | 拒否 | 拒否 | 許可 |
| renew_direct_live_lease | 拒否 | 拒否 | 許可 |
| observe_direct_live_host | 拒否 | 拒否 | 許可 |
| expire_direct_live_leases | 拒否 | 拒否 | 許可 |
| notify_followers_live_start | 拒否 | 拒否 | 拒否（関数ownerによるactivation内部実行のみ） |

関数ownerの暗黙権限は残る。ローカル実Postgresでhas_function_privilegeと実際の実行拒否を確認した。auth.uidはPostgRESTが検証したJWTから設定する前提。ローカル試験でのSET ROLE/JWT設定は、そのコンテキストを模擬するもので実Supabase認証の代用ではない。

## SQLの順序・再適用

適用対象は引き続き次の2本のみ。まだ適用しない。

1. supabase/migrations/20261031010000_direct_live_lifecycle.sql
2. supabase/migrations/20261031010100_direct_live_expiry_schedule.sql

- 同じmigration用advisory transaction lockで2本の同時適用を直列化する。
- migration 1はperformers/live_sessionsをACCESS EXCLUSIVEでロックしてから事前確認する。旧クライアントが確認とDDLの隙間に開始する競合を塞ぐ。短いメンテナンス時間と、配信/準備停止を要する。
- open LIVE・is_live・未終了の準備leaseがあれば中止。重複openがあっても削除・自動修復しない。
- migration 2を先に実行すると、拡張作成/ジョブ登録の前に中止する。
- cronの同名ジョブは同じDB ownerが再適用する。1件なら同じjob IDを更新し、他owner/複数件/停止中/想定外commandなら停止する。既存ジョブを自動削除・再有効化しない。row_security=offで、RLSにより他ownerのジョブが隠れたまま進まないようにする。
- pg_cronは(jobname,username)の一意性を使う。scheduler daemonやSupabase上の拡張有効化そのものは未検証。ローカルのcronテストはその公開仕様に合わせたカタログスタブであり、実cron成功とは扱わない。

## 重要な運用条件・残存リスク

**変更前の「pg_cronだけで配信中LIVEも90〜150秒で閉じる」という説明は無効。** SQLだけではLiveKitの接続状態を知れず、正常LIVEの保護と両立しないため。

配信中の自動終了には、SFUを確認する/api/livekit/presenceのwatchdogを20〜30秒程度で継続実行する運用が必要。今回、外部監視・有料サービス・デプロイ・DBのHTTP送信設定は追加していない。watchdogが呼ばれなければ配信中LIVEを時刻だけで強制終了しない。無人時の自動終了を保証できないため、本番GOは出さない。運営者の明示的な終了/管理者終了は引き続き原子的に実行できる設計。

実SFUの観測とDB transactionは一つの分散トランザクションではない。SFU観測直後に再接続する瞬間まで含む絶対的な誤終了ゼロは主張しない。確認済みの接続、不明状態、新しいheartbeat、短い再接続を誤って時刻だけで終了させないことをローカル競合試験で確認した。実LiveKit/iPhoneの通信断復帰は別途実機検証が必要。

## 検証方法

- tests/sql/direct-live-races.py: PostgreSQL 17.11を/tmpの新規クラスタ・専用Unix socket・TCP待受なしで起動。独立した実DB接続をrow lockで待たせ、両順序を再現。接続済みTEST/本番は使用しない。終了後はこの試験専用クラスタのみ破棄。
- 12ケース: renew/準備失効の両順序、renew/LIVE不在終了の両順序、終了/activate、activate/準備失効、正常接続・再接続猶予・不明・観測空白、権限、ミラー失敗rollback、LIVE中再適用拒否。
- PGlite: lifecycle/権限、cron順序・再適用・他owner/重複拒否。
- API単体: false renewal→409、SFU障害で終了要求しない、CASの元時刻を保持、遅い正常heartbeat/tokenを拒否しない。

公式資料: https://www.postgresql.org/docs/17/explicit-locking.html / https://github.com/citusdata/pg_cron/blob/main/pg_cron--1.2--1.3.sql

## 最終結果

修正本体: `bb1327e`。ローカル実PostgreSQLの競合・権限・rollback試験12ケース成功。全Vitest **80ファイル・478件成功**（15秒上限、126.28秒）。アプリとLIVEサーバーのTypeScript成功。本番相当build成功（12.03秒、既存のchunk警告のみ）。金融コード・本番/TESTデータに変更なし。

pg_cronの順序・重複・再適用・停止中ジョブ保護はカタログスタブによるSQL試験成功であり、実pg_cron daemonの成功ではない。実SFU/iPhoneとwatchdog運用は未検証のためNO-GOを維持する。

適用対象SQLのSHA-256（旧d0a8b3bのSQLを適用しないこと）:

- `20261031010000_direct_live_lifecycle.sql`: `f19b110d2537cba130c2025672e69a7ec1ffb4c764a55ddcdb0a9ca73e1d03b1`
- `20261031010100_direct_live_expiry_schedule.sql`: `d947fbf337b23faf0f21a8ff8e8f98365996b26ebda51422237e1ae888076697`
