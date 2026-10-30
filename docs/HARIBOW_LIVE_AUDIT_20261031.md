# HARIBOW 本番直前監査（2026-10-31 JST）

## 判定

- HAKU DIRECT: NO-GO（実機確認前の本番投入判定）。iPhone Safari → LiveKit → 別端末の実映像・音声は未検証。これは実際に配信不能と確認したという意味ではない。
- YouTube LIVE連携: NO-GO（現設定）。HARIBOWの連携はOFF、動画URL/IDなし。YouTube側のLIVE有効化・公開範囲・埋め込み許可・実再生は未検証。
- フォロー・投げ銭: 静的監査・既存台帳確認のみ。配信中の実決済は実行していない。

## 対象と保護

本番Deployment `dpl_EkNu7rQQpcyEVG14Cf2VeNeM5zA1` はREADY、Git SHA `398d05b9c51ed84ed0b1a3bb1c7beae62a52f616`。
本番と同じSHAを基点に `/private/tmp/haku-haribow-audit`、ブランチ `codex/haribow-live-audit-20261031` で修正。元作業ディレクトリの多数の未コミット変更は編集していない。別のpartial clone側で同名ブランチ/worktree作成が途中停止したが、そちらでは修正していない。
本番DBはSELECTのみ。本番デプロイ、mainマージ、Stripe決済・返金・送金、有料契約、Egressは未実行。Git pushも未実行。

## 確認できた事実

- HARIBOW `d8255f89-61c0-4e69-8109-4b0a996a4724`: performer / active / is_approved=true / is_private_test=false / is_live=false。
- Stripe account登録・onboarding_complete=true。ただしStripe APIによる当該アカウントの現在の制限・送金可否は未確認。
- 本番 `/api/livekit/status`: HTTP 200、configured/hasUrl/hasKey/hasSecretすべてtrue。存在確認は、LiveKit署名検証・メディア接続の成功を証明しない。
- Vercelの本番スコープにLiveKit、Supabase URL/anon/service-role、Stripe本番鍵・Webhook secret・Connect webhook secretが存在。値は出力せず、変更していない。鍵の実値・モード整合性は未検証。
- HARIBOWの過去LIVEセッションは2件確認、どちらも終了済み。うち1件はheartbeat_timeout。過去履歴はAV送受信の証明にならない。
- HARIBOWのtipsはsucceededが1件、settlement_status=settled、balance transaction参照あり。直近24時間のstripe_webhook_eventsはlive mode processed 44件。この監査で決済は作成していない。
- performers/profiles/live_sessions/tips/followsはRLS有効。service_roleのSELECT/UPDATE権限あり。authenticatedはtips.status/amount_centsをUPDATE不可。RLSだけを見て「利用者が台帳を書き換えられる」とは判定しない。
- トークンAPI: ホスト本人・承認済み・activeを確認。視聴者は承認済みかつis_liveが必要。canPublishはホストだけ。期限は6h。実ログインでの発行・LiveKitによる受理は未検証。
- SafariではH.264を優先、playsInline、権限拒否メッセージ、カメラ切替/復旧、processor失敗時のカメラ直接送信フォールバックがある。Canvas加工後の品質・熱・長時間稼働は実機未検証。
- DIRECTとYouTubeが両方有効な場合DIRECTが優先される。YouTubeへ切り替える際はDIRECTの終了を確認する必要がある。
- PR #88/#99はDraftで未マージ。#88はSRS試作、#99は没入型UI/小窓等の実験。PR記載の模擬試験を本番の実配信証拠として扱わない。

## 発見と最小修正（本番未反映）

1. Safariが視聴音声の自動再生を拒否しても復帰導線がない。
   - `AudioPlaybackStatusChanged` / `canPlaybackAudio`を監視。ユーザーが押す音声開始ボタンから直接`Room.startAudio()`を呼ぶ。
2. SDKの再接続断念後もホスト/視聴者に明確な復帰導線がない。
   - reconnecting/signalReconnecting/reconnected/disconnectedを表示へ反映し、明示的な再接続ボタンを追加。既存SDKの自動再接続は維持。
3. DIRECTの縦画面ではフォローボタンの親要素がCSSで非表示。
   - 常時表示のLIVE操作欄に、既存のフォロー処理を使うボタンを追加。透明なパネル余白が応援ボタンのタップを遮る問題も修正し、子要素だけがタップを受けるようにした。
4. endLiveのセッション終了UPDATE失敗を無視して成功扱いする。
   - エラーを呼び出し側へ伝え、既存の終了再試行メッセージを表示。公開フラグを先にOFFにする順序は維持。DBのトランザクション化ではない。

## 未解決と運用上の制限

