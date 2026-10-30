# HARIBOW 第2段階 QA

> 追加監査でheartbeat/失効・権限・cronの仕様を修正しました。適用前に `docs/HARIBOW_PR100_CONCURRENCY_AUDIT_20261031.md` を参照してください。配信中LIVEの自動終了にはSFU watchdogが必要で、SQL cronだけでは保証しません。

## 判定

HAKU DIRECT / YouTube LIVE連携とも **NO-GO**。実iPhone Safariで映像・音声・再接続・終了が未確認。実装の修正と自動試験を、実配信成功として扱わない。

前回b705eb4から `codex/haribow-live-stage2-20261031` へ分岐。前回の音声再開、再接続UI、縦画面フォロー/応援、終了時エラー処理を維持。対象GitHubはshunta115/daidougei-haku-app、本番基点は398d05b9。

## 実装した修復

- 予約は本人だけが読めるdirect_live_leasesへ保存。カメラ準備だけではlive_sessionsを作らず、通常の投げ銭が準備中LIVEに紐付くことや集計の水増しを避ける。Stripeの本番コードは変更しない。
- 本人/承認/activeを検証し、performer行ロックで開始・終了・期限切れを直列化。live_sessions作成とis_live公開は単一DBトランザクション。開始失敗は全部ロールバック。
- 操作IDとsession IDで再試行を識別。同一操作は再利用、競合操作は拒否、期限切れは新枠へ更新。古い終了要求が新しい配信を終了しない。
- 旧クライアントの非原子的LIVE更新をtriggerで拒否。migration未適用なら旧方式にfallbackせず開始を停止。
- トークンの参加者名は表示名が空でもメールアドレスを出さない（Guestへfallback）。
- トークンのRoomをsessionごとに分離。公開前予約を視聴者に渡さず、視聴トークンのpublish権限はfalse。視聴IDを接続ごとに変え、本人が視聴したときも配信接続を追い出さない。join tokenの期限は5分（接続済み配信を5分で終了する意味ではない）。
- heartbeatは接続中だけ送信し、サーバーもSFU上の本人接続と操作IDを検証。再接続断念後の画面だけのheartbeatで幽霊LIVEを維持しない。未公開準備の失効処理を毎分実行するmigrationを用意。配信中LIVEはSFU watchdogで確認する。
- 接続中に画面を閉じた場合の遅いconnect完了を切断。準備失敗/画面離脱で既知の予約を終了する。profile再取得失敗だけで正常配信を切断しない。最終的に送信できなかった終了はleaseが処理する設計。
- Realtimeイベントを取り逃しても視聴状態を10秒ごとに再取得。新しいlive_started_atで古い接続/コメントを使い続けない。
- YouTubeはプレーヤー生成/破棄時にReactのmountを削除しない。API未ロードを12秒で案内し、自動再生拒否を明示。bufferingを実再生成功に数えない。公式画面への安全な別タブリンクは常時表示し、保存URLではなく検証した動画IDから遷移URLを組み立てる。
- YouTube視聴にもフォローとHAKUプロフィールへの帰還導線を追加。連携ON/OFFとDIRECT優先をRealtime/ポーリングで反映する。
- LIVE APIを含む専用TypeScriptチェック設定を追加。既存admin guardのnull判定の型注釈を修正したが、実行時の権限ロジックは変更していない。

## 適用していないもの

DB migration 2本は本番・TESTとも未適用。pg_cronも両環境未導入。TESTには旧LIVE列の不足がありmigration内で補う。本番/TESTの重複open sessionは読み取り時点で0。既存データ削除・本番デプロイ・mainマージ・Stripe実決済/送金/返金・Egress・有料契約なし。

Vercel Preview用のSupabase URLは既存TESTホストaeqskxxykzapgaudbeqa.supabase.coと一致。一方Stripe秘密値のTEST/LIVEモードを確定できないため、Previewは作成せず、このブランチだけGit自動デプロイを停止する。TESTのservice-role鍵の実接続も未検証。

## 残る確認・制約

- HARIBOW本番の認証済みセッション、配信iPhone、YouTube実配信URL/公開設定をこの環境では操作していない。本番URL登録はDB変更に当たるため個別承認が必要。
- 実LiveKitの接続/publish/subscribe、実音声/映像、熱・通信品質、iPhoneの画面ロック/アプリ切替は未検証。ローカルのCanvas/Room/認証/APIはモック。
- ローカルPGliteは実SQLのロールバック/権限/一意性を検証するが、独立した複数DB接続のロック競合・実PostgREST・scheduler稼働を証明しない。TEST適用承認後に確認する。
- WebKitは新たに隔離した互換版26.0も起動20秒でタイムアウト。既存27.2系もpage作成が完了せず、成功扱いにしない。OSやブラウザの保護設定は変更していない。
- YouTube URL検証は構文/動画IDの検証。実在・LIVE中・公開/限定公開・埋め込み可否は実プレーヤーで確認が必要。非公開や埋め込み禁止はHAKUでは解除しない。終了後のHAKU公開OFFは運営者が行う。
- 未公開準備の失効は90秒＋毎分処理の待ち時間。配信中LIVEはSFU watchdogの不在確認と猶予が必要で、SQL cronだけでは終了しない。既発行トークンは終了直後にすべて失効するわけではないが、次回配信のRoomは別なので新配信に再利用できない。
- ホストのリロードは新しい操作として扱う。別画面の正常LIVEを勝手に奪わず、元画面の終了または明示的な終了を必要とする。

