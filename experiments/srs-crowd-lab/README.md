# SRS × CROWD 統合ラボ（Draft）

PR #88 の SRS WHIP/HLS と PR #87 の本人承認・QR・一回限りの grant を接続する非本番の実装。HTTP ゲートは `127.0.0.1` にのみ待ち受ける。SRS の 1985/8080/1935 も loopback 以外へ公開しない。

## 実装済み

- 承認済みパフォーマーが部屋を作り、事前に代理撮影を許可する。
- QR トークンは5分、配信 grant は1分。撮影者の認証済み ID、部屋、peer、epoch と結合し、WHIP POST で一回だけ消費する。
- 交代時は前の SRS publisher を切断し、切断が確認されるまで次の grant を発行しない。
- 本人停止、代理撮影許可の撤回、lease 切れで SRS publisher を切断する。失敗時は失効未確認として閉じたまま扱う。
- 1日3開始、各1時間、500視聴枠のラボ上限を設定。
- HTTP ゲートは `resolveActor(req)` を必須とし、認証未接続で公開起動できない。QR単独では WHIP を利用できない。

## まだ公開できない理由

TEST gatewayは `HAKU_CROWD_STATE_FILE` に指定するprivate SQLiteファイルを必須とする（Node 24推奨）。QR・一回限りgrant・日次上限・停止/交代fence・視聴認可/署名鍵を再起動と同一ホストの複数worker間で保持する。ファイルは0600、ローカル永続ディスクに置き、ネットワーク共有や複数ホストでは使用しない。本人が視聴を許可しない限り一般視聴ticketは発行しない。TEST Authで本人/非公開出演者を照合する。

TLS、公開WHIP入口の遮断、公開環境のSRS切断、既存HAKU一覧との接続は未完了。投げ銭・フォローは既存のパフォーマーIDへ紐付ける設計だが、今回のラボでは決済や本番データへ接続していない。通常 `npm run build` はCROWD画面を含めない。ローカル実験画面のみ `npm run build:crowd-lab` で別出力する。

iPhone Safariのカメラ、バックグラウンド、再接続、H.264/AAC再生とQR実機操作は未検証。PR #88 の500疑似クライアント試験は localhost 10秒のHTTP/HLS測定であり、実機500人・1時間の証明ではない。

## ローカル検証

`node --test experiments/srs-crowd-lab/*.test.mjs` で、本人/代理権限、HTTP経由の一回限りWHIP、SRS切断確認、再利用拒否を検証する。TypeScript、Vitest、ビルドは独立GitHub Actionsで実施。GitHub Actions の SRS コンテナへ FFmpeg 試験映像を送信し、管理APIで publisher を実切断して一覧から消えたことを確認済み（RTMP入力。WHIP入力の強制切断は未検証）。SRS映像・音声の実デコードと疑似負荷の証拠は基点の PR #88 を参照。

## 実機検証前の必要作業

1. 費用と外部公開の承認を得た隔離TESTサーバーでHTTPS/WSS/TURN/WHIPを構成する。
2. private永続ディスク上にSQLite状態を配置し、HAKU TEST Auth gatewayの再起動/運用を実環境で確認する。
3. SRS publish管理APIを内部専用に保ち、WHIP入口とHLSマニフェスト・セグメントに認可を設ける。
4. 本人iPhone、代理iPhone、別端末視聴者で停止・交代・権限失効・音声映像を実測する。

本番DB、Stripe、Connect、既存LiveKit、本番デプロイ、mainは変更しない。
