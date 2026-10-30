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

このコードは単一プロセスのメモリ内状態であり、再起動後の一日3回制限・grant失効状態を永続化しない。HAKU Authの本人確認、既存パフォーマーIDとの照合、非公開視聴のHLSセグメント認可、TLS、公開WHIP入口の遮断、SRS publisher切断の実環境確認が未完了。投げ銭・フォローは既存のパフォーマーIDへ紐付ける設計だが、今回のラボでは決済や本番データへ接続していない。

iPhone Safariのカメラ、バックグラウンド、再接続、H.264/AAC再生とQR実機操作は未検証。PR #88 の500疑似クライアント試験は localhost 10秒のHTTP/HLS測定であり、実機500人・1時間の証明ではない。

## ローカル検証

`node --test experiments/srs-crowd-lab/*.test.mjs` で、本人/代理権限、HTTP経由の一回限りWHIP、SRS切断確認、再利用拒否を検証する。TypeScript、Vitest、ビルドは独立GitHub Actionsで実施。SRS映像・音声の実デコードと疑似負荷の証拠は基点の PR #88 を参照。

## 実機検証前の必要作業

1. 費用と外部公開の承認を得た隔離TESTサーバーでHTTPS/WSS/TURN/WHIPを構成する。
2. HAKU TEST Authと出演者IDに結合した永続的なgrant・日次上限・room状態を実装する。
3. SRS publish管理APIを内部専用に保ち、WHIP入口とHLSマニフェスト・セグメントに認可を設ける。
4. 本人iPhone、代理iPhone、別端末視聴者で停止・交代・権限失効・音声映像を実測する。

本番DB、Stripe、Connect、既存LiveKit、本番デプロイ、mainは変更しない。
