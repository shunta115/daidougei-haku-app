# PR #122 再比較・最終改善判断（2026-11-02 JST）

**次回HARIBOW: NO-GO。** 0fa8c16e8abdaa3404e1910ffabef3fd1841edb3 の媒体設定と制御を維持する。追加の映像・音声制御は比較で合格しなかったため採用しない。今回のコード変更は既存5秒間隔・メモリ内診断の精度向上のみ。過去の送信量約25%削減を取り消す変更はない。Production公開・mainマージはしていない。

## 方法と証拠の範囲

比較元はmainでなく、指定されたPR旧SHA 0fa8c16。mainとの比較は前日のPR記載試験のみ。ローカル127.0.0.1の実LiveKit v1.13.11 SFU、Chrome156.0.8078.74、Playwright1.59、送受信別プロセス。iPhone UAでH264/mobile設定を選択しただけで、Safari・物理iPhoneではない。アプリのconnectAsHost/Viewer等とSDKを通すが、DB/Auth/公開UI/API lifecycle・既存クラウドTEST SFUは通さない。OS TTS声、合成BGM/拍手、720p30fps CanvasをgetUserMedia代替に使う。実マイクのDSP・PA音・実カメラは未検証。WebAudio sourceは2ch報告、48kbps指定に対して受信音声payloadはRED等込み通常約100kbps。指定値を回線使用量と同一視しない。

各300秒以上、旧版2回・音声保護候補2回。通常60秒→下り700kbps/100ms45秒→下り350kbps/150ms/3%損失45秒→回復60秒→メディア100%損失5秒→回復85秒。Chrome CDP Network.emulateNetworkConditionsByRule のglobal/P2P ruleを接続前に適用。完全な無線断やWS切断ではない。順番は旧1→不採用案の探索→候補2→候補3→旧4で、無中断の厳密なABBA試験ではない。温度・バックグラウンド負荷も未統制。計測は約5秒、最初15秒と相境界を集計から除外。詳細な映像画素readback/音声analyserは比較4回とも停止した。同条件でも時間変動があり因果確定には不足。

[comparison.json](comparison.json) は試行別区間集計、[audio-intervals.json](audio-intervals.json) は音声payload補足。room/token/SDP/IP/実ユーザー情報は含めない。ローカル原本・再現script・合成素材は `/private/tmp/haku-pr122-nov2/` に保全し、無効案も上書きしない。ファイル名newは不採用の実験候補を意味し、今回の最終コードではない。

## 同条件の実測

各セルは1回目 / 2回目。fpsはブラウザ受信statsの区間中央値。補間率は区間concealedSamples/totalSamplesReceived差分。無音時間率・聴感・発話明瞭度そのものではない。

| 指標 | 旧PR（old1 / old4） | 不採用の音声保護（new2 / new3） |
| --- | --- | --- |
| 連続送受信時間 | 300.2 / 304.6秒 | 301.3 / 304.4秒 |
| 通常のsource fps | 30.2 / 30.2 | 30.2 / 30.3 |
| 通常のprocessor fps | 29.9 / 29.5 | 29.3 / 29.5 |
| 通常受信fps中央値 | 21 / 21 | 16 / 17 |
| 通常の送信payload Mbps | 1.927 / 1.705 | 1.981 / 2.015 |
| 通常の受信payload Mbps | 1.056 / 0.748 | 1.054 / 1.053 |
| 下り700kbps音声補間 | 11.11 / 2.48% | 9.57 / 1.39% |
| 下り350kbps+3%音声補間 | 23.99 / 54.37% | 26.57 / 3.00% |
| 同350区間の受信映像fps | 12 / 13 | 動画購読を停止（音声優先） |
| 回復1の最初720p | 未到達 / 20.46秒 | 10.31 / 15.10秒 |
| 遮断後最初720p | 未到達 / 未到達 | 30.48 / 20.31秒 |
| 720pを連続3サンプル観測 | 全回復窓で未達 | 全回復窓で未達 |
| 遮断後CPU制約sample率 | 0 / 93.75% | 0 / 0% |
| runtime error / 終了前参加者 | 0 / 各2人 | 0 / 各2人 |

未到達の観測窓は回復1約55–56秒、遮断後約77–81秒。候補は重度の補間検知で映像だけを購読停止し、健全な音声を確認して低層試行・段階復帰する試作。低い補間率は映像を維持した成果ではない。1回目350条件は旧1より悪く、通常fpsも低下した。比較再現性が足りず既定有効化も実験機能の製品追加もしない。

