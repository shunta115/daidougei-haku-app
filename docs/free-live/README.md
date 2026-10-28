# HAKU DIRECT / CROWD LIVE 無料配信試作

2026-10-28 JST。基点: main `e6fa7ab0730c72f98f073492170cdeed0a3dd04f`。開発ブランチ: `codex/haku-free-live-20261028`。

## 結論と今回の到達点

全国規模の配信を、運営費0円・外部アカウント不要・iPhone Safari・安定接続のすべてを保証して提供できる方式は、今回確認した資料と環境では確立できていない。今回選んだのは **最大5視聴・360pを目標にしたWebRTC P2P**。ローカル試作に加え、所有者限定の独立Previewに接続管理を実装した。映像中継事業者を呼ばないので、その映像中継料金は0円。認証、シグナリング、Web配信の全国運用まで追加費用0円になったという意味ではない。

LiveKit Buildの無料枠は公式に強制上限が記載されており、超過で新規リクエストが拒否される。既存のHAKU実装を再利用できる有力な別案だが、既存プロジェクトの契約プラン、残り枠、他用途と共有している消費量を確認できていないため、今回の試作から接続していない。無料プロジェクトを増設して枠を水増しする運用は行わない。

## 既存コード監査

|対象|確認した実装|今回の扱い|
|---|---|---|
|本人配信|`src/platform/screens/PerformerLiveScreen.tsx`, `src/platform/lib/livekit.ts`|既存LiveKit配信を維持。独立entryのみ追加|
|配信権限|`api/livekit/token.ts`|本人ID一致、承認、profiles.status=activeを確認。既存APIは代理配信を許可しない|
|トークン/部屋|`api/livekit/_shared.ts`、既存token API|mainは出演者ごとの固定room。CROWDの権限をここに無理に追加しない|
|視聴|`src/platform/screens/LiveWatchScreen.tsx`|既存の映像、コメント、ギフト、フォローを維持|
|投げ銭|`src/app/routes.ts` の `openTip` → `/live?tipTo=出演者ID`、`TipScreen.tsx`|再利用先を確認。試作のボタンは接続説明のみで、決済画面へ遷移しない|
|フォロー|`src/platform/lib/api.ts` の `follow` / `unfollow`、`follows`|再利用先を確認。試作は保存しない|
|通報|同ファイルの `createReport`、`reports`|既存機能を確認。試作内で隔離停止し、独立D1に限定した記録を保存。本番reports未接続|
|認証|Supabase `auth.getUser()`、profiles、performers|READ ONLY認証アダプターを追加。実アカウント接続は未実施|
|Stripe/Connect|既存tip API、台帳・送金コード|読取による依存確認のみ。API実行、送金、返金、設定変更なし|
|DB|既存スキーマ/コード|HAKU/Supabaseのmigration追加・適用なし。Preview専用の独立D1に1表追加。HAKU本番DBへの接続・書込なし|
|Vercel|既存Vite/Preview構成|このブランチの自動deploymentのみ無効化。mainや他ブランチの設定は変えない|

未統合PR #81（カメラ）、#83（UI）、#84（安全停止）、#86（統合TEST）をGitHubで確認。今回はmainから独立させ、それらの差分を取り込まず、既存画面を上書きしていない。Egressを含む #70/#71 は取り込まない。

## 最新公式資料による技術比較