- startLiveはperformersを公開した後にlive_sessionsをINSERTする非原子的処理。INSERT全失敗時に公開フラグだけ残り得る。open sessionの一意制約もない。二重タブで開始しない。対策の原子化はDB変更を伴うため、本番へ未適用。
- ホストのheartbeatは画面がliveなら送信を続ける。SDKが最終切断した後の完全な自動終了保証はない。終了/再接続操作と管理画面での確認が必要。
- `/api/livekit/presence`は通常GETでもstale sessionを更新・終了し得る。この監査では通常GETを呼んでいない。statusモードのみ読み取った。90秒は判定閾値であり、必ず90秒後に終了するタイマーではない。専用の定期実行設定はvercel.jsonにない。
- 通常終了はDBとローカルRoom切断に依存する。既発行の公開視聴トークンは期限まで残るため、即時失効を保証しない。
- 視聴中に投げ銭画面へ移動するとDIRECT視聴画面はアンマウントされ、映像音声が止まる。帰還後に再接続。PR #99の小窓は本番未反映。
- YouTube視聴画面にフォローボタンはない。プロフィールから事前にフォローする。YouTube連携ONは実LIVE中判定ではなく、保存されたURLを公開するスイッチ。配信終了後も録画が表示され得るのでHAKU側でOFFにする。
- ライブtips集計はread-modify-writeであり、同時イベントで集計値が競合する可能性がある。金額の根拠はtips/精算台帳で確認する。
- Vercelエラー集約にConnectのpermission deniedと一部テストアカウント/本番キー不一致が記録されている。HARIBOWに該当する証拠はない。24h runtime個票取得はHobby保持期間制限で失敗、30m再試行ではDEP0169警告1件。集約は過去first/last日時も返すため、全件が当日発生とは断定しない。
- Stripe署名検証、paid判定、Webhookイベント一意台帳、サーバー精算経路を確認。非同期決済専用のcheckout.session.async_payment_succeeded分岐はない（payment_intent.succeeded経路はある）。未確定決済を成功として表示しないこと。Stripe管理画面のWebhook配信先/登録イベント/最近の配信成功とTEST再送は未検証。

## 当日手順

### DIRECT

1. HARIBOW本人でSafariにログイン。HAKU DIRECTを選ぶ。iPhoneは給電、画面ロックを避け、他のカメラアプリを閉じる。
2. カメラ・マイクを準備するを押し、両方を許可。カメラ映像、前後切替、向き、マイクのONを確認。
3. 別端末を別回線で用意。イヤホンでハウリングを避け、LIVE開始後にHARIBOWプロフィールから視聴する。
4. 映像の動き、声・演奏音、音ズレを人間が確認。最低数分継続し、画面回転・短い通信断からの復帰も確認する。修正が承認・リリースされていれば音声開始/再接続ボタンも確認する。現本番にボタンはまだない。
5. フォロー、投げ銭への移動と戻る導線を確認。実決済は個別承認なしに行わない。
6. 終了を押し、別端末のLIVE表示と管理画面のopen sessionが終了したことを確認。失敗時は通信を戻して終了を再試行。

### YouTubeへの代替

1. YouTube側の当該チャンネルでLIVE可能か事前に確認。公開または限定公開、埋め込み許可を確認し、実際の配信動画の共有URLを取得する。
2. DIRECTを終了してis_live=falseを確認。HARIBOW本人でYouTube LIVE連携を選びURLを貼り、プレビューを確認してHAKUで公開する。
3. 別端末でHARIBOWのLIVEを開き、YouTube公式プレーヤーで再生・音声を確認。必要なら再生ボタンを押す。
4. 埋め込み不可・読込不良なら「YouTube公式画面を開く」で外部視聴。HAKUプロフィールを別タブで開きフォロー・応援へ誘導する。
5. 終了時はYouTube側の配信終了とHAKU側の公開OFFを両方行う。

YouTubeの配信権限/URLが準備できない場合、YouTubeは即時利用可能な予備手段とは判定できない。現場録画を確保し、確認済みの配信先のみ案内する。

## 根拠資料

- https://github.com/shunta115/daidougei-haku-app/pull/88
- https://github.com/shunta115/daidougei-haku-app/pull/99
- https://docs.livekit.io/reference/components/react/component/startaudio/
- https://github.com/livekit/client-sdk-js （Safari autoplay / Room.startAudio）
- https://support.google.com/youtube/answer/9228390
- https://support.google.com/youtube/answer/171780

## 検証結果

- TypeScript: 成功（Node 22、tsc --noEmit）。本番APIファイルは既存tsconfig.app.jsonの対象外であり、全APIの型検証成功とは主張しない。
- 本番ビルド: 成功。最終CSS修正後も成功（17.12秒）。大きなchunkの警告あり。
- Chrome実ブラウザ・390×844の隔離UI: 8項目成功（音声開始、視聴再接続状態/再試行、フォロー、投げ銭導線、終了切断、配信側再接続状態/再試行）。映像は合成、認証/Room/APIはモック。実AV・決済・YouTube再生成功ではない。
- WebKit: インストール済みPlaywrightとbrowser protocol不一致、対応版の起動も完了しなかったため成功扱いにしていない。実iPhoneは未検証。
- 本番トークンAPIへの非破壊確認: 未認証ホスト401 Authorization required、停止中HARIBOWの視聴403 This live stream is not currently available。
- 既存テスト初回: 74ファイル中73成功、447件中446成功。routing.test.tsxの1件が既定5秒でtimeout。機能エラーではなくタイムアウトという観測までに限定し、15秒上限で再実行。
- TEST Supabaseへの書き込み・TEST Stripe checkout/webhook送信は実施していない。ローカル既存テスト内のDB検証とモックを、外部TEST環境のE2Eと混同しない。
- 既存テスト再実行（15秒上限）: **74ファイル・447件すべて成功**、157.91秒。routingの当該テストも成功。初回タイムアウトは隠さず上記に記録。
- 最終追加確認: YouTube登録/ルーティング6件と終了時エラー処理2件、計8件成功。

## 本番へ進む条件

実iPhone Safariと別端末・別回線で、映像・音声・通信断復帰・終了を実測し、HARIBOW本人のログインで開始できることを確認する。YouTubeは実URL/埋め込み許可を準備する。その後、本番反映・本番DB操作は対象差分/操作を提示して個別承認を得る。本報告書とローカル修正は本番反映の承認を意味しない。
