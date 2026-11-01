# LIVE応援の遷移修正（#112から抽出）

本番/最新main基準: dbdb08db44ce03aa4ee4f14bad7323af33b0007c。
LIVE下部の応援のみ匿名ユーザーをauthへ送っていた。共通onTipを呼び、既存PlatformAppのTipScreenへ進む。出演者IDは既存stateで保持。右側とYouTube側は既にonTipであり変更不要。
iPhone縦画面の透明panel paddingはタップ透過、子要素は操作可能のままにする。
アプリ差分はLiveWatchScreen.tsxとlive.cssだけ。Stripe API/TipScreen/Webhook/DB/RLS/手数料/精算/送金に変更なし。#112の他変更は含めない。

検証:
- TypeScript成功、routing70テスト成功（追加16件: 合成4出演者×匿名/ログイン×LIVE/プロフィール、正しい出演者ID、auth非表示）。
- 本番build成功（既存chunk size警告）。
- WebKit iPhone13 touch: 56チェック成功。HARIBOW/PAUL/Other A/Other B合成fixture、匿名/ログイン、縦側面ボタン・横側面/下部ボタン・縦横プロフィール。実コンポーネントの金額選択と既存Checkoutリクエスト契約を検証。外部APIは隔離アダプタ、Checkoutはmock。
- 物理iPhone Safari/実映像/実決済は未検証。このPRはLIVEから既存金額選択への導線のみを対象とする。

静的QA Preview:
https://daidougei-haku-7xr7wa7cv-daidougei-s-projects.vercel.app
合成fixtureのみ。金額選択まで、決済ボタン無効。秘密鍵/環境ファイル/API/Functions/cronなし。CSPで外部通信禁止。
例: /?artist=HARIBOW&performer=11111111-1111-4111-8111-111111111111
ログインfixture: &signedIn=1 / プロフィール: &profile=1
vercel.jsonはこの修正ブランチのGit自動デプロイ抑止のみ追加（既存Production設定変更なし）。

本番DB/Stripe設定変更、実決済、送金、返金なし。
mainマージとProductionデプロイはそれぞれ承認後に最新SHA/CI/mainを再確認して行う。
#112の完全精算E2Eや漏えい一時Sandboxキー対応が完了したとは扱わない。