|方式|実際に無料になる範囲|超過・強制遮断|HAKUへの適合と判断|
|---|---|---|---|
|WebRTC P2P、TURNなし|映像を端末間で直接送るため映像中継事業者の請求なし|有料経路自体を設定しない。アプリで視聴5席を上限にする|今回の試作。配信者の上り・CPU・電池負担が人数比例。携帯NAT/企業回線では接続できない場合がある|
|外部サービスを一切使わないP2P|同一LAN/到達可能な回線で直接接続できる場合|STUNも設定しない構成は可能だが、到達性がさらに低下|全国の携帯回線へ安定提供する構成にはならない。認証・シグナリング用サーバーは依然必要|
|Sites + D1（今回の非公開Preview）|現在の対象ChatGPTプランに含まれるbeta内の試用。媒体はP2Pで中継しない|追加購入・有料利用の有効化なし。アプリ側で1回15分・1日10,000操作を制限。これは事業者側の請求ハードキャップとは別|所有者の端末だけで試す環境に限定。全国運用・無料アカウント不要・無制限無料の基盤とは扱わない|
|Cloudflare Realtime SFU|月間SFU/TURN合算の最初の1,000GB。SFUへの上りは無料|超過は$0.05/GB。公式SFU資料で請求0円のサービス側ハードキャップを確認できない|未採用。発行停止やブラウザのgetStats監視だけでは既存接続・不正クライアントの超過を確実に遮断できない|
|Cloudflare STUN|公式FAQで無料・無制限と明記|映像中継ではなく接続候補の取得だけ|ローカル試作の通常接続設定に使用。TURNは設定しない。自前STUNなら外部依存を減らせるがサーバー費が必要|
|LiveKit Cloud Build|月5,000参加者分、下り50GB、同時100接続、$0固定費|無料枠はハードキャップ。上限後は新規要求拒否。既に接続した全セッションの瞬時停止まで資料は保証しない|少量TESTの候補。既存契約が無料Buildであると確認できた場合に限定。残り枠・共有利用も要確認|
|LiveKit Ship / Scale|Ship $50/月、150,000分/250GB。Scale $500/月、1,500,000分/3TB|超過従量。Ship $0.0005/分+$0.12/GB、Scale $0.0004/分+$0.10/GB|0円条件で不採用。契約・変更なし|
|LiveKit/mediasoup等の自前SFU|ソフトウェアのライセンスは無料|サーバー、下り帯域、TURN、運用保守費は別|既存の無償サーバー/帯域の証拠がなく、完全無料とは扱わない。Vercel FunctionsにSFUを置く設計にもしていない|
|Daily|月10,000参加者分の無料枠。動画の標準単価は$0.004/参加者分（段階割引あり）|料金表に超過従量。今回、請求0円ハードキャップの確認はできない|0円を保証する主系として選ばない|
|100ms|RTC 10,000分、HLS視聴10,000分、HLS encoding 1,000分など|公式FAQは枠消化後にinvoice生成と記載。HDの無料適用制限もある|0円を保証する主系として選ばない|
|Twitch等の無料外部LIVE|公式Twitch LIVEの埋め込みは可能|配信者アカウントと配信開始経路、サービス規約に依存|「観客がSafariのHAKUボタンだけで代理配信」の代替とはならない|
|TikTok LIVE等|既存配信の外部視聴導線は候補|埋め込み、配信者資格、API権限は別問題|今回のブラウザ直接配信の代替にしない。非公式映像抽出・外部アカウント共用はしない|

「Egress」という料金表の一般的な下り通信と、**禁止されたLiveKit Egress製品**は別。本試作はLiveKit Egress API・録画・RTMP出力を一切実行しない。

## 通信量と費用の計算

全288組合せ: [一覧表](simulation-matrix.md)、[機械可読データ](simulation-288.json)、[再生成スクリプト](../../scripts/simulate-free-live.mjs)。出演者20/100/1,000人、1日1/3時間、月15/30日、各LIVEの同時視聴5/10/50/100/500/1,000/5,000/10,000人、360p/480p/720pをすべて収録した。

前提は固定ビットレートの計画値であり、画質名だけから通信量は決まらない。動画0.6/1.0/2.0Mbps、音声48/48/64kbps、通信余裕15%、十進GB。画角、動き、音声、パケット損失、再送で実測は変わる。仮の円換算は1USD=150円、税感度10%。現在の為替・請求税額ではない。

`B=(動画Mbps+音声Mbps)×1.15`、`1人1時間GB=B×0.45`。

`H=出演者数×1日配信時間×稼働日`、`参加者分=H×(視聴者+配信者1人)×60`。

SFUの出演者上りは `H×1人1時間GB`、SFU下りと視聴者の合計下りはその `視聴者数倍`。P2Pの出演者上りも視聴者数倍。TURN利用率0/10/100%の中継下りを別欄にした。Cloudflare SFUと同社TURN間は二重請求されない。独立TURNとSFUを混用する場合、無料1,000GBは共通なので二重に控除できない。

|画質|視聴者1人の下りGB/時|P2Pで5人へ送る上りMbps|P2P撮影者の送信GB/時|SFU撮影者の送信GB/時|
|---|---:|---:|---:|---:|
|360p|0.33534|3.726|1.6767|0.33534|
|480p|0.54234|6.026|2.7117|0.54234|
|720p|1.06812|11.868|5.3406|1.06812|

