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

SRS v6.0-r1（2026-08-12公開の安定版）を試作用に指定。Dockerのない環境のため、イメージ起動・動作検証は未実施。公式リリース: https://github.com/ossrs/srs/releases/tag/v6.0-r1

## 2026-10-29 ローカル検証記録

- `node --test experiments/ovh-srs-lab/*.test.mjs` と同等のローカル実行で **8/8テスト成功**。実HLSテストのみ `ffmpeg` が必要。
- 500個の仮想HLS視聴クライアントが、127.0.0.1上の合成HTTPサーバーからそれぞれ256バイトのダミーセグメントを取得（500/500、エラー0）。これは**負荷試験プログラム自体の動作確認**。
- **SRS実機の500人配信試験ではない**。転送したのは合計128,000バイトだけで、480pの継続映像や500Mbpsの帯域性能を再現していない。
- FFmpegで生成した**実際の480p H.264/AACのHLSセグメント**を、127.0.0.1の簡易HTTPサーバーから5クライアント（4.64MB）および50クライアント（46.4MB）へ配信し、いずれもエラー0、受信50/50を確認。これによりHLS負荷試験ツールの実データ受信を確認した。**SRSを使った配信でも、500人を配信した結果でもない。**
- この環境ではDockerが使用できず、SRSコンテナ起動は未検証。OVHcloud契約・課金・本番操作なし。
- 実VPSのベンチマーク、iPhone実機試験、認証付きWHIP配信は個別承認・環境確保後。

## 500クライアント・実HLSデータのローカル試験（2026-10-29）

- 実行: `HAKU_LOCAL_500_REAL_SMOKE=YES node experiments/ovh-srs-lab/hls-500-real-local-smoke.mjs`
- 配信元は **127.0.0.1** 上の一時的なNode.js HTTPサーバー。FFmpegが生成した8秒間の480p H.264/AACのHLSセグメント4個を固定で配布。OVHcloudや外部サイトへのアクセスなし。
- 500の疑似視聴クライアントが全員セグメント受信成功。500/500、合計2,000セグメント、463,514,000バイト、HTTPエラー0、実行15.002秒、リクエスト時間p95=970ms、全体平均転送約247.2Mbps。
- **この試験は500台のiPhoneによる連続LIVE視聴ではない。** 同じ4個の短いファイルを各クライアントが1回受信しただけ。実SRSの性能、約487.6Mbpsの持続配信、1時間の安定稼働、モバイル回線、WHIP入力、画質、映像再生、OVHcloudの実効帯域は**未検証**。
- 500クライアントの負荷は明示的な環境変数がないと実行できない。ローカル限定であり、有料VPSや本番サイトへ負荷をかける機能はない。

## ワンタップWHIP → HLS ローカル試作（2026-10-29追加）

今回、**「LIVE配信を開始」ボタンからカメラ/マイクを取得し、SRSのWHIP APIにSDPを送るブラウザ側のコード**を追加した。SRSがRTC→RTMP→HLSへ変換できるかを確認するための、別系統のローカルラボ。

- `compose-whip.yaml`: RTMP(1935)、WHIP API(1985)、HLS(8080)、WebRTC UDP(8000)をすべて127.0.0.1にだけ公開。RTC→RTMP変換とHLSを有効化する。
- `whip-publisher.mjs`: ワンタップ配信のブラウザ側実装。H.264優先、SDP交換、接続待機、失敗時のカメラ停止、バックグラウンド停止、終了時のWHIPリソース削除（対応サーバーのみ）を実装。**接続先はlocalhost/127.0.0.1のSRS試験URLだけに固定**し、実運用に使える秘密情報は持たない。
- `whip-local.html`: ローカルの配信開始・終了・HLS視聴ボタンを表示する画面。
- `whip-publisher.test.mjs`: SDP送信、エラー時停止、カメラ許可待ちの停止競合など5件の自動テスト（Node.js上のモック）。`node --test experiments/ovh-srs-lab/whip-publisher.test.mjs` で実行できる。

**ローカル起動手順（Dockerのある開発端末のみ）**

