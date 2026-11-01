> 最新の再比較とNO-GO判断: [2026-11-02報告](20261102/README.md)。音声highはSDK既定値の明示で、優先度引上げではありません。

# HAKU LIVE 品質監査・安全な改善（2026-11-01 JST）

本番公開判定: **NO-GO**。このDraftは品質診断・正しい品質表示・ローカルTEST音声比較・実験的レイヤー制御の実装です。最高品質化プロジェクト全体の完了ではありません。
基点: main `b3d3427544f4cf2cbe5a61423b0f9090b0498979`（#121まで）。元Desktop作業ツリー、関連PR、main、DB、Production、決済は変更しません。

## A. コードで確認した現行経路

| 項目 | 根拠と確認結果 |
| --- | --- |
| HAKU DIRECT | `PerformerLiveScreen.connectHostRoom` → `/api/livekit/token` → `livekit.connectAsHost` → LiveKit WebRTC → 視聴者 `connectAsViewer`。配信先URLはサーバー環境変数。Cloudかself-hostか、稼働サーバー版・TURN使用・契約はコードだけでは不明 |
| 取得 | `liveCamera.ts`: 横1280×720/30fps、縦960×1280/30fpsを要求。ブラウザの実効値とは区別 |
| Canvas | `livePortraitProcessor.ts`: 横1280×720、縦720×1280、`captureStream(30)`。したがって通常Canvas経路に1080pの画素はない。補間による1080p化を品質向上と扱わない |
| 映像 | `livekit.ts`: Safari UAはH.264、それ以外VP8。実交渉は未測定。simulcast、dynacast、adaptiveStreamあり。480p/720p補助レイヤー指定、上限2.5Mbps mobile/3Mbps desktop、30fps、maintain-framerate。上限値は実効送出値でない |
| 音声 | アプリはAEC/NS/AGCをtrue、mono、DTX/REDをtrueに要求。lockfileのSDK2.21.0はmusic 48kbpsとvoiceIsolation=trueを既定として継承。sampleRateはアプリ既定で明示していない。Opus/48kHzの実交渉を保証できない |
| 輻輳・再送 | ブラウザWebRTCとSDK/SFUに委任。アプリに独自RTP再送・jitter buffer・帯域推定の実装なし。SDKの自動処理をアプリ独自機能として数えない |
| 同期 | カメラはCanvasを経由し、マイクは別trackで同じRoomへ送信。RTP/RTCPの同期はWebRTCに委任。Canvas描画遅延の補償・A/V同期の実測値はない。RTTはA/Vズレではない |
| 接続 | SDK再接続、既存host復旧処理、viewer終了時disconnectあり。再接続失敗/長時間/同時開始の安全性は#100/#116の改善対象。本Draftで別のRoom再生成ループを追加しない |
| SRS/WHIP/HLS | 通常mainの上記DIRECT経路には含まれない。#96–98/#116のCROWD実験とは別。過去の疑似500 HTTP視聴をDIRECTの500 WebRTC試験に読み替えない |
| Egress | 導入・呼出し・有効化なし。録画/外部有料処理なし |
| 実環境 | 稼働deployment SHA、実機の読み込み済みJS、SFUログ、CPU/帯域制限、契約使用枠は今回未取得。本番の実効品質/原因は不明 |

## B–E. 実装した改善

### HARIBOW次回向け緊急修正

SDK2.21.0の`computeVideoEncodings`を直接呼ぶ試験で、横1280×720/縦720×1280とも改善前のscaleResolutionDownByが[1.5,1,1]となり、720系を重複生成し得ることを確認。`liveStablePublish.ts`で[2,1.5,1]（360/480/720）、fps上限[20,25,30]へ修正。mobile上位2.5Mbps・desktop上位3Mbpsを維持する。全層active時のmobile上限合計は5.10→3.85Mbps（約24.5%減）。これはSDKの設定計算であり、実送信量・CPU・画質の実測改善率ではない。dynacastの状態次第で実際の差は変わる。過去HARIBOWモザイクの確定原因とはしない。

音声は従来と同じ48kbpsの上限でSDK既定値の`priority: high`を明示（優先度引上げではない）。対応ブラウザが優先度を無視する可能性はある。AEC/NS/AGC/DTX/RED、カメラ/Canvas取得、同期タイムスタンプ、ミュート時のprivacy仕様を一律変更しない。Poorで要求する受信寸法を480系、Lostは360系へ合わせる。既存の開始・終了・再接続・予約・代理配信・決済処理を置き換えない。


