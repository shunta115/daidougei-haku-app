# HAKU LIVE: OVHcloud + SRS 500視聴検証

状態: **準備のみ**。OVHcloud契約なし、500人負荷試験なし、本番接続なし。

## 契約前の判断

- OVHcloud欧州のVPS-3を候補とする。公式掲示価格は月$12.32から、6vCPU、12GB、2Gbps公称、対象地域の通信は無制限。契約期間・税・購入地域・規約・実際の帯域は注文前に確認する。
- **アジア拠点は今回不採用**。OVHcloud公式ページ間でアジア向け月間転送量の表記が食い違う。VPS製品ページではVPS-3は1TB、Unmetered VPSの説明ページではVPS-3は3TBと記載され、いずれも超過後10Mbps制限。契約画面の具体的商品・リージョン条件で確定するまで両方を未確定として扱う。500人×3時間×30日の約19.75TBにはいずれも不足。
- 500人×(映像800kbps+音声48kbps)×1.15 = **約487.6Mbps** の下り。1時間約219.42GB、1日3時間×30日なら約19.75TB（500人が常時見る極端な条件）。
- 20本同時の500人LIVEは約9.75Gbpsを要する。VPS-3単体の公称2Gbpsでは不可能。出演者数と同時配信数を分けて計算する。
- 料金や公称2Gbpsだけで500人成功とは判断しない。日本のiPhoneでの遅延・通信品質・CPU・帯域を実測する。

公式資料: https://www.ovhcloud.com/en/vps/ / https://www.ovhcloud.com/en/vps/unmetered-vps/ / https://github.com/ossrs/srs / https://ossrs.io/lts/en-us/docs/v6/doc/webrtc / https://www.ossrs.net/lts/en-us/docs/v6/doc/hls

## ローカル・非本番のSRS起動

このcomposeはRTMPとHTTPを127.0.0.1にバインドする。**認証・TLSがないため外部公開禁止。**

1. Dockerがある開発端末で `docker compose -f experiments/ovh-srs-lab/compose.yaml up -d`
2. 利用許諾を得たテスト映像をH.264/AACでRTMP送出。例: `ffmpeg -re -stream_loop -1 -i /path/to/authorized-test.mp4 -c:v libx264 -preset veryfast -b:v 800k -c:a aac -b:a 48k -f flv rtmp://127.0.0.1:1935/live/test`
3. `curl -f http://127.0.0.1:8080/live/test.m3u8` でHLSが出るか確認
4. `docker compose -f experiments/ovh-srs-lab/compose.yaml down` で終了

見積もりのみ: `node experiments/ovh-srs-lab/capacity.mjs --viewers=500 --simultaneous-streams=1`。

計算の自動テスト: `node --test experiments/ovh-srs-lab/capacity.test.mjs`（サーバーに通信しない）。

HLS視聴負荷試験用のローカル限定クライアント: `node experiments/ovh-srs-lab/hls-local-probe.mjs --url=http://127.0.0.1:8080/live/test.m3u8 --viewers=5 --seconds=10`。成功数、転送バイト数、エラー数、応答時間を記録する。自動テストは `node --test experiments/ovh-srs-lab/hls-local-probe.test.mjs`。500クライアントの検証プログラムとして準備したが、**現時点での通信先はループバックのみ**、5接続を超える場合は明示フラグが必要。実VPSへの500人相当の負荷は契約・許可・請求条件が確認できるまで行わない。合成HLSサーバーによるテストは実SRS・映像デコード・iPhone・実ネットワークを保証しない。

**ワンタップ配信への注意:** このcomposeはRTMP入力のみを確認する段階。iPhone Safariからの入力にはSRSのWHIP/WebRTC対応、HTTPS、UDP等の適切な通信設定、認証・権限管理、映像H.264/音声OpusからHLS向け音声への変換整合性を別途検証する。WHIP入力→HLS出力の成功は未確認。一般公開前には認証・停止機能とTLS・Firewallが必要。

SRS v6.0-r0を試作用に固定しているが、v6.0-r1が公開済み。運用用イメージの選定と差分検証は別工程。

## 次の試験ゲート

1. VPS契約と負荷生成機の費用・請求上限・ネットワーク規約について**個別承認**を得る。
2. 別の承認済み試験端末群からHLS視聴を段階的に5→50→100→500と上げ、500人を連続60分維持できるか実測。視聴開始成功率99%以上、5分超の連続停止0、95パーセンタイル視聴開始10秒以内を合格目標にする。
3. CPU/メモリ/通信帯域、HTTP失敗率、HLS遅延、配信者側の上り、iPhone Safariで再接続を測定。数値未採取を「合格」と表記しない。
4. 合格後にHAKU DIRECTとCROWDの本人承認・QR・WHIP/WebRTC入力・HLS再生・投げ銭導線を**別の開発PR**で統合する。

既存のLiveKit/Stripe/Supabase/本番DB/本番デプロイは変更しない。今回のComposeはRTMP入力ラボであり、iPhone Safariワンタップ配信や観客代理配信は未実装。Dockerもこの実行環境にないため、SRS実動作は未検証。