20人×1時間×15日だけでも、5人視聴で108,000参加者分。LiveKit Buildの5,000分を超える。5人を一定に保つ場合の無料枠で可能な合計配信は、360p/480pで全出演者合計約13.89時間/月、720pで約9.36時間/月（50GBが先に制約）。20人に均等配分なら前者は1人約41.7分/月。全出演者合計100接続なので、5人視聴+配信者1人の6接続なら同時16配信まで。

今回の指定条件でCloudflareの映像下りだけが1,000GB以内になるのは、20人×1時間×15日×5人視聴の360p（503.01GB）と480p（813.51GB）の2条件。前者でも認証・シグナリング・Web配信費は別、ハードキャップ未確認なので完全無料と判定しない。720pは同条件でも1,602.18GB、下り超過の参考額は$30.109/月（他費用別）。

接続管理も無料扱いしない。このローカル試作は1秒poll＋3秒renewalで、上記の最小条件をそのまま全国運用すると基本リクエストだけで月約864万件。仮に応答1KB/要求0.5KBなら応答8.64GB・要求4.32GB、別途認証/参加/SDP/再試行が増える。これは効率より検証を優先したローカル用プロトコルであり、現行Vercel/Supabaseの残り枠で吸収できると確認したものではない。公開設計では常時WebSocket/SSE等への変更とホスティングの請求遮断確認が必要。

## ローカル試作の仕様

- 本人の開始ボタン → カメラ/マイク許可 → 1人だけ配信。
- 本人の事前許可 → 5分有効のランダムQR。再発行は旧QR失効。payloadはURL fragmentに置き、Refererや通常HTTP URLログへ送らない。
- 観客の認証主体・peer ID・nonce・セッションepochを結び付ける一度限りの配信grant。初回撮影者は本人の事前許可範囲で開始し、追加撮影者は最大10人の交代待ち。
- 本人が次の撮影者を選択 → 旧カメラ停止・ACK → 次のgrant発行 → 次の撮影者がタップして開始。ACKが来なければ12秒でセッション終了。映像を重ねて無停止切替する設計ではない。
- WebRTCは片方向、視聴者のカメラ/マイク取得なし。SFU/TURN SDKなし。H.264を優先し、動画上限600kbps、音声48kbpsを要求。画質の維持は保証しない。
- 最大5視聴peerをサーバーで原子的に受付。6人目を拒否。退出・期限切れで席を解放。5人はアカウント数ではなく接続枠。
- 接続世代IDを照合し、再接続前のSDP応答を拒否。視聴者は明示的に再接続可能。配信者の切断復旧は自動でカメラを再開せず、新しいセッションを開始する。
- visibilitychange/pagehideは実トラックを同期停止。カメラ許可待ちの間に非表示になっても、後から取得したトラックを停止。
- 配信leaseは12秒、3秒ごとに更新。サーバー1秒tickで期限処理。通常実行中のクライアントは自身の期限切れでも停止。OS強制終了時の固定秒数保証ではない。
- 最長60分、全ルーム合計1日18,000参加者秒、最大20ルーム。これらは試作用安全上限で、料金プロバイダーの請求遮断ではない。サーバー再起動で計数はリセットされる。
- 端末getStatsの送受信bytesを表示。対応ブラウザではtransport bytes、それ以外はRTP+header bytes。切断前の最終サンプリング後の少量は欠落しうる。通信会社の請求値ではない。1.5GBの送信観測で端末を停止するが、悪意あるクライアントへの強制課金制御ではない。
- 通報はローカルルームを直ちに隔離停止。実運用の審査キュー、異議申立て、記録の保全、運営担当者による対応は未接続。

## 安全性と未完了の境界

ローカルサーバーは127.0.0.1にだけbindし、HostとOriginを確認する。テスト利用者選択はローカルfixtureであり本人確認ではない。本番モードやVercelでは起動を拒否する。Mapの権限状態をVercel Functionsへ移してはいけない（インスタンス間で共有できず排他・失効が壊れる）。

`haku-auth.mjs` は本物のSupabaseトークンをauth.getUser相当のGETで確認し、profiles.status/role、performers.is_approvedをGETするREAD ONLYアダプター。匿名ユーザーを拒否し、user_metadataのroleは使わない。検証はモック応答のみで、TEST/本番Supabaseへは未接続。認証の再検証頻度、失効・アカウント停止連携も運用設計が必要。