## Stripe（処理を変更せず監査）

既存の金額上限/下限・本人帰属・request ID再利用・Stripe idempotency key・成功/キャンセルの帰還URL・署名検証・paid確認・Webhook台帳・confirm側照合を維持。既存のpayment/confirmation/return/Connectテストを回帰対象に含める。

Stripe秘密値のモードが確認できないため、外部TEST Checkout生成やWebhook送信はしていない。HARIBOWの現在のConnect制限/送金可否もライブStripe APIでは再確認していない。前回DBにはonboarding完了と精算済みtipがあったが、今回の決済成功の証拠ではない。

既存のread-modify-write型LIVE投げ銭カウンターは同時処理で競合し得る。金額の根拠はtips/精算台帳。Webhook台帳がprocessingのままプロセス停止した場合の自動再claimやasync_payment_succeeded専用分岐も既存の制限として残す。今回、決済/送金/返金コードは変更していない。修正が必要なら金融処理の別差分・別承認で扱う。

## 運用・承認

運営向け: `docs/HARIBOW_LIVE_OPERATOR_20261031.md`

適用差分・メンテナンス・TEST検証・ロールバック: `docs/HARIBOW_STAGE2_RELEASE_AND_ROLLBACK.md`

次の承認対象はTEST限定のmigration 2本（pg_cron有効化を含む）。本番反映はその後、実機確認を踏まえ別途承認する。YouTube LIVE連携は視聴連携だけであり、DIRECT→YouTube同時配信やEgressは実装していない。

## 参照した公式資料

- https://supabase.com/docs/guides/database/functions
- https://supabase.com/docs/guides/cron/install
- https://docs.livekit.io/transport/media/publish/
- https://developers.google.com/youtube/iframe_api_reference
- https://vercel.com/docs/project-configuration/git-configuration

## 自動検証の証跡

最終全件実行: **79ファイル・471件成功**（15秒上限、109.56秒）。`b1c03ea` の実装を検証。差分の金融コード変更なしを再確認。Draft PR: https://github.com/shunta115/daidougei-haku-app/pull/100

- Chrome模擬ブラウザ: 390×844で14項目成功。準備→publish→公開→終了の順序、公開前のバックグラウンド復帰、既存のフォロー/応援、YouTubeエラー時の外部導線を含む。
- 横画面844×390: phone-landscape判定、音声開始とフォローの実クリック成功。これもモックAPI/Roomであり実機検証ではない。
- WebKit E2E: 起動失敗のため未検証。新規隔離WebKit26.0の20秒launch timeoutを記録。OS保護設定の変更はしていない。
- 新規SQL試験9件: 予約中にlive_sessionsを作らない、本人/承認、競合操作拒否、途中失敗rollback、通知一回、終了の再試行と旧要求、lease失効、重複事前確認でデータを削除しないことを確認。
- 新規token認可5件、heartbeat/強制終了5件はモック依存のサーバー単体試験。
- 新規JWT2件は実livekit-server-sdkを使い、ローカルの偽キーによるHMAC署名とsubscribe-only/単一Room/短期TTLを検証。Cloudの本番キーが受理される証拠ではない。
- YouTube player復旧3件: load timeout、autoplay拒否、iframeの再mount、古いcallback抑止、安全な外部URLを確認。
- TypeScript: アプリとLIVEサーバーの両設定で成功。新規tsconfig.live-server.jsonで従来のアプリ設定に含まれなかったLIVE APIも検査。
- 本番相当build: 成功（最終21.12秒）。大きなchunkの既存警告あり。金融API/手数料/送金コードへの差分なし。

## 最終リリース判定

| 方式 | ローカル実装 | 自動検証 | 実機・実サービス | 本番判定 |
|---|---|---|---|---|
| HAKU DIRECT | 修復済み、DB変更は未適用 | SQL・認可・JWT・heartbeat・模擬UI成功 | iPhone/実LiveKitのAV/復帰/終了は未検証 | NO-GO |
| YouTube視聴連携 | 修復済み、本番URL未登録 | 登録・復旧・外部導線・模擬UI成功 | iPhone/実動画の再生・音声・公開設定は未検証 | NO-GO |

ブランチのVercel deployment一覧が0件であることを確認。Preview作成停止を維持。mainマージ・本番デプロイ・TEST/本番migration・実決済は未実行。次に必要なのはTEST限定migration 2本の個別承認。