## 原因の切り分けと不採用理由

1. **13fps**: コード要求は30fpsで13fps固定なし。旧版45秒の測定負荷比較では、詳細probe有効時source17.6 / processor15.5 / 受信10.5fps、無効時29.7 / 29.0 / 17fps（最初15秒除外の中央値）。測定自体の負荷が寄与する証拠だが1回ずつ。軽量比較でも受信16–21fpsで、残るエンコード/復号/描画のどこが律速か未確定。実演者端末の責任とは断定しない。
2. **CPU**: 通常区間では4試行ともCPU制約sample0。回復区間は旧4でも93.75%となった。前日のPR固有原因は再現・確定できない。全3simulcast encoderがactiveのsampleも観測。publisher setPublishingQuality変更の試作だけでは層数低減を実証できず、採用しない。発熱は未計測。
3. **復帰**: RTP再開と最初の720p到達を区別。receiver要求/実際のSFU選択/帯域推定/CPUの複合要因が残り、安定720p復帰はどの試行も証明できない。setVideoQualityだけで即時復帰するとは言えない。新しい再接続ループや強制720pを足さない。
4. **音声**: 受信側350kbpsは映像と音声の合計payload（旧約326kbps）で飽和し、音声payloadも旧72.1/43.3kbpsへ低下。補間は注入3%を大きく超え、受信帯域・キュー・deadlineの影響と整合するが個別の原因配分は不明。jitter-buffer累積counterはこの原本に無く、滞留時間を推定していない。音声のみ候補では約97–99kbpsが届くが遷移を含む補間率は3–27%で不安定。silentConcealedSamplesも欠損のゼロ埋めを含み得るため無害な無音と扱わない。

さらに360p補助層を450kbps/20fpsから200kbps/15fpsへ下げる案も、350条件補間約68%、publisher制御変更併用案約71%で不採用。比較条件の変動があるため悪化原因の確定とはしない。全案のpatch/bundle/resultをローカルevidenceに保全。元450kbps/20fps・480p900kbps/25fps、音声DSP、既存publisher制御は維持。

**訂正**: SDK2.21.0 LocalParticipantは元からaudio encoding priority/networkPriorityの既定がhigh。PRの明示high指定は既定値の明示であり、前日の補間改善を優先度引上げの効果とは言えない。

## 採用する最小変更

RTP診断にframesEncoded/framesDecoded差分からのintervalFpsと、jitterBufferDelay/jitterBufferEmittedCount差分からのjitterBufferMsを追加。瞬間fpsと区間fpsを区別し、初回/欠落/reset/30秒超をnullにする。buffer値は滞留時間でA/V同期や端末間遅延ではない。既存stats読取の数値allowlistに4counterを追加するだけで、5秒間隔、媒体設定、帯域制御、保存なし/uploadなしは維持。診断精度向上であり映像・音質改善を実測したとは報告しない。

## 同期・未検証・費用

今回4比較は詳細probeを停止し、同期の再測定なし。前日のflash/clap近似p95絶対差main196ms/PR266msは測定負荷を含み、同期改善の証明に使えない。物理iPhone Safari、実マイク/カメラ/PA、実クラウドTEST経路、完全な通信断、実60分、500人、全UIのend-to-end回帰は未検証。各5分×2を10分連続/60分連続の合格に読み替えない。前日の各10分超試験は別条件として保全。

今回追加契約・クラウド通信・有料サービス・Egressなし。旧版通常の実測上りは1時間換算0.767–0.867GB、受信0.337–0.475GB/視聴者。500人なら受信側合計168–238GB/時、1日3時間×30日なら約15.1–21.4TB/月（payloadのみ、同一品質を500人へ維持できるという意味ではない）。既存契約/無料枠/超過単価/運用費は未確認で追加0円・月1万円以内は保証できない。最終変更は計測値追加だけで意図的な媒体転送量増なし。ローカルSFU参加者0をread-only確認後、自分のSFUとrunnerのみ停止。deleteRoom・本番DB・main・Production・決済・既存データ削除なし。

**GO条件未達**: 安定した音声保護・復帰とSafari実機の確認が必要。PRはDraft維持、公開は個別承認が必要。