**P2Pの根本的制約:** 配信者と視聴者が両方とも改造クライアントを使えば、シグナリングサーバーは成立済み端末間通信を物理的に切断できない。公式クライアントは失効・緊急停止で閉じるが、悪意ある端末の完全遮断を保証しない。録画やスクリーンショットも阻止できない。強い中央強制停止が必要な公開運用では、ハードキャップを確認したSFUと永続的で原子的な権限管理が必要。今回のP2Pをそのまま一般公開しない。

QRの期限・推測耐性・回数制限は悪用を減らすが、会場内にいる証明にはならない。コピーされた有効QRの利用、複数アカウント、通報による妨害への対策には、本人の個別承認/allowlistや現場の運用を組み合わせる。人物が判別できる撮影・音声について、ステージと会場側の許可、周囲の人への案内、未成年の扱いを検討する。顔を自動でぼかす機能やAIによる不適切映像検出は実装していない。法的適合性の判定は行っていない。

## 起動と検証

Node.js 24、既存lockfileで `npm ci` → `npm run build` → `node experiments/free-live/server.mjs`。同じPCで `http://127.0.0.1:4319/haku-free-live.html` を開く。本人用画面で開始し、視聴用リンクを別ブラウザ利用者で開く。CROWD QRもlocalhost用なので、別のiPhoneへ読み込んでも接続できない。

`npx vitest run tests/free-live-policy.test.ts tests/free-live-http.test.ts` は権限・失効・交代・上限とHTTP境界を確認する。`node tests/browser/free-live-e2e.mjs` はPlaywright Chromiumが必要。環境にPlaywrightがなければ検証用に用意し、ブラウザーをインストールしてから実行する。本番用dependenciesは追加していない。

ブラウザー検証は同じホストの独立contextと偽カメラ/マイク、STUNなし・loopback候補許可で実行する。これは携帯回線のNAT越えやiPhone実機テストではない。検証結果の詳細は [verification.md](verification.md)。

## iPhone Preview（Prototype 02）

`/haku-free-live.html` は独立entry。権限サーバーがない環境では端末カメラと5受信のloopbackテストだけに切り替わり、実配信とは明確に区別する。公開側の `api/free-live.ts` は503で拒否し、本番DB、Stripe、LiveKitには接続しない。

2026-10-28 JST追記: VercelのGit接続情報の読取APIで、既存HAKUプロジェクトを含むチームの契約が **Hobby** と確認できた。Hobbyは非商用利用向けなので、HAKUの確認サイトには使用しない。残り枠や商用利用の承認を確認したものではなく、プラン変更もしない。このブランチのVercel自動deploymentは引き続き `vercel.json` のbranch限定falseで停止している。

**非公開LIVEテストURL（本人のみ）:** https://haku-live-device-check.eb-shimada409.chatgpt.site/haku-free-live

HAKUから独立したSitesの所有者限定サイト。現在のChatGPTプランに含まれるSitesを使い、追加契約・クレジット購入・従量課金の有効化は行っていない。Sites上のdeployment区分はproductionだが、HAKUの本番サイト・DB・決済・認証とは接続しない。Preview専用のD1を追加し、同じ所有者の端末間で配信・視聴・QR参加・交代を試す接続管理を実装した。Sitesの将来の料金や無制限運用を保証するものではない。プランの制限に達した場合に購入して続行しない。

上限は **同時1配信・視聴5人・1回15分**。日次10,000操作、18,000参加者秒、20テストセッション、12秒の配信leaseを設定した。媒体はP2Pで、TURN/SFU/録画/Egressは使わない。5視聴へ360pの目安は配信者の送信約0.42GB/15分。携帯NAT等で直接接続できない場合は有料中継へ切り替えず失敗する。

`experiments/free-live/sites-controller.mjs` はSitesが渡すログインIDをハッシュ化して所有者を結合し、テスト役割のsessionを端末IDと結合する。**HAKUの本物のパフォーマー認証ではない。** 全端末で同じ所有者のChatGPTログインが必要で、他人への公開・アカウント共用の運用には使わない。役割選択はこの閉じた環境だけのシミュレーションである。

