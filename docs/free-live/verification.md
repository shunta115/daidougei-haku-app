# HAKU無料LIVE試作の検証結果

検証日: 2026-10-28 JST。ローカル隔離環境、main `e6fa7ab0` からの独立ブランチ。

|確認内容|結果|根拠と限界|
|---|---|---|
|既存アプリのTypeScript|成功|`npm run typecheck`|
|ビルド|成功|`npm run build`。既存の大きなchunk警告のみ。既存main/platformの生成asset hashは追加entryの修正中も維持|
|全Vitest|75ファイル、464件成功|既存の投票、送金、投げ銭、認証、LIVE等を含む。実Stripe/本番DBへの接続は使わない|
|新規ポリシー検証|20件成功|認証主体、承認、nonce/epoch/peer結合、QR失効、6人目拒否、交代ACK、失効後再利用拒否、日次上限、通報隔離、READ ONLY認証アダプター|
|HTTPの境界検証|3件成功|実ローカルHTTPで偽token・越権・Origin/Host不正を拒否。宛先IDのなりすましと旧信号を拒否|
|DIRECT開始|成功|偽カメラ/マイクの実MediaStreamTrack。取得640×360。ブラウザーの許可を自動許可したテスト|
|同時5人視聴|成功|別々の5 browser contextsで映像フレームを受信。受信は各320×180へ適応した。360p維持の保証ではない|
|音声|RTP受信を確認|受信側inbound音声bytes>0。実スピーカーから聞き取れるか、iPhoneの音声経路・音量・途切れは未確認|
|6人目|拒否成功|HTTP429、UIで5人上限を表示|
|視聴の再接続|成功|旧PeerConnectionのclosed、新しい接続のconnectedと映像受信を確認。席数は5のまま|
|QRからCROWD参加|成功|本人が事前許可・QR発行、観客fixtureが撮影/通信の同意後に交代待ち|
|カメラ交代|成功|旧カメラの全実trackがendedになった後、新撮影者が開始。5視聴者全員が別のvideo trackの映像を受信|
|本人の緊急停止|成功|観客のカメラと5視聴者の映像を閉じる。公式クライアントに限る|
|静的Preview相当のフォールバック|成功|APIが503の環境で端末内テストへ切替。5組のWebRTC loopbackで映像受信|
|通信量表示|成功|端末内テストで送信0.1MB、受信0.1MB、5接続の表示を確認。テスト終了直前の一時点で、携帯回線の消費量ではない|
|非表示時の同期停止|成功（合成イベント）|visibilitychangeを合成し、その同じJavaScript呼出し内にカメラ/マイクtrackがendedになることを確認。実iPhoneの画面ロックではない|
|390×844の横はみ出し|なし|DOMでscrollWidthを確認。実iPhone実機・日本語フォント・ノッチ/ツールバーの検証ではない|
|無料/大規模試算|288条件生成、288組合せの一意性を確認|動画/音声/通信余裕の仮定。料金プロバイダーの請求実測ではない|

ブラウザー: Playwright + Chromium 143（テスト用npm配布バイナリー）。ネットワーク隔離環境のloopbackだけで試すため `--allow-loopback-in-peer-connection` を指定し、STUNをテスト中だけ空にした。ブラウザーのWebセキュリティは無効化していない。偽カメラ/マイクを使い、外部へ映像を配信していない。

最終ブラウザー実行の要点は `artifacts/free-live/browser-evidence.json`。コードは `tests/browser/free-live-e2e.mjs` で再現できる。ローカルテストでは、交代時のheartbeat競合と、再接続前のSDP応答が新接続へ混入する問題を検出して修正した。

## 公開までに残っていること

1. 一般公開基盤の商用利用条件・強制的な請求遮断・残り枠の確認。Vercel現契約はHobbyのため採用しない。所有者のみの別端末接続用Previewは発行済み（下記）。
2. 非本番での本物のHAKU認証・フォロー・通報・投げ銭画面接続。現在のボタンは接続説明のみで、決済も保存もしない。
3. 試作D1には永続的で原子的な権限ストアを実装済み。一般公開に向けた低負担のシグナリングと、停止時に配信経路を強制制御する構成は未実装。ローカルMapをserverlessで共有しない。
4. iPhone Safari実機、別端末、Wi-Fi↔4G/5G、TURNが必要な回線、電池/発熱、1時間連続配信。
5. カメラ許可の拒否・取消、画面ロック、着信、Safari強制終了、QR期限切れを実機で確認。
6. 不正クライアントのP2P通信を中央強制停止できない制約と、通報審査・肖像/プライバシーの現場運用を解消/合意すること。

