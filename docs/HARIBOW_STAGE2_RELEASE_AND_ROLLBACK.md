# HARIBOW 第2段階の反映・ロールバック手順（未実行）

> 追加監査でheartbeat/失効・権限・cronの仕様を修正しました。適用前に `docs/HARIBOW_PR100_CONCURRENCY_AUDIT_20261031.md` を参照してください。配信中LIVEの自動終了にはSFU watchdogが必要で、SQL cronだけでは保証しません。

## 現在の状態

本番もTESTもmigration未適用。本番デプロイ・mainマージ未実行。前回b705eb4を継承した独立ブランチで修復。両方式の実iPhone映像/音声/再接続/終了が未確認のためGOは出さない。

## 個別承認を要する操作

まずTEST `aeqskxxykzapgaudbeqa` だけに、次の2ファイルを順に適用する承認が必要。本番 `pmmtijwswzwhuriqhlep` は対象外。

1. `supabase/migrations/20261031010000_direct_live_lifecycle.sql`
   - 準備用の非公開leaseテーブル、必要なLIVE列、open sessionの一意索引、本人認証付き予約/公開/終了RPC、旧クライアントの非原子的書き込みを防ぐtrigger。
   - 既存セッションを削除しない。重複open sessionがあれば適用を中止する。
2. `supabase/migrations/20261031010100_direct_live_expiry_schedule.sql`
   - Supabase同梱のpg_cron拡張を有効化し、毎分の失効処理を登録する。外部サービス契約・Egressなし。
   - SQL cronはheartbeatが90秒止まった未公開準備だけを終了する。配信中LIVEの自動終了にはSFU watchdogの継続実行が別途必要。DB時刻だけでは正常LIVEを終了しない。
   - 終了履歴は保持する。LIVE以外の台帳・送金・投票は変更しない。

TESTの現行live_sessionsにはheartbeat/event binding等の列が不足し、pg_cronは未導入。migration 1は列をidempotentに追加する。TEST/本番とも重複open sessionは読み取り時点で0だった。適用直前にもう一度確認する。

## Previewの停止理由

Vercel PreviewのSUPABASE_URL/VITE_SUPABASE_URLはTESTホストを指すことを確認済み。ただしPreviewのSTRIPE_SECRET_KEYは秘密値のためモードを確定できなかった。service-roleキーの接続先一致も外部書き込みで検証していない。ユーザー指示に従い、Previewは作成しない。

このブランチだけ `git.deploymentEnabled=false` として、Draft PR用pushで自動Previewが作成されないようにする。本番mainや他ブランチの設定は変えない。実行時Previewを進める前に、サーバー側のStripeモードがTESTであること、service-roleの対象、TESTのmigration適用を確認する。キーそのものをチャット/PR/ログに出さない。

## 承認後のTEST確認

- 非破壊的なスキーマ/権限/duplicate-openの再確認 → migration 1 → migration 2。
- 対象RPCの権限がauthenticated本人に限定され、内部close/expiry RPCはservice_roleだけ実行できることを確認。
- 新しいTESTユーザー/専用演者が必要なら作成対象を明示。HARIBOWの本番ユーザーを使わない。既存データを削除しない。
- publish準備→LIVE公開→視聴→通信断/復帰→終了をTEST接続で確認。複数実DB接続から同時予約・終了を実行し、open sessionが1以下、古い終了要求が新配信を止めないことを確認。
- schedulerのjob/run_details、未公開準備の90秒失効、SFU不在の連続確認と猶予、閉じたsessionへのtoken拒否を確認。
- 別端末の実iPhone Safariで音・映像・ミュート/再開・カメラ切替・回転・画面ロックを確認。ローカルモック成功で代用しない。
- StripeはTESTキーとTESTアカウントだけを使い、Checkout/成功/失敗/キャンセル/Webhook重複を確認。本番キー/送金/返金は使わない。

## 本番反映は別承認

TESTと実機の確認後に、具体的なリリースcommit・本番migration・scheduler・デプロイ対象を提示して別途承認を得る。

既存配信を止めないため、**本番のopen sessionが0、performers.is_liveの不整合が0の時間帯**に限定する。旧クライアントはtriggerで開始/終了が拒否されるので、運営者の画面を更新する短いメンテナンス手順が必要。新アプリだけを先行公開してもmigration未適用ならDIRECT開始は安全側に停止する。

通常のカメラ準備で本人の予約を確保し、映像・音声のSDK publish成功後に公開RPCを実行する。別の画面の同時操作はLIVE_BUSYとなる。再読込で別操作扱いになったときは、元画面で終了するか、現在のsessionを明示的に終了してから開始し直す。強制的な無条件takeoverは行わない。

## 障害時のロールバック

実行前に個別承認が必要。自動実行しない。事業データ/セッション履歴を削除しない。

1. 新しい配信開始を止め、現行配信を本人操作で終了。open session=0を確認。更新前/更新後の画面を混在させない。
2. pg_cronの `haku-direct-live-expiry` ジョブだけをunscheduleする。拡張自体は削除しない。他ジョブは変更しない。
3. 旧クライアントへ戻す場合、通知関数のauthenticated EXECUTEも復元が必要（元の本人チェックは維持、これも別承認）。追加監査でPUBLIC/anonへの実行許可を閉じているため、戻す権限を明示して承認する。
4. この変更で追加した `direct_live_guard` triggerをperformers/live_sessionsから外す。必要なら追加した `live_sessions_one_open_performer` 索引のみを外す。旧クライアントを使う前に実行する必要がある。
5. 本番deploymentを反映前の正常deploymentへ戻す（これも個別承認）。DBの追加列と関数は残してよい。公開RPCを使う新画面は閉じて更新する。
6. HARIBOWの公開プロフィール、DIRECT/YouTube、投げ銭への導線を確認。Stripe処理/送金/返金はロールバック対象にしない。

復旧にbusiness rowの削除や本番決済を使わない。不整合が見つかった場合、修正対象のsession/performer IDと更新内容を提示し、別承認を得る。