権限状態、QR、nonce、視聴席、メッセージ、使用上限をD1の版番号付きsnapshotにまとめ、比較更新が成功した場合だけ応答を確定する。別Workerからの同時要求でも席数や失効を守る。再試行IDを結合し、同じ操作の再実行や終了後の古い成功応答を拒否する。MapをWorker間で共有しない。SQLは別の試作DB専用で、HAKUのmigrationではない。

### iPhoneでの確認手順

1. 自分の2台の端末で、先に同じ所有者のChatGPTアカウントから上記URLへログインする。初回ログインでQRのfragmentが失われる場合は、ログイン後にQRを読み直す。
2. 配信側で「LIVE配信を開始する」を押し、カメラ・マイクを許可する。表示された**視聴用QR**をもう1台で読み、「LIVEを見る」を押す。音声は「音声をONにする」で有効にする。
3. CROWDは本人側の「観客カメラを許可してQR発行」を押し、もう1台で**観客用QR**を読む。撮影・通信の同意後に開始を押す。本人が配信中なら交代待ちになり、本人側で「撮影者1にカメラ交代」を選ぶ。旧カメラの停止ACKの後、新しい撮影者が開始する。
4. 本人側の緊急停止、観客の停止、画面ロック、着信、アプリ切替で映像が止まり、勝手に再開しないことを確認する。

投げ銭・フォローは未接続で決済・保存しない。通報は試作内だけを停止し、独立D1に限定して記録する。運営への通知や本番通報台帳との連携は未実装。映像・音声を保存しないが、接続IPを含み得るSDPと期限付きsessionが試作用状態に入る。期限切れ状態は次の要求で掃除するため、指定秒数で物理消去されると保証しない。

従来の端末内テストは同じサイトの `/device-check` に残した。`node scripts/build-free-live-device.mjs /absolute/output/index.html` はAPIを呼ばないdevice-only版（CSP `connect-src 'none'`）、明示的に `--hosted` を付けた場合だけ同一originの試作APIへ接続する版を生成する。HAKUの環境変数・本番SDK・本番シークレットは使わない。

接続管理はSQLiteとMiniflare D1で検証し、公開先D1のhealth成功・ログインIDなしAPIの401・配信済みHTMLとsourceの一致を確認した。**所有者ログイン後のHTTPS映像・音声、iPhone実機、別回線でのMediaStream受信は未検証。** 全国公開には本物のHAKU認証、事業者側の費用遮断、強い停止制御、通報運用の整備が残る。

公式資料: [Vercel Hobby](https://vercel.com/docs/plans/hobby)、[商用利用の制約](https://vercel.com/docs/limits/fair-use-guidelines)、[ChatGPT Sitesの料金説明](https://learn.chatgpt.com/docs/pricing)。契約プランの確認は接続済みアカウントの読取結果による。

## 公式ソース

参照日: 2026-10-28 JST。

- https://webrtc.org/getting-started/peer-connections
- https://webrtc.org/getting-started/turn-server
- https://developers.cloudflare.com/realtime/sfu/platform/pricing/
- https://developers.cloudflare.com/realtime/sfu/platform/limits/
- https://developers.cloudflare.com/realtime/turn/faq/
- https://livekit.com/pricing
- https://docs.livekit.io/deploy/admin/quotas-and-limits/
- https://docs.livekit.io/deploy/admin/billing/
- https://mediasoup.org/documentation/v3/
- https://www.daily.co/pricing/video-sdk/
- https://www.100ms.live/pricing
- https://www.100ms.live/docs/flutter/v2/how-to-guides/debugging/faq
- https://dev.twitch.tv/docs/embed/video-and-clips/
- https://developer.apple.com/documentation/webkit/delivering-video-content-for-safari
- https://webkit.org/blog/7763/a-closer-look-into-webrtc/
- https://supabase.com/changelog.md
- https://supabase.com/docs/reference/javascript/auth-getuser
- https://vercel.com/docs/project-configuration/git-configuration
- https://vercel.com/docs/spend-management
- https://vercel.com/docs/plans/hobby
- https://developers.cloudflare.com/d1/worker-api/d1-database/
- https://developers.cloudflare.com/d1/worker-api/prepared-statements/
- https://learn.chatgpt.com/docs/pricing

Stripe Directoryも試したが、CLI pluginの起動に必要なUnix socketが環境で拒否され検索を完了できなかった。上記は各社の公式資料を直接確認した比較で、Directoryでプロバイダーの選定・契約をしたものではない。