- `liveQualityMetrics.ts`: 送信/受信/remote受信を区別。bytes差分の実効payload bitrate、packets差分の損失率、jitter/RTT、fps/寸法、frame drop差分、音声concealment比、CPU制約を扱う。初回、SSRC/track変更、逆行、30秒超の空白、欠落、負の損失補正は不明。remote受信情報がない場合、送出量から損失率を捏造しない。
- `liveQualityMonitor.ts`: 既存trackの公開SDK `getRTCStatsReport()`を5秒間隔で直列読取。現track単位のbaselineと最新snapshotのみ。codec MIME/clockRate/channelsは対応するcodec statsを引く。既存microphoneのgetSettingsから実効captureをallowlist取得。再接続時baselineを破棄し、古い非同期結果を破棄。切断時停止、同じRoomで二重起動しない。
- `readLiveQuality(room)`: 取得値はコピー。token/SDP/IP/deviceId/氏名/room ID/生statsをexportしない。永続保存・外部upload・DB・アクセス解析はない。baselineは次回読取で置換、snapshotは次回読取で置換、切断時破棄。音声内容/映像フレームは保存しない。
- `applyNetworkAdaptation`: 接続品質enumから1080p等を断定していた表示を廃止し、直近10秒以内のRTP寸法から判定。未測定はAUTO。画質ラベルはイベント発生時の最新sampleで、常時更新UIではない。ソース解像度/レイヤー上限と実送出を混同しない。
- `liveAudioProfile.ts`: 初回取得前だけ使うDEV限定の比較候補。speech=48kbps/DTX ON/AEC・NS・AGC・voiceIsolation ON。performance=96kbps/DTX OFF/NS・voiceIsolation OFF/AEC・AGC ON。unprocessed=同96kbpsで処理OFF比較。mono/REDを保ちsampleRate ideal48000。全処理OFFを最適解と決めない。48kHz取得とOpusの48kHz RTP clockは別。非対応値をexact強制しない。
- `LiveLayerPolicy`: ローカルDEVで明示した場合だけ、5秒ごとにremote loss>5%/RTT>700msまたはencoder CPU制約の継続2回でレイヤーを下げる。loss<1%かつRTT<250msの12回継続で一段復帰。欠測では復帰しない。3つのSDKレイヤーを選び、音声は変更しない。SDK/SFUのdynacastと競合し得るため実験扱い、production buildは制御を無効化。既存ConnectionQuality処理と二重にpublisher制御しない。

**未実装/未検証**: 1080/720/480/360の4段階完全ABR、取得/Canvas解像度とfpsの動的変更、実上り帯域推定、音量低下/音声消失の確定検出、A/V同期測定、サーバー統計取得。3 simulcast layersを4段階対応済みと報告しない。音声の無音は演目の静寂とも区別できず、端末や通信の故障と断定しない。サーバー未観測のため原因はunknownを返す。

## ローカルTESTでの使用

既存TESTアカウント/専用Roomを明示的に用意したVite開発環境からのみ:

```ts
// 実際のTEST URL/tokenは保存・ログ出力しない。新規キャプチャはこの初回接続だけ。
const room = await connectAsHost(testUrl, testToken, 'portrait', {
  audioMode: 'performance', layerControl: true,
})
const snapshot = readLiveQuality(room)
// 比較は一度終了して次の専用TEST接続でモードを選ぶ。既存LIVE中には切り替えない。
await room.disconnect()
```

通常呼出しには上記の補助映像層と音声優先度の緊急修正・観測を追加。capture/Canvas/音声DSPの既定は維持する。音声モード比較と統計ベースの追加制御はDEVで明示した時だけ。SDK版の非対応フィールドはnull。iPhone専用アプリ不要の経路は維持するが、物理Safariの検証成功は意味しない。
テストRoomの認証は既存サーバーを使う。無認証SFU・URL/tokenの共有・Production Roomへの接続を指示しない。

## F. 検証と残ゲート

| 試験 | 今回の証跡/状態 |
| --- | --- |
| 取得・計算・privacy・停止・再接続 | Vitest。具体的な結果はvalidation.json |
| 改善前後比較 | コード上: 以前はGoodで無条件1080p表示、現在はRTP寸法/不明。以前は横断RTP/audio比較モジュールなし、現在は数値診断あり。**実メディア画音質の前後比較なし** |
| 自動制御 | 合成metricによる劣化/復帰/欠測のpolicy試験。実回線・損失注入・再接続復旧の実証ではない |
| 60分 | fake timerで720回読取/1タイマー/最新snapshotのみ保持を確認。実時間60分の配信・同期・発熱の結果ではない |
| 10/30/60分実配信 | 未実施 |
| A/V同期/BGM/拍手/歓声/会話 | 同意済み素材での収録・聴感・flash/clap比較は未実施。改善率/ズレmsを作らない |
| iPhone Safari | 物理iPhoneなし、未検証 |
| 500同時 | 今回未実施。既存#116のlocalhost HLS疑似HTTP500は別経路・10秒試験。500実端末、500DIRECT/WebRTC、60分の証明ではない |
| 既存機能 | 全Vitest/typecheck/build。決済操作・実投げ銭・DB変更は行わない。既存試験の成功を全機能実環境E2E成功と扱わない |