1. `docker compose -f experiments/ovh-srs-lab/compose-whip.yaml up -d`
2. リポジトリルートから `python3 -m http.server 4319 --bind 127.0.0.1`
3. 同じPCのブラウザで `http://127.0.0.1:4319/experiments/ovh-srs-lab/whip-local.html` を開き「LIVE配信を開始」を押す
4. 画面の「映像を読み込む」でHLS再生を確認し、終了ボタン・画面非表示でカメラが停止するか検証
5. `docker compose -f experiments/ovh-srs-lab/compose-whip.yaml down` で終了

**重要な未検証項目:** この実行環境にはDockerがなく、SRSを実際に起動したWHIP→HLSのE2Eは未実施。WebRTCのOpus音声をHLS互換AACへ変換できるか、H.264ネゴシエーション、iPhone Safari、外部携帯回線、認証・権限、TLS/HTTPS、QR代理配信、500人負荷は**未確認**。ローカルHTTP URLはiPhoneから使えず、iPhoneの実機テストには別途安全なHTTPS試験環境が必要。**このローカル構成を外部公開してはならない。**

参考: https://ossrs.io/lts/en-us/docs/v6/doc/webrtc / https://www.ossrs.net/lts/en-us/docs/v6/doc/hls

## 2026-10-29 追加実装・検証

- WHIP接続がLIVE開始後に `failed` になった場合、撮影者のカメラ/マイクを物理的に停止し、画面状態をエラーへ変更する。既存の「カメラ許可待ち中のキャンセル」「SDP処理中の停止」と合わせて競合テストを追加。
- `admission.mjs`: 500人視聴に必要な帯域をもとに、**実測済みの持続可能帯域**と35%の安全余裕を使って同時配信数を計算。実測値がない場合は配信容量を「0」として拒否する。公称2Gbpsを実測値の代わりにしない。
- 同時配信数は例として、実測1,000Mbpsなら最大1本、実測1,800Mbpsなら最大2本（1配信500人、映像800kbps+音声48kbps、通信余裕15%、安全余裕35%）。**試算であり、VPSの実測結果ではない。**
- ローカルNode.jsの自動テスト **18件すべて成功**（通信量計算4、疑似HLS 1、HLSローカル2、実HLS 1、帯域入場制御4、WHIP6）。実SRSサーバーや500人×60分の合格を意味しない。
- ブラウザ実機自動テストは、この実行環境のChromium管理ポリシーが127.0.0.1へのページアクセスを拒否したため未実施。制限を回避せず、Node.jsモックテストのみ実施した。
- SRS公式資料ではWebRTC→RTMPの音声AAC変換機能が説明されているが、現在の構成でのWHIP→HLS実動作は未検証。https://github.com/ossrs/srs/blob/develop/trunk/conf/full.conf

**注意:** `admission.mjs` は純粋な計画ロジックであり、本番の強制遮断機構ではない。実際の強制上限には共有DBの原子的予約・実メディア接続の停止・監視が必要。

## 次の試験ゲート

0. **費用発生前に承認が必要**。OVHcloudの最終購入画面における月額・初期費用・リージョン・契約期間・転送規約を確定し、ユーザーからその条件について個別承認を得る。現時点では契約していない。

1. VPS契約と負荷生成機の費用・請求上限・ネットワーク規約について**個別承認**を得る。
2. 別の承認済み試験端末群からHLS視聴を段階的に5→50→100→500と上げ、500人を連続60分維持できるか実測。視聴開始成功率99%以上、5分超の連続停止0、95パーセンタイル視聴開始10秒以内を合格目標にする。
3. CPU/メモリ/通信帯域、HTTP失敗率、HLS遅延、配信者側の上り、iPhone Safariで再接続を測定。数値未採取を「合格」と表記しない。
4. 合格後にHAKU DIRECTとCROWDの本人承認・QR・WHIP/WebRTC入力・HLS再生・投げ銭導線を**別の開発PR**で統合する。

既存のLiveKit/Stripe/Supabase/本番DB/本番デプロイは変更しない。従来のcompose.yamlはRTMP入力ラボ。新しいcompose-whip.yamlはWHIP入力を有効にしたローカル検証構成。ブラウザのワンタップWHIPクライアントは実装したが、SRS実接続、iPhone Safari、観客代理配信の本番統合は未実装。DockerがないためSRS実動作は未検証。