## 端末確認サイトの追加検証（2026-10-28 JST）

この節はPrototype 01の記録。現行のPrototype 02は次の節に記載する。

URL: https://haku-live-device-check.eb-shimada409.chatgpt.site/

- HAKUとは独立した所有者のみのSites静的サイトとして発行。ネイティブdeployment結果は `succeeded`。HTTPSのURLで所有者ログインのゲートを実ブラウザーから確認した。
- 静的サイトにはAPIの初期接続をしないdevice-onlyガードと、CSP `connect-src 'none'` を設定。静的サイト用のビルドスクリプトを追加した。
- managed previewの実ブラウザーで日本語の画面表示、本人/観客タブ切替、同意なし開始の拒否、HTTPでカメラが使えない場合のHTTPS案内を確認。HTTPプレビューでcrypto.randomUUIDが使えず画面が白くなる問題と、インラインJSの置換文字列がHTMLを壊す問題を修正した。
- 権限拒否・カメラなし・他アプリの利用競合を日本語で案内。端末確認版の通報ボタンはカメラを止め、通報未送信を表示。投げ銭とフォローも未接続と明記する。
- 所有者ログイン後のHTTPSカメラと5接続は、この追加確認では未検証。iPhone実機・別端末配信の結果として扱わない。既存の偽デバイスによるloopback検証は上表の範囲。

この確認サイトはSites側の区分ではproduction deploymentになるが、HAKUの本番アプリを公開/変更したものではない。今回、HAKU本番DB変更・migration・mainマージ・HAKU本番deploy・Stripe決済/送金/返金・有料契約・課金設定変更・LiveKit Egress・本番シークレット取得/外部送信は実施していない。既存AWP2026のデータは変更していない。

## Prototype 02: 別端末の接続管理（2026-10-28 JST）

最新版: https://haku-live-device-check.eb-shimada409.chatgpt.site/haku-free-live

|確認|結果と範囲|
|---|---|
|HAKUの全Vitest|76ファイル/473件成功。追加9件は実SQLiteを使ったSites adapterの権限・同時更新・失効・再試行・日次上限の検証|
|型とビルド|HAKUのtypecheck/build、SitesのTypeScriptとVinext buildが成功|
|実Miniflare D1 binding|27操作の接続管理フローが成功。5席、6人目拒否、QR参加、交代ACK、終了後のgrant拒否を確認。映像・音声はこの検証に含めない|
|Viewer→カメラ交代|同じ撮影者の古い視聴席を消し、自分への配信接続ができないことをSQLiteテストで確認|
|公開先の独立D1|health API 200、persistent=true。テスト専用の新しい表のみ。HAKU/Supabaseへ接続していない|
|公開先の認証境界|Sitesのサービスアクセスだけでは訪問者IDを取得せず、通常APIは401。ブラウザーからの所有者ログインゲートも確認|
|公開HTML|Cloudflareのcanonical redirect後のHTMLが、pushしたsourceの生成物とSHA-256で一致。hosted-labガードを確認|
|managed preview|日本語の表示と、訪問者ログインが確認できない場合にLIVE開始を無効にすることを確認。弱い接続IDへの代替はしない|
|上限|同時1配信、視聴5人、1回15分、1日10,000操作。追加購入・有料経路への切替は実装しない|
|実機|iPhone同士、携帯回線、音声の聞き取り、発熱、画面ロックの実機テストは未実施|

公開先の検証記録は `artifacts/free-live/sites-hosted-evidence.json`。sourceはSites側のGit commit `76bb67bb376bce08f454bd5b5f54fa7fd639ee2e` に保存。Prototype 01の端末内画面も `/device-check` に保全した。今回の一般公開・本物のHAKU認証・投げ銭/フォロー接続は未実施。

D1再現用コードは `tests/browser/free-live-d1.mjs`。Wrangler/Miniflareが入った独立Sites checkoutから `node --import ./scripts/sites-env.mjs /absolute/haku-repo/tests/browser/free-live-d1.mjs /absolute/sites-checkout` で使える。HAKUの依存追加は不要で、本番D1やSupabaseには接続しない。
