# LIVE開始 Web Push — 未適用の独立差分

この差分は本番未適用です。`ENABLE_LIVE_START_WEB_PUSH` は未設定（OFF）のままにします。UIの小窓・映像・配信開始機能とは独立しています。既存の出演予定PushとHAKU内LIVE通知は保持します。

## 既存schemaだけでは実装できない理由

`push_notification_deliveries.notification_event_id` は `appearance_notification_events` へのNOT NULL外部キーです。出演予定イベントには `appearance_id` の必須外部キーと出演予定用 `event_type` 制約があり、LIVEセッションを安全に格納できません。また、`appearance_push_enabled` は出演予定の同意であり、LIVE開始Pushへの同意と同一扱いにしません。既存通知テーブルだけを送信済み台帳として使う方法は、複数サーバーの同時送信や再試行の排他を保証できません。

## 追加内容

- CLI生成migration `20261030105928_live_start_web_push_queue.sql`：`live_push_enabled`（既定false）、`live_push_events`（LIVEセッション毎1件）、`live_push_deliveries`（イベント・購読毎1件）を追加。
- enqueue/claim関数はservice_role専用。本人の有効なLIVE、出演者の承認・有効状態、非公開TEST除外、フォロー、LIVE Push同意、有効な購読を検証。
- queue claimは `FOR UPDATE SKIP LOCKED` とprocessing状態で二重送信を防止。終了済みLIVE、同意取消、フォロー解除、有効でない購読を送信対象外にする。
- `/api/notifications/push` の `kind: 'live_start', liveSessionId` 分岐。認証済み本人だけが起動でき、既定OFF・migration未適用時は送信せず終了する。
- Web PushのタグはLIVEセッション単位、TTLは60秒。ネットワーク上の厳密なexactly-once配信は保証できない。送信後・送信済み記録前の障害に備え、同じタグで通知を置換する。送信後にLIVEが終了した通知を端末から遠隔撤回することはできない。
- 既存appearance APIリクエスト形式、キュー、TTL（86400秒）は維持。
- `VITE_ENABLE_LIVE_START_WEB_PUSH=true` の時だけLIVE専用opt-inを表示。optional schemaと公開VAPIDキーが未準備なら操作を無効化する。LIVE開始後の認証付きPOSTは最大10バッチで、失敗してもLIVE開始を失敗させない。
- appearance/LIVEの同意を1項目ずつ更新し、他方の同意やHAKU内通知設定を上書きしない。ブラウザの購読は共用し、カテゴリをOFFにしてもunsubscribeしない。両方OFFなら両方のserver claimが対象外にする。

## 承認前に実行しない項目・残る確認

1. migrationのTEST適用と照合（本番適用は別途明示承認）。本差分はDBへ適用していない。
2. 通知設定画面のLIVE専用opt-in、schema未適用時の無効化、片方OFF時の共有購読保持をTESTで確認。クライアントflag `VITE_ENABLE_LIVE_START_WEB_PUSH` も既定OFFのままにしている。
3. `startLive()` 成功時に本人のBearer認証で `kind: 'live_start', liveSessionId` をPOSTするコードは接続済み。最大100件/リクエスト、`remaining` の時だけ最大10回追加実行する。実Pushは未送信。
4. TEST環境に既存VAPID値を設定し、両feature flagを限定有効化して受信・重複・拒否・終了後抑止を実機確認。本番環境変数は変更していない。
5. 一時停止はflagをOFFへ戻して再デプロイ。キューの過去履歴の削除は不要。一般公開は未承認。

通常LIVE開始のHAKU内通知は既存 `notify_followers_live_start` を引き続き利用する。この既存RPC自体にはLIVEセッション単位の一意制約がなく、`startLive()` のalreadyLive判定を越える同時呼出しでは重複余地が残る。今回の独立Pushキューは一意化済みだが、HAKU内通知の冪等性改善は別途SQL差分と既存クライアント互換確認が必要。

## iPhone条件

WebKit公式仕様では、iOS/iPadOS 16.4以降のホーム画面Webアプリで、利用者の操作に続いて通知許可を要求します。Safariタブでの利用だけで受信可能と表示しません。既存コードの機能検出・許可拒否表示・Service Workerの同一origin遷移を再利用します。実機での配信は未検証です。

参考：[Web Push for Web Apps on iOS and iPadOS](https://webkit.org/blog/13878/)

## 検証

- `tests/live-start-push-migration.test.ts`：隔離PGliteで同意・一意性・本人/非公開/終了済み排除・権限・claim・失効を検証。
- `tests/live-start-push-endpoint.test.ts`：既定OFF、未適用時停止、本人照合、sessionタグ、短TTL、既存appearance保持をモックで検証。
- `tests/live-push-client.test.ts`：client flag、schema無効時停止、認証・バッチ上限、独立同意、共有購読、iPhoneホーム画面条件をモックで検証。
- 実サーバーへのPush、TEST/本番DB書込、課金操作は行わない。