次の安全な受入: 所有者管理の既存TEST SFU/端末で同意済み素材を使い、各端点のsnapshotとタイムコードを比較。下り制限/上り制限/損失/断線を別々に試す。音声とvideoのRTP時刻だけでA/V同期を断定せず、同一の音光イベントの送受信差を測定。同期、音楽の聴感、Safari発熱、カメラ切替、60分、外部帯域、500人費用の全ゲートが通るまで最高品質/公開可としない。

## 費用監査

新規契約/有料サービス/料金プラン変更/LiveKit Egressは0。診断upload通信0、サーバー保存0。既定の映像/音声上限を増やしていない。ローカル比較で96kbpsを選ぶと従来比48kbps増、DTX/RED/再送の実負荷はさらに変動する。追加課金ゼロの保証はできない。

以下はdecimal GB、audio48kbps、全員同一上位品質、ネットワーク余裕係数1.15、1出演者につき3時間/日×30日の計画値。圧縮映像の実効bitrateやsimulcast、TURN、signalling、Realtime、API/poll、プロバイダー独自課金は別。実データ転送の測定値ではない。

| 映像payload | 1視聴者/時 GB | 500人 Mbps | 500人/時 GB | 月間/出演者 GB |
| --- | ---: | ---: | ---: | ---: |
| 450kbps (360候補) | 0.2577 | 286.35 | 128.858 | 11597.18 |
| 900kbps (480候補) | 0.4906 | 545.10 | 245.295 | 22076.55 |
| 1.7Mbps (720候補) | 0.9046 | 1005.10 | 452.295 | 40706.55 |
| 2.5Mbps (mobile上限) | 1.3186 | 1465.10 | 659.295 | 59336.55 |
| 3Mbps (desktop上限) | 1.5773 | 1752.60 | 788.670 | 70980.30 |

`shared/liveBandwidth.ts`で人数・出演者数・稼働時間を変更して再計算できる。月間出演者数Nなら×N。publisher上りのsimulcast合計は別途実測する。500人が全員2.5Mbpsなら単純1Gbps経路では不足し得るが、現在のサーバーが1Gbpsであるとは未確認なので断定しない。

現契約固定費、無料枠残量、GB/participant-minute/TURNの超過単価、月間実利用、運用担当工数は未取得。既存契約費用と追加見積は未確定であり、0円や1万円以内とは判定できない。500人への本番負荷/高画質の有効化は、既存契約証跡・単価・上限停止策の確認後とする。月額上限10,000円を超える構成は採用しない。本Draftは新しい配信構成を契約・採用しない。

## 既存PRとの関係

2026-11-01にGitHub open PR一覧・変更ファイルを確認。#99は映像診断/UI、#100は原子的lifecycle/復旧、#116はこれらを統合、#120は通知。これらの画面、API、DB、通知、独自Room管理を再実装しない。新モジュール名は既存と重ならない。
唯一共通変更は`livekit.ts`の小さい接続hook/開始時比較/品質表示。#116 head `e808b01a656a49223788ae32d428e9462fe3d4f6`のファイルに対して`git apply --check`で検査（最終結果はvalidation.json）。これはそのPR全体のマージ・型互換・実行回帰の証明ではない。source/sender/previewの診断は#99/#116の既存`readHostVideoDiagnostics`を維持し、今回の音声/受信/損失診断と統合する時も二重pollを避ける。元PRにpush/merge/rebaseしない。

## 一次資料

- LiveKit SDK 2.21.0: `node_modules/livekit-client/src/room/defaults.ts`、`track/options.ts`、`track/LocalTrack.ts`、`track/RemoteTrack.ts`、`track/LocalVideoTrack.ts`を参照。
- https://docs.livekit.io/transport/media/advanced/ （simulcast/dynacast）
- https://www.w3.org/TR/webrtc-stats/ （単位・累積カウンタ・remote RTCP・欠測）
- https://www.w3.org/TR/mediacapture-streams/ （要求制約とgetSettingsの区別）
